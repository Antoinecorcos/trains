// Simulation déterministe de la conduite (pas fixe de 1/60 s).
// Même code pour le joueur, le conducteur titulaire (IA) et, plus tard, la vérification serveur.

import { buildMission, rameStats, inTunnel, MISSED_AFTER } from './route.js';

export const DT = 1 / 60;
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
  // Rame choisie (le défi du jour impose la sienne : tout le monde à armes égales)
  const pick = mission.fixedRame ? { id: mission.fixedRame, level: 1 } : (opts.rame ?? { id: 'Z2N', level: 1 });
  const serie = rameStats(pick.id, pick.level);
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
    alarms: m.alarms.map((a) => ({ ...a, state: 'idle', until: 0 })),
    crossings: m.crossings.map((c) => ({ ...c, done: false })),
    lives: mission.lives ?? null, // mode survie : la partie s'arrête à 0
    failed: false,
    announced: new Set(),
    passed: new Set(),
    passI: 0, // prochaine gare traversée sans arrêt (triées dans le sens de marche)
    doors: null,
    waitDoors: null, // instant où le train s'est immobilisé au repère, portes encore fermées
    reversedD: null,
    lights: false, // feux de route (pleins phares)
    lightsT: -9,
    darkT: 0,
    lightsWarn: false,
    dazzled: new Set(),
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
    stats: { overspeedT: 0, kvb: 0, spad: 0, hits: 0, slips: 0, missed: 0, darkT: 0, dazzle: 0 },
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
  let l = r.m.lineLimit ?? 100;
  for (const z of r.m.limits) if (x >= z.from && x <= z.to + r.m.trainLen * 0.5) l = Math.min(l, z.kmh);
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
  let a = r.m.weather === 'rain' ? 0.72 : r.m.weather === 'snow' ? 0.6 : 1;
  for (const z of r.m.leaves) if (x >= z.from && x <= z.to) a = Math.min(a, 0.45);
  return a;
}

// Phares : il fait sombre de nuit et dans les tunnels
export const darkAt = (r, x) => r.m.light < 0.3 || inTunnel(r.m.route, x);
// Le train entre en gare (ou longe le quai) : on repasse en feux de croisement pour ne pas éblouir
export function nearPlatform(r) {
  const s = nextStop(r);
  if (!s) return false;
  const d = s.x - r.x;
  return d < s.plat + 60 && d > -10;
}
// Ce que voudrait un bon conducteur : pleins phares dans le noir, sauf à quai
// Train qui arrive en face dans moins de 220 m (ou qui vient de passer)
export function crossingNear(r) {
  for (const c of r.crossings) if (!c.done && c.x - r.x < 220 && c.x - r.x > -20) return c;
  return null;
}
export const lightsWanted = (r) => darkAt(r, r.x) && !nearPlatform(r) && !crossingNear(r) && r.phase === 'run';

// Prochain arrêt réellement desservi (une gare évacuée se traverse sans s'arrêter)
export function nextServed(r) {
  for (let i = r.stopI; i < r.m.stops.length; i++) if (!r.m.stops[i].skip) return r.m.stops[i];
  return null;
}
export const activeAlarm = (r) => r.alarms.find((a) => a.state === 'active' || a.state === 'stopped') ?? null;

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

// Mode survie : une faute grave coûte une vie
function loseLife(r, why) {
  if (r.lives == null || r.failed) return;
  r.lives--;
  emit(r, { type: 'life', lives: r.lives, why });
  if (r.lives <= 0) {
    r.failed = true;
    emit(r, { type: 'failed' });
    endRun(r);
  }
}

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
  if (input.lights) { r.lights = !r.lights; r.lightsT = r.t; emit(r, { type: 'lights', on: r.lights }); }

  if (r.phase === 'doors') {
    updateDoors(r, input);
  } else if (r.phase === 'run') {
    drive(r, hornEdge, input);
  } else if (r.phase === 'arrived' && r.t > r.endAt) {
    finish(r);
  }

  if (r.step % 6 === 0) r.frames.push(Math.round(r.x * 10) / 10);
}

