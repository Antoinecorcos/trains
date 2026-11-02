// Simulation déterministe de la conduite (pas fixe de 1/60 s).
// Même code pour le joueur, le conducteur titulaire (IA) et, plus tard, la vérification serveur.

import { buildMission, SERIES, PLATFORM, TRAIN_LEN } from './route.js';

export const DT = 1 / 60;
const LINE_LIMIT = 100;
const STOP_WINDOW = [-25, 6];
const FU = 2.6; // freinage d'urgence (m/s²)

export const GRADES = [
  { id: 'parfait', label: 'PARFAIT', max: 0.5, pts: 500 },
  { id: 'super', label: 'SUPER', max: 1.5, pts: 350 },
  { id: 'bien', label: 'BIEN', max: 4, pts: 200 },
  { id: 'ok', label: 'OK', max: 10, pts: 80 },
  { id: 'loin', label: 'LOIN', max: 99, pts: 30 },
];

export function createRun(mission, opts = {}) {
  const m = buildMission(mission);
  const serie = SERIES['Z 2N'];
  const r = {
    m,
    serie,
    t: 0,
    step: 0,
    x: m.start,
    v: 0,
    a: 0,
    lever: 0,
    phase: 'run',
    stopI: 0,
    sched: opts.sched ?? null,
    depAt: 0,
    signals: m.signals.map((s) => ({ ...s, state: 'red', timer: null })),
    animals: m.animals.map((a) => ({ ...a, state: 'track', waited: 0, fleeT: 0 })),
    works: m.works.map((w) => ({ ...w, warned: false, missed: false })),
    passed: new Set(),
    doors: null,
    kvb: false,
    overspeed: false,
    slip: false,
    hornT: 0,
    score: 0,
    parts: { precision: 0, punct: 0, doors: 0, bonus: 0, penalty: 0 },
    combo: 0,
    bestCombo: 0,
    grades: [],
    arrivals: [],
    stats: { overspeedT: 0, kvb: 0, spad: 0, hits: 0, slips: 0, missed: 0 },
    comfort: 100,
    frames: [],
    events: [],
    over: false,
    tutorial: !!mission.tutorial,
    tips: {},
  };
  r.depAt = 0;
  return r;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export function limitAt(r, x) {
  let l = LINE_LIMIT;
  for (const z of r.m.limits) if (x >= z.from && x <= z.to + TRAIN_LEN * 0.5) l = Math.min(l, z.kmh);
  return l;
}

export function nextLimit(r) {
  let best = null;
  for (const z of r.m.limits) {
    const d = z.from - r.x;
    if (d > 0 && d < 500 && (!best || d < best.d)) best = { d, kmh: z.kmh, why: z.why };
  }
  return best;
}

export const nextStop = (r) => r.m.stops[r.stopI] ?? null;

export function nextSignal(r) {
  let best = null;
  for (const s of r.signals) {
    const d = s.x - r.x;
    if (d > -5 && (!best || d < best.d)) best = { d, s };
  }
  return best;
}

export function adhesionAt(r, x) {
  let a = r.m.weather === 'rain' ? 0.72 : 1;
  for (const z of r.m.leaves) if (x >= z.from && x <= z.to) a = Math.min(a, 0.45);
  return a;
}

export const clockAt = (r) => r.m.clock[0] * 3600 + r.m.clock[1] * 60 + r.t;
export const schedArr = (r, i) => (r.sched ? r.sched.arr[i] : null);

// Écart horaire projeté vers le prochain arrêt (s) : positif = en retard
export function projectedGap(r) {
  const s = nextStop(r);
  if (!s || !r.sched) return 0;
  const d = Math.max(0, s.x - r.x);
  const v = Math.max(r.v, 8);
  return r.t + d / v - r.sched.arr[r.stopI];
}

// ---------------------------------------------------------------------------
// Pas de simulation
// ---------------------------------------------------------------------------

function emit(r, ev) { r.events.push(ev); }

function add(r, part, pts, ev) {
  r.parts[part] += pts;
  r.score += pts;
  if (ev) emit(r, { ...ev, pts });
}

export function step(r, input = {}) {
  if (r.over) return;
  r.t += DT;
  r.step++;
  if (input.lever != null) r.lever = Math.max(-1, Math.min(1, input.lever));
  const hornEdge = !!input.horn;
  if (hornEdge) r.hornT = r.t;

  if (r.phase === 'doors') {
    updateDoors(r, input);
  } else if (r.phase === 'run') {
    drive(r, hornEdge);
  } else if (r.phase === 'arrived' && r.t > r.endAt) {
    finish(r);
  }

  if (r.step % 6 === 0) r.frames.push(Math.round(r.x * 10) / 10);
}

function drive(r, hornEdge) {
  const { serie } = r;
  const limit = limitAt(r, r.x) / 3.6;
  const adh = adhesionAt(r, r.x);
  const cap = 1.6 * adh;

  // Contrôle de vitesse (KVB)
  if (r.v > limit + 10 / 3.6 && !r.kvb) {
    r.kvb = true;
    r.stats.kvb++;
    add(r, 'penalty', -300, { type: 'kvb', label: 'Survitesse : freinage d\'urgence' });
  }
  if (r.kvb && r.v <= limit - 5 / 3.6) r.kvb = false;
  const over = r.v > limit + 3 / 3.6;
  if (over) {
    r.stats.overspeedT += DT;
    r.parts.penalty -= 40 * DT;
    r.score -= 40 * DT;
  }
  if (over !== r.overspeed) { r.overspeed = over; emit(r, { type: over ? 'overspeed' : 'overspeedEnd' }); }

  // Départ verrouillé avant l'heure prévue
  const locked = r.sched && r.t < r.depAt;

  let lever = r.lever;
  if (r.kvb || r.spadT > r.t) lever = -1;
  let aT = 0;
  let aB = 0;
  if (lever > 0 && !locked) aT = lever * serie.accel * Math.min(1, 14 / Math.max(r.v, 1)) * (r.v < serie.vmax ? 1 : 0);
  if (lever < 0) aB = lever <= -0.92 ? FU : (-lever / 0.92) * serie.brake;

  let slip = false;
  if (aT > cap) { aT = cap * 0.7; slip = true; }
  if (aB > cap) { aB = cap * 0.8; slip = true; }
  if (slip && r.v > 0.5) {
    if (!r.slip && r.t - (r.slipEnd ?? -9) > 1.5) { r.stats.slips++; emit(r, { type: 'slip', brake: aB > 0 }); r.comfort -= 3; }
  }
  if (r.slip && !(slip && r.v > 0.5)) r.slipEnd = r.t;
  r.slip = slip && r.v > 0.5;

  const res = r.v > 0 ? 0.015 + 0.00035 * r.v * r.v : 0;
  const a = aT - aB - res;
  if (lever <= -0.92 && r.v > 0.5) r.comfort -= 2.2 * DT;
  if (Math.abs(a - r.a) / DT > 8 && r.v > 1) r.comfort -= 0.05;
  r.a = a;
  r.v = Math.max(0, r.v + a * DT);
  if (r.v === 0 && aT === 0) r.a = 0;
  const prevX = r.x;
  r.x += r.v * DT;

  // Signaux
  for (const s of r.signals) {
    if (s.state === 'red' && s.timer == null && s.x - r.x < 380) s.timer = r.t + s.hold;
    if (s.state === 'red' && s.timer != null && r.t >= s.timer) {
      s.state = 'green';
      emit(r, { type: 'signalClear' });
    }
    if (s.state === 'red' && prevX < s.x && r.x >= s.x) {
      r.stats.spad++;
      r.spadT = r.t + 4;
      s.state = 'green';
      add(r, 'penalty', -800, { type: 'spad', label: 'Franchissement de signal fermé' });
    }
  }

  // Animaux
  for (const an of r.animals) {
    if (an.state !== 'track') continue;
    const d = an.x - r.x;
    if (hornEdge && d > 25 && d < 230) {
      an.state = 'fled';
      an.fleeT = r.t;
      add(r, 'bonus', 100, { type: 'fled', label: 'Sanglier effrayé' });
    } else if (d < 1.5 && r.v > 0.8) {
      an.state = 'hit';
      an.fleeT = r.t;
      r.stats.hits++;
      r.spadT = r.t + 2.5;
      r.comfort -= 12;
      add(r, 'penalty', -400, { type: 'hit', label: 'Heurt d\'animal' });
    } else if (r.v === 0 && d > 0 && d < 80) {
      an.waited += DT;
      if (an.waited > 2.5) { an.state = 'fled'; an.fleeT = r.t; emit(r, { type: 'gone' }); }
    }
  }

  // Chantiers : prévenir les agents au klaxon
  for (const w of r.works) {
    if (!w.warned && hornEdge && r.x > w.from - 260 && r.x < w.to) {
      w.warned = true;
      add(r, 'bonus', 100, { type: 'warned', label: 'Agents prévenus' });
    }
    if (!w.warned && !w.missed && r.x >= w.from) {
      w.missed = true;
      add(r, 'penalty', -150, { type: 'penalty', label: 'Agents non prévenus' });
    }
  }

  // Arrêts non prévus (semi-direct)
  if (r.v === 0) {
    for (const p of r.m.passes) {
      if (!r.passed.has(p.k) && r.x > p.x - PLATFORM && r.x < p.x + 6) {
        r.passed.add(p.k);
        add(r, 'penalty', -200, { type: 'penalty', label: `Arrêt non prévu à ${p.name}` });
      }
    }
  }

  // Arrêt en gare
  const s = nextStop(r);
  if (!s) return;
  const d = r.x - s.x;
  if (r.v === 0 && r.lever <= 0) {
    if (d >= STOP_WINDOW[0] && d <= STOP_WINDOW[1]) arrive(r, s, d);
    else if (d > STOP_WINDOW[1]) {
      emit(r, { type: 'reverse', label: 'Arrêt dépassé : recul jusqu\'au repère' });
      r.t += 5;
      r.x = s.x;
      arrive(r, s, d);
    } else if (d > -PLATFORM && !r.tips.creep) {
      r.tips.creep = true;
      emit(r, { type: 'tip', id: 'creep' });
    }
  } else if (d > PLATFORM * 0.6) {
    r.stats.missed++;
    r.combo = 0;
    r.grades.push({ k: s.k, name: s.name, grade: 'rate', d: null, gap: null });
    add(r, 'penalty', -600, { type: 'missed', label: `Gare brûlée : ${s.name}` });
    r.stopI++;
    if (r.stopI >= r.m.stops.length) endRun(r);
  }
}

function arrive(r, s, d) {
  r.v = 0;
  r.a = 0;
  const ad = Math.abs(d);
  const g = d > STOP_WINDOW[1] ? { id: 'rate', label: 'DÉPASSÉ', pts: 0 } : GRADES.find((x) => ad <= x.max);
  if (g.id === 'parfait' || g.id === 'super') r.combo++;
  else r.combo = 0;
  r.bestCombo = Math.max(r.bestCombo, r.combo);
  const mult = r.combo >= 2 ? 1 + 0.25 * Math.min(r.combo - 1, 6) : 1;
  add(r, 'precision', Math.round(g.pts * mult), { type: 'grade', grade: g.id, label: g.label, d, combo: r.combo, mult });

  let gap = null;
  if (r.sched) {
    gap = r.t - r.sched.arr[r.stopI];
    let pts = 0;
    let label;
    if (gap < -2) { pts = 200; label = 'En avance'; }
    else if (gap <= 2) { pts = 300; label = 'Pile à l\'heure'; }
    else if (gap <= 6) { pts = 150; label = `+${Math.round(gap)} s`; }
    else if (gap <= 12) { pts = 50; label = `+${Math.round(gap)} s`; }
    else label = `Retard +${Math.round(gap)} s`;
    add(r, 'punct', pts, { type: 'punct', label, gap });
  }
  r.arrivals.push(r.t);
  r.grades.push({ k: s.k, name: s.name, grade: g.id, d, gap });

  const last = r.stopI === r.m.stops.length - 1;
  r.doors = {
    state: 'opening', t: r.t, pax: s.pax, boarded: 0, fullAt: null, last,
    runner: s.runner ? { state: 'waiting', appearAt: null, arriveAt: null } : null,
  };
  r.phase = 'doors';
  emit(r, { type: 'doorsOpen', last });
}

function updateDoors(r, input) {
  const dr = r.doors;
  const age = r.t - dr.t;
  if (dr.state === 'opening' && age > 0.6) { dr.state = 'open'; dr.t = r.t; }
  if (dr.state === 'open') {
    const rate = dr.last ? 40 : 16;
    dr.boarded = Math.min(dr.pax, dr.boarded + rate * DT);
    if (dr.boarded >= dr.pax && dr.fullAt == null) {
      dr.fullAt = r.t;
      if (!dr.last) emit(r, { type: 'boarded' });
    }
    const rn = dr.runner;
    if (rn && rn.state === 'waiting' && dr.boarded >= dr.pax * 0.55) {
      rn.state = 'running';
      rn.appearAt = r.t;
      rn.arriveAt = r.t + 2.4;
      emit(r, { type: 'runner' });
    }
    if (rn && rn.state === 'running' && r.t >= rn.arriveAt) {
      rn.state = 'boarded';
      dr.fullAt = r.t;
      add(r, 'bonus', 100, { type: 'bonus', label: 'Retardataire à bord' });
    }
    if (dr.last && dr.fullAt != null && r.t - dr.fullAt > 0.6) {
      r.phase = 'arrived';
      r.endAt = r.t + 1.2;
      emit(r, { type: 'terminus' });
      return;
    }
    if (input.close && !dr.last) closeDoors(r);
  }
  if (dr.state === 'closing' && r.t - dr.t > 0.8) {
    dr.state = 'closed';
    r.phase = 'run';
    r.stopI++;
    r.depAt = r.sched ? r.sched.dep[r.stopI - 1] : 0;
    emit(r, { type: 'doorsClosed' });
  }
}

function closeDoors(r) {
  const dr = r.doors;
  const left = dr.pax - dr.boarded;
  let pts;
  let label;
  if (dr.runner && dr.runner.state === 'running') {
    dr.runner.state = 'missed';
    add(r, 'penalty', -50, { type: 'penalty', label: 'Porte claquée au nez du retardataire' });
  }
  if (left > 0.5) { pts = -100 - Math.round(left * 4); label = `${Math.ceil(left)} voyageurs restés à quai`; }
  else {
    const wait = r.t - dr.fullAt;
    if (wait <= 1) { pts = 150; label = 'Portes pile'; }
    else if (wait <= 3) { pts = 80; label = 'Portes'; }
    else { pts = 0; label = 'Portes lentes'; }
  }
  add(r, 'doors', pts, { type: 'doors', label });
  dr.state = 'closing';
  dr.t = r.t;
  emit(r, { type: 'doorsClosing' });
}

function endRun(r) {
  r.phase = 'arrived';
  r.endAt = r.t + 1;
}

function finish(r) {
  r.over = true;
  r.phase = 'over';
  const comfortPts = Math.round(Math.max(0, r.comfort) * 3);
  add(r, 'bonus', comfortPts, null);
  r.comfortPts = comfortPts;
  r.result = result(r);
  emit(r, { type: 'over' });
}

export function result(r) {
  const n = r.m.stops.length;
  const ref = n * (500 + 300 + 150) + 300 + 100 * (r.m.animals.length + r.m.works.length);
  const score = Math.round(r.score);
  const stars = 1 + (score >= ref * 0.55 ? 1 : 0) + (score >= ref * 0.8 ? 1 : 0);
  return {
    score, stars, ref,
    time: r.t,
    parts: { ...r.parts },
    comfort: Math.max(0, Math.round(r.comfort)),
    bestCombo: r.bestCombo,
    grades: r.grades,
    stats: { ...r.stats },
  };
}

// ---------------------------------------------------------------------------
// Conducteur titulaire (IA) : sert à calculer l'horaire et de fantôme de référence
// ---------------------------------------------------------------------------

export function aiInput(r) {
  const input = { lever: 0 };
  if (r.phase === 'doors') {
    const dr = r.doors;
    const runnerPending = dr.runner && dr.runner.state !== 'boarded' && dr.runner.state !== 'missed';
    input.close = dr.state === 'open' && dr.fullAt != null && !runnerPending && r.t - dr.fullAt > 0.4;
    return input;
  }
  const b = Math.min(1.1, 1.6 * adhesionAt(r, r.x) * 0.6);
  const s = nextStop(r);
  let vt = limitAt(r, r.x) / 3.6 - 0.6;
  for (const z of r.m.limits) {
    const d = z.from - r.x;
    if (d > 0) vt = Math.min(vt, Math.sqrt((z.kmh / 3.6 - 0.6) ** 2 + 2 * b * d));
  }
  // Point d'arrêt visé : repère de la gare, ou signal fermé
  let stopD = s ? s.x - r.x : Infinity;
  for (const sg of r.signals) {
    const d = sg.x - r.x - 10;
    if (sg.state === 'red' && d > -10) stopD = Math.min(stopD, d);
  }
  for (const an of r.animals) {
    const d = an.x - r.x;
    if (an.state === 'track' && d < 200 && d > 30 && r.t - r.hornT > 1) input.horn = true;
  }
  for (const w of r.works) if (!w.warned && r.x > w.from - 240 && r.t - r.hornT > 1) input.horn = true;
  const need = stopD > 0.05 ? (r.v * r.v) / (2 * (stopD - 0.05)) : 99;
  if (stopD < 0.3 || need >= b) {
    input.lever = r.v < 0.05 ? -0.4 : -Math.min(0.9, (need / r.serie.brake) * 0.92);
    return input;
  }
  const err = vt - r.v;
  input.lever = err > 0 ? Math.min(1, err * 1.2) : Math.max(-0.8, err * 1.4);
  return input;
}

// Calcule l'horaire de la mission en faisant rouler le conducteur titulaire.
export function computeSchedule(mission) {
  const r = createRun(mission);
  let guard = 0;
  while (!r.over && guard++ < 60 * 900) {
    step(r, aiInput(r));
    r.events.length = 0;
  }
  const arr = r.arrivals.map((t, i) => Math.round((t * 1.05 + 1 + i * 0.5) * 10) / 10);
  const dep = arr.map((t, i) => t + 3 + (r.m.stops[i].pax / 16));
  return { arr, dep, frames: r.frames, aiTime: r.t, aiScore: Math.round(r.score) };
}