function drive(r, hornEdge, input = {}) {
  const { serie } = r;
  const limit = limitAt(r, r.x) / 3.6;
  const adh = adhesionAt(r, r.x);
  const cap = 1.6 * adh * serie.grip;

  // Contrôle de vitesse (KVB)
  if (r.v > limit + 10 / 3.6 && !r.kvb) {
    r.kvb = true;
    r.stats.kvb++;
    add(r, 'penalty', -300, { type: 'kvb', label: 'Survitesse : freinage d\'urgence' });
    loseLife(r, 'Survitesse');
  }
  if (r.kvb && r.v <= limit - 5 / 3.6) r.kvb = false;
  const over = r.v > limit + 3 / 3.6;
  if (over) {
    r.stats.overspeedT += DT;
    r.parts.penalty -= 40 * DT;
    r.score -= 40 * DT;
  }
  if (over !== r.overspeed) { r.overspeed = over; emit(r, { type: over ? 'overspeed' : 'overspeedEnd' }); }

  // Signal d'alarme : s'arrêter dans les 380 m, puis attendre la levée de doute
  for (const al of r.alarms) {
    if (al.state === 'idle' && r.x >= al.x) { al.state = 'active'; al.limit = al.x + 380; emit(r, { type: 'alarm' }); }
    if (al.state === 'active') {
      if (r.v === 0) {
        al.state = 'stopped';
        al.until = r.t + 8;
        add(r, 'bonus', 100, { type: 'bonus', label: 'Arrêt sur signal d\'alarme' });
      } else if (r.x > al.limit) {
        al.state = 'missed';
        add(r, 'penalty', -300, { type: 'penalty', label: 'Signal d\'alarme ignoré' });
        loseLife(r, 'Signal d\'alarme ignoré');
      }
    }
    if (al.state === 'stopped' && r.t >= al.until) { al.state = 'done'; emit(r, { type: 'alarmClear' }); }
  }

  // Départ verrouillé avant l'heure prévue (ou pendant la levée de doute d'un signal d'alarme)
  const locked = (r.sched && r.t < r.depAt) || r.alarms.some((a) => a.state === 'stopped');

  let lever = r.lever;
  if (r.kvb || r.spadT > r.t) lever = -1;
  let aT = 0;
  let aB = 0;
  // effort de traction à puissance constante au-delà de ~50 km/h (plus haut pour les rames rapides)
  const vBase = 14 * Math.max(1, serie.vmax / (120 / 3.6));
  if (lever > 0 && !locked) aT = lever * serie.accel * Math.min(1, vBase / Math.max(r.v, 1)) * (r.v < serie.vmax ? 1 : 0);
  if (lever < 0) aB = lever <= -0.92 ? FU : (-lever / 0.92) * serie.brake;

  let slip = false;
  if (aT > cap) { aT = cap * 0.7; slip = true; }
  if (aB > cap) { aB = cap * 0.8; slip = true; }
  if (slip && r.v > 0.5) {
    if (!r.slip && r.t - (r.slipEnd ?? -9) > 1.5) { r.stats.slips++; emit(r, { type: 'slip', brake: aB > 0 }); r.comfort -= 3; }
  }
  if (r.slip && !(slip && r.v > 0.5)) r.slipEnd = r.t;
  r.slip = slip && r.v > 0.5;

  const res = r.v > 0 ? 0.015 + 0.00022 * r.v * r.v : 0;
  const a = aT - aB - res;
  if (lever <= -0.92 && r.v > 0.5) r.comfort -= 2.2 * DT;
  if (Math.abs(a - r.a) / DT > 8 && r.v > 1) r.comfort -= 0.05;
  r.a = a;
  r.v = Math.max(0, r.v + a * DT);
  if (r.v === 0 && aT === 0) r.a = 0;
  const prevX = r.x;
  r.x += r.v * DT;

  // Phares : pleins phares dans le noir, code à l'approche des quais
  const dark = darkAt(r, r.x);
  const near = nearPlatform(r);
  if (r.v > 3 && dark && !near && !r.lights && !crossingNear(r)) {
    r.darkT += DT;
    if (r.darkT > 2.5) {
      r.stats.darkT += DT;
      r.parts.penalty -= 15 * DT;
      r.score -= 15 * DT;
      if (!r.lightsWarn) { r.lightsWarn = true; emit(r, { type: 'lightsNeeded' }); }
    }
  } else {
    r.darkT = 0;
    if (r.lightsWarn && (r.lights || !dark)) { r.lightsWarn = false; emit(r, { type: 'lightsOk' }); }
  }
  if (r.lights && near && r.v > 1 && !r.dazzled.has(r.stopI)) {
    const s0 = nextStop(r);
    if (s0.x - r.x < s0.plat) {
      r.dazzled.add(r.stopI);
      r.stats.dazzle++;
      add(r, 'penalty', -60, { type: 'penalty', label: 'Voyageurs éblouis : passe en code' });
    }
  }

  // Croisements : de nuit on passe en code, de jour un petit coup de klaxon pour saluer le collègue
  for (const c of r.crossings) {
    if (c.done || r.x < c.x) continue;
    c.done = true;
    const dk = darkAt(r, r.x);
    if (dk && r.lights) add(r, 'penalty', -80, { type: 'penalty', label: 'Conducteur d\'en face ébloui' });
    else if (dk) add(r, 'bonus', 40, { type: 'crossing', label: 'Croisement en code' });
    else if (r.t - r.hornT < 4) add(r, 'bonus', 30, { type: 'crossing', label: 'Salut au collègue' });
    else emit(r, { type: 'crossing', label: null });
  }

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
      loseLife(r, 'Signal franchi');
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
      loseLife(r, 'Heurt');
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

  // Gares traversées sans arrêt : bonus si on les passe à pleine vitesse
  const ps = r.m.passes;
  while (r.passI < ps.length && ps[r.passI].x <= r.x) {
    const p = ps[r.passI++];
    if (prevX < p.x && r.v >= 100 / 3.6) add(r, 'bonus', 40, { type: 'pass', label: `${p.name} en trombe`, kmh: Math.round(r.v * 3.6) });
  }

  // Arrêts non prévus (semi-direct)
  if (r.v === 0) {
    for (const p of r.m.passes) {
      if (!r.passed.has(p.k) && r.x > p.x - p.plat && r.x < p.x + 6) {
        r.passed.add(p.k);
        add(r, 'penalty', -200, { type: 'penalty', label: `Arrêt non prévu à ${p.name}` });
      }
    }
  }

  // Arrêt en gare
  const s = nextStop(r);
  if (!s) return;
  const d = r.x - s.x;
  if (s.skip) {
    // colis suspect : gare évacuée, on la traverse sans ouvrir
    if (!r.announced.has(`skip${r.stopI}`) && d > -750) { r.announced.add(`skip${r.stopI}`); emit(r, { type: 'evacuated', name: s.name }); }
    if (r.v === 0 && input.door && d > -s.plat && d < 10 && !r.announced.has(`skipdoor${r.stopI}`)) {
      r.announced.add(`skipdoor${r.stopI}`);
      add(r, 'penalty', -200, { type: 'penalty', label: 'Gare évacuée : ouverture interdite' });
    }
    if (d > 2) {
      add(r, 'bonus', 100, { type: 'bonus', label: `${s.name} évacuée : passage sans arrêt` });
      r.grades.push({ k: s.k, name: s.name, grade: 'passe', d: null, gap: null });
      r.arrivals.push(r.t);
      r.stopI++;
      if (r.stopI >= r.m.stops.length) endRun(r);
    }
    return;
  }
  if (r.v === 0 && r.lever <= 0) {
    if (d > STOP_WINDOW[1] && d <= MISSED_AFTER) {
      emit(r, { type: 'reverse', label: 'Arrêt dépassé : recul jusqu\'au repère' });
      r.t += 5;
      r.x = s.x;
      r.reversedD = d;
    }
    const dd = r.x - s.x;
    if (dd >= STOP_WINDOW[0] && dd <= STOP_WINDOW[1]) {
      // immobilisé au repère : c'est au conducteur d'ouvrir les portes
      if (r.waitDoors == null) { r.waitDoors = r.t; emit(r, { type: 'atStop', short: s.short && r.m.compo === 'UM' }); }
      if (input.door) arrive(r, s, r.reversedD ?? dd);
    } else if (dd > -s.plat && !r.tips.creep) {
      r.tips.creep = true;
      emit(r, { type: 'tip', id: 'creep' });
    }
  } else if (r.v > 0) {
    r.waitDoors = null;
  }
  if (r.v > 0 && d > MISSED_AFTER) {
    r.stats.missed++;
    r.combo = 0;
    r.grades.push({ k: s.k, name: s.name, grade: 'rate', d: null, gap: null });
    add(r, 'penalty', -600, { type: 'missed', label: `Gare brûlée : ${s.name}` });
    r.stopI++;
    loseLife(r, 'Gare brûlée');
    if (r.stopI >= r.m.stops.length) endRun(r);
  }
}

function arrive(r, s, d) {
  r.v = 0;
  r.a = 0;
  const waited = r.t - (r.waitDoors ?? r.t);
  r.waitDoors = null;
  r.reversedD = null;
  const ad = Math.abs(d);
  const g = d > STOP_WINDOW[1] ? { id: 'rate', label: 'DÉPASSÉ', pts: 0 } : GRADES.find((x) => ad <= x.max);
  if (g.id === 'parfait' || g.id === 'super') r.combo++;
  else r.combo = 0;
  r.bestCombo = Math.max(r.bestCombo, r.combo);
  const mult = r.combo >= 2 ? 1 + 0.25 * Math.min(r.combo - 1, 6) : 1;
  add(r, 'precision', Math.round(g.pts * mult), { type: 'grade', grade: g.id, label: g.label, d, combo: r.combo, mult });
  if (g.id === 'loin' || g.id === 'rate') loseLife(r, 'Arrêt raté');

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

  if (waited <= 2) add(r, 'doors', 50, { type: 'doors', label: 'Ouverture rapide' });
  const last = r.stopI === r.m.stops.length - 1;
  const shortUM = s.short && r.m.compo === 'UM';
  if (shortUM) emit(r, { type: 'shortPlatform', label: 'Quai court : la 2e rame reste hors quai' });
  r.doors = {
    state: 'opening', t: r.t, pax: s.pax, boarded: 0, fullAt: null, last, shortUM,
    runner: s.runner ? { state: 'waiting', appearAt: null, arriveAt: null } : null,
    malaise: s.malaise && !last ? s.malaise : 0, // secondes d'attente des secours
    openAt: r.t,
  };
  if (r.failed) return; // la partie vient de s'arrêter (plus de vie)
  r.phase = 'doors';
  emit(r, { type: 'doorsOpen', last });
  if (r.doors.malaise) emit(r, { type: 'malaise', hold: r.doors.malaise });
}

function updateDoors(r, input) {
  const dr = r.doors;
  const age = r.t - dr.t;
  if (dr.state === 'opening' && age > 0.6) { dr.state = 'open'; dr.t = r.t; }
  if (dr.state === 'open') {
    const rate = dr.last ? 40 : r.serie.board * r.m.boardMult * (dr.shortUM ? 0.5 : 1);
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
    if ((input.door || input.close) && !dr.last) closeDoors(r);
  }
  if (dr.state === 'closing' && r.t - dr.t > 0.8 && !r.failed) {
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
  if (dr.malaise) {
    if (r.t - dr.openAt < dr.malaise) {
      add(r, 'penalty', -200, { type: 'penalty', label: 'Départ avant l\'arrivée des secours' });
      loseLife(r, 'Malaise voyageur');
    } else add(r, 'bonus', 80, { type: 'bonus', label: 'Voyageur pris en charge' });
  }
  if (dr.runner && dr.runner.state === 'running') {
    dr.runner.state = 'missed';
    add(r, 'penalty', -50, { type: 'penalty', label: 'Porte claquée au nez du retardataire' });
  }
  if (left > 0.5) { pts = -100 - Math.round(left * 4); label = `${Math.ceil(left)} voyageurs restés à quai`; if (left > 5) loseLife(r, 'Voyageurs à quai'); }
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

// Seuils d'étoiles (en part du score de référence)
export const STAR2 = 0.4;
export const STAR3 = 0.68;

export function result(r) {
  const n = r.m.stops.length;
  // Score de référence : arrêts parfaits enchaînés (combo compris), ponctualité et portes parfaites
  let ref = 300 + 100 * (r.m.animals.length + r.m.works.length);
  for (let i = 0; i < n; i++) ref += r.m.stops[i].skip ? 100 : 500 * (i >= 1 ? 1 + 0.25 * Math.min(i, 6) : 1) + 300 + (i < n - 1 ? 150 : 0);
  const score = Math.round(r.score);
  const stars = 1 + (score >= ref * STAR2 ? 1 : 0) + (score >= ref * STAR3 ? 1 : 0);
  return {
    score, stars, ref, rame: r.serie.id, level: r.serie.level,
    time: r.t,
    parts: { ...r.parts },
    comfort: Math.max(0, Math.round(r.comfort)),
    bestCombo: r.bestCombo,
    grades: r.grades,
    stats: { ...r.stats },
    lives: r.lives,
    failed: r.failed,
    stopsDone: r.grades.length,
  };
}

// ---------------------------------------------------------------------------
// Conducteur titulaire (IA) : sert à calculer l'horaire et de fantôme de référence
// ---------------------------------------------------------------------------

export function aiInput(r) {
  const input = { lever: 0 };
  if (lightsWanted(r) !== r.lights && r.t - r.lightsT > 0.5) input.lights = true;
  if (r.phase === 'doors') {
    const dr = r.doors;
    const runnerPending = dr.runner && dr.runner.state !== 'boarded' && dr.runner.state !== 'missed';
    const help = dr.malaise && r.t - dr.openAt < dr.malaise + 0.3;
    input.door = dr.state === 'open' && dr.fullAt != null && !runnerPending && !help && r.t - dr.fullAt > 0.4;
    return input;
  }
  if (r.waitDoors != null && r.t - r.waitDoors > 0.3 && !nextStop(r)?.skip) { input.door = true; input.lever = -0.4; return input; }
  const b = Math.min(1.1, 1.6 * adhesionAt(r, r.x) * 0.6);
  const s = nextServed(r);
  const cr = crossingNear(r);
  if (cr && !darkAt(r, r.x) && cr.x - r.x < 150 && r.t - r.hornT > 5) input.horn = true;
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
  const al = activeAlarm(r);
  if (al) stopD = Math.min(stopD, al.state === 'stopped' ? 0 : al.x + 200 - r.x);
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
  while (!r.over && guard++ < 60 * 2400) {
    step(r, aiInput(r));
    r.events.length = 0;
  }
  const arr = r.arrivals.map((t, i) => Math.round((t * 1.05 + 1 + i * 0.5) * 10) / 10);
  const dep = arr.map((t, i) => t + 3 + (r.m.stops[i].pax / 16));
  return { arr, dep, frames: r.frames, aiTime: r.t, aiScore: Math.round(r.score) };
}

// ---------------------------------------------------------------------------
// Journal des commandes : permet au serveur de rejouer la partie et de recalculer le score
// ---------------------------------------------------------------------------

// c : appuis sur la commande des portes (ouvrir puis fermer), f : bascules des phares
export const newLog = () => ({ n: 0, l: [], h: [], c: [], f: [], last: 0 });

export function record(log, input) {
  if (input.lever !== log.last) { log.l.push([log.n, input.lever]); log.last = input.lever; }
  if (input.horn) log.h.push(log.n);
  if (input.door) log.c.push(log.n);
  if (input.lights) log.f.push(log.n);
  log.n++;
}

export function replay(mission, sched, log, rame) {
  const r = createRun(mission, { sched, rame });
  // les journaux sont triés par pas de temps : on avance des curseurs au lieu de chercher à chaque pas
  const h = log.h;
  const c = log.c;
  const f = log.f ?? [];
  let li = 0;
  let hi = 0;
  let ci = 0;
  let fi = 0;
  const input = { lever: 0, horn: false, door: false, lights: false };
  for (let i = 0; i < log.n && !r.over; i++) {
    while (li < log.l.length && log.l[li][0] === i) { input.lever = log.l[li][1]; li++; }
    while (hi < h.length && h[hi] < i) hi++;
    while (ci < c.length && c[ci] < i) ci++;
    while (fi < f.length && f[fi] < i) fi++;
    input.horn = h[hi] === i;
    input.door = c[ci] === i;
    input.lights = f[fi] === i;
    step(r, input);
    r.events.length = 0;
  }
  return r;
}
