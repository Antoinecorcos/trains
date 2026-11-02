// Simulation déterministe d'un service.
// Aucune dépendance au DOM : le même code pourra tourner côté serveur pour rejouer une partie
// (seed + journal d'actions) et produire le score officiel.

import { LINE_U, RAME, CREW, INCIDENTS, SCENARIO } from './data.js';
import { mulberry32, pickWeighted } from './rng.js';

export const WARMUP_START = 5 * 3600 + 30 * 60;
export const SERVICE_START = 6 * 3600 + 30 * 60;
export const SERVICE_END = 9 * 3600 + 30 * 60;
export const REAL_DURATION = 300; // secondes réelles
export const SIM_PER_REAL = (SERVICE_END - SERVICE_START) / REAL_DURATION; // 36

const HEADWAY = 900;
const DWELL_SCHED = 60;
const MIN_LAYOVER = 240;
const LATE = 300; // seuil de retard officiel (5 min)
const CREW_COOLDOWN = 480;
const TURNBACK_TIME = 180;
const CROWD_OK = 280;

const line = LINE_U;
const N = line.stations.length;
const LAST = N - 1;
const di = (dir) => (dir === 1 ? 0 : 1);
const segOf = (k, dir) => (dir === 1 ? k : k - 1);
const termOfDir = (dir) => (dir === 1 ? LAST : 0);

export const fmtClock = (t) => {
  const m = Math.floor(t / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export function createGame(seed = Date.now() % 1e9) {
  const rng = mulberry32(seed);
  const g = {
    seed,
    t: WARMUP_START,
    rng,
    trains: [],
    pending: { 0: [], [LAST]: [] },
    incidents: [],
    plan: [],
    crew: CREW.map((c) => ({ ...c, incidentId: null, readyAt: 0 })),
    waiting: Array.from({ length: N }, () => [0, 0]),
    sat: 100,
    stats: { counted: 0, onTime: 0, suppressed: 0, partial: 0, omitted: 0, transported: 0, revenue: 0, leftBehind: 0, conflicts: 0, incidents: 0, resolved: 0 },
    feed: [],
    events: [],
    annonceUntil: 0,
    annonceReadyAt: 0,
    reserves: [
      { id: 'R1', at: 0, label: 'Réserve de La Défense', hint: 'Prend le prochain départ en retard vers La Verrière', used: false },
      { id: 'R2', at: 9, label: 'Réserve de Trappes', hint: 'Part de Trappes vers La Défense, hors grille', used: false },
    ],
    node: { k: 6, busyUntil: 0 },
    alerts: {},
    nextId: 1,
    missionSeq: [0, 0],
    log: [],
    over: false,
    failed: false,
  };

  // Grille horaire : un départ toutes les 15 min de chaque terminus.
  for (let t = WARMUP_START + 60; t <= SERVICE_END; t += HEADWAY) g.pending[0].push({ t });
  for (let t = WARMUP_START + 480; t <= SERVICE_END; t += HEADWAY) g.pending[LAST].push({ t });

  // Parc : 4 rames à chaque terminus.
  for (let i = 0; i < 4; i++) {
    g.trains.push(newTrain(g, 0));
    g.trains.push(newTrain(g, LAST));
  }

  planIncidents(g);
  return g;
}

function newTrain(g, at) {
  return {
    id: g.nextId++,
    serie: RAME.serie,
    dir: at === 0 ? 1 : -1,
    at,
    seg: null,
    prog: 0,
    state: 'layover',
    layoverSince: WARMUP_START - 900,
    trip: null,
    load: 0,
    dwellLeft: 0,
    holdLeft: 0,
    held: false,
    degraded: false,
    retire: false,
    skip: false,
    hlp: false,
    dump: false,
    auth: false,
    waitingAuth: false,
  };
}

function planIncidents(g) {
  const { rng } = g;
  const types = Object.entries(INCIDENTS).filter(([, d]) => d.weight > 0);
  let t = SERVICE_START + 150 + Math.floor(rng() * 200);
  while (t < SERVICE_END - 700) {
    const type = pickWeighted(rng, types.map(([k, d]) => [k, d.weight]));
    g.plan.push({ t, type, r: rng() });
    t += 560 + Math.floor(rng() * 640);
  }
  const td = SERVICE_START + Math.floor((0.42 + rng() * 0.2) * (SERVICE_END - SERVICE_START));
  g.plan.push({ t: td, type: 'derangement', r: rng() });
  g.plan.sort((a, b) => a.t - b.t);
}

function makeTrip(g, origin, dir, depTime, opts = {}) {
  const dest = opts.dest ?? termOfDir(dir);
  const arr = new Array(N).fill(null);
  const dep = new Array(N).fill(null);
  let t = depTime;
  dep[origin] = depTime;
  for (let k = origin; k !== dest; k += dir) {
    t += line.runTimes[segOf(k, dir)];
    const k2 = k + dir;
    arr[k2] = t;
    if (k2 !== dest) {
      t += DWELL_SCHED;
      dep[k2] = t;
    }
  }
  const d = di(dir);
  g.missionSeq[d]++;
  const num = String((dir === 1 ? 145000 : 146000) + g.missionSeq[d] * 2 + (dir === 1 ? 0 : 1));
  return { num, origin, dest, dir, arr, dep, counted: opts.counted ?? true, partial: false, extra: !!opts.extra };
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export const inService = (g) => g.t >= SERVICE_START;
export const progress = (g) => Math.min(1, Math.max(0, (g.t - SERVICE_START) / (SERVICE_END - SERVICE_START)));
export const regularity = (g) => (g.stats.counted ? (100 * g.stats.onTime) / g.stats.counted : 100);

export function activeIncidents(g) {
  return g.incidents.filter((i) => !i.resolved);
}

function incidentAt(g, pred) {
  return g.incidents.find((i) => !i.resolved && pred(i));
}

const stationBlocked = (g, k) => !!incidentAt(g, (i) => i.type === 'colis' && i.k === k);
const segBlocked = (g, s) => !!incidentAt(g, (i) => i.type === 'personnes' && i.s === s);
const trainImmobilised = (g, tr) => !!incidentAt(g, (i) => i.type === 'panne' && i.trainId === tr.id);
const trainHeld = (g, tr) => !!incidentAt(g, (i) => i.type === 'malaise' && i.trainId === tr.id);
const derangementActive = (g) => !!incidentAt(g, (i) => i.type === 'derangement');

function segSpeed(g, s) {
  let f = 1;
  for (const i of g.incidents) {
    if (i.resolved || i.s !== s) continue;
    if (i.type === 'signal') f = Math.min(f, 0.35);
    if (i.type === 'ligneL') f = Math.min(f, 0.5);
  }
  return f;
}

function affluenceMult(g, k) {
  return incidentAt(g, (i) => i.type === 'affluence' && i.k === k) ? 3 : 1;
}

export function trainDelay(g, tr) {
  const trip = tr.trip;
  if (!trip || tr.state === 'layover' || tr.state === 'depot') return 0;
  let d;
  if (tr.state === 'run') {
    const k2 = tr.at + tr.dir;
    const exp = g.t + (1 - tr.prog) * line.runTimes[tr.seg];
    d = exp - (trip.arr[k2] ?? exp);
  } else {
    const sched = trip.dep[tr.at];
    if (sched == null) return 0;
    d = g.t + Math.max(0, tr.dwellLeft, tr.holdLeft) - sched;
  }
  return Math.max(0, Math.round(d));
}

export function trainStatus(g, tr) {
  if (tr.state === 'depot') return 'Atelier';
  if (tr.state === 'layover') return 'Garé au terminus';
  if (trainImmobilised(g, tr)) return 'Immobilisé';
  if (trainHeld(g, tr)) return 'Retenu (malaise)';
  if (tr.waitingAuth) return 'Attend une autorisation';
  if (tr.hlp) return 'Haut-le-pied (sans voyageurs)';
  if (tr.state === 'run') return tr.prog >= 1 ? 'Arrêté au signal' : 'En ligne';
  if (tr.holdLeft > 0) return 'Retenu à quai';
  return 'À quai';
}

function platformBusy(g, k, dir, self) {
  return g.trains.some((o) => o !== self && o.state === 'dwell' && o.at === k && o.dir === dir);
}

function segBusy(g, s, dir, self) {
  return g.trains.some((o) => o !== self && o.state === 'run' && o.seg === s && o.dir === dir);
}

// ---------------------------------------------------------------------------
// Pas de simulation (1 seconde simulée)
// ---------------------------------------------------------------------------

export function step(g) {
  if (g.over) return;
  g.t += 1;
  const live = inService(g);

  // Incidents planifiés
  while (g.plan.length && g.plan[0].t <= g.t) spawnIncident(g, g.plan.shift());

  // Incidents en cours
  for (const inc of g.incidents) {
    if (inc.resolved) continue;
    inc.left -= 1;
    if (inc.left <= 0) resolveIncident(g, inc);
  }
  for (const c of g.crew) {
    if (c.incidentId) {
      const inc = g.incidents.find((i) => i.id === c.incidentId);
      if (!inc || inc.resolved) {
        c.incidentId = null;
        c.readyAt = g.t + CREW_COOLDOWN;
      }
    }
  }

  // Voyageurs
  const prof = demandProfile(g.t);
  for (let k = 0; k < N; k++) {
    const m = affluenceMult(g, k);
    g.waiting[k][0] += (line.demand[k][0] * prof * m) / 60;
    g.waiting[k][1] += (line.demand[k][1] * prof * m) / 60;
  }

  dispatch(g);
  for (const tr of g.trains) updateTrain(g, tr);

  if (live && g.t % 60 === 0) updateSatisfaction(g);
  if (live && g.t % 30 === 0) passengerChatter(g);

  if (g.sat <= 0) {
    g.sat = 0;
    endGame(g, true);
  } else if (g.t >= SERVICE_END) {
    endGame(g, false);
  }
}

function demandProfile(t) {
  const pts = [
    [WARMUP_START, 0.35], [6 * 3600 + 30 * 60, 0.6], [7 * 3600 + 30 * 60, 1.25],
    [8 * 3600 + 15 * 60, 1.45], [9 * 3600, 1.0], [9 * 3600 + 30 * 60, 0.7],
  ];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
}

function dispatch(g) {
  for (const term of [0, LAST]) {
    const q = g.pending[term];
    if (!q.length || q[0].t > g.t) continue;
    const dir = term === 0 ? 1 : -1;
    const avail = g.trains
      .filter((tr) => tr.state === 'layover' && tr.at === term && g.t - tr.layoverSince >= MIN_LAYOVER)
      .sort((a, b) => a.layoverSince - b.layoverSince);
    if (avail.length) {
      const p = q.shift();
      startTrip(g, avail[0], makeTrip(g, term, dir, p.t));
    } else if (q.length > 1 && q[1].t <= g.t) {
      const lost = q.shift();
      if (inService(g)) {
        g.stats.suppressed++;
        g.sat -= 4;
        say(g, 'annonce', `Le train de ${fmtClock(lost.t)} au départ de ${line.stations[term].name} est supprimé faute de matériel disponible.`);
        say(g, 'voyageur', `Train supprimé à ${line.stations[term].short}. Évidemment.`);
      }
    }
  }
}

function startTrip(g, tr, trip) {
  tr.trip = trip;
  tr.dir = trip.dir;
  tr.at = trip.origin;
  tr.state = 'dwell';
  tr.hlp = false;
  tr.skip = false;
  tr.dump = false;
  tr.held = false;
  tr.auth = false;
  tr.waitingAuth = false;
  tr.load = 0;
  tr.dwellLeft = board(g, tr, trip.origin);
}

function board(g, tr, k) {
  const d = di(tr.dir);
  const room = RAME.capacity - tr.load;
  const w = g.waiting[k][d];
  const b = Math.min(w, room);
  tr.load += b;
  g.waiting[k][d] -= b;
  const left = g.waiting[k][d];
  if (inService(g) && left > 60) {
    g.stats.leftBehind += Math.round(left);
    g.sat -= left / 500;
    if (left > 150) say(g, 'voyageur', `Impossible de monter dans le ${tr.trip?.num ?? ''} à ${line.stations[k].short}, il est plein.`);
  }
  const affl = affluenceMult(g, k) > 1 ? 1.25 : 1;
  return Math.round((30 + b * 0.045 + (left > 60 ? 15 : 0)) * affl);
}

function alight(g, tr, k) {
  const trip = tr.trip;
  const d = di(tr.dir);
  let n;
  if (k === trip.dest) n = tr.load;
  else {
    const w = line.alightWeight[d];
    let sum = 0;
    for (let j = k; j !== trip.dest + tr.dir; j += tr.dir) sum += w[j];
    n = sum > 0 ? (tr.load * w[k]) / sum : 0;
  }
  tr.load -= n;
  if (inService(g)) {
    g.stats.transported += n;
    g.stats.revenue += n * 1.9;
  }
  return n;
}

function updateTrain(g, tr) {
  if (tr.state === 'layover' || tr.state === 'depot') return;

  if (tr.state === 'dwell') {
    if (tr.dwellLeft > 0) tr.dwellLeft--;
    if (tr.holdLeft > 0) tr.holdLeft--;
    if (tr.dwellLeft > 0 || tr.holdLeft > 0) return;
    if (trainHeld(g, tr)) return;
    const k = tr.at;
    const sched = tr.trip.dep[k];
    if (!tr.skip && sched != null && g.t < sched) return;
    if (stationBlocked(g, k)) return;
    if (k === g.node.k && derangementActive(g) && !tr.auth) {
      tr.waitingAuth = true;
      return;
    }
    const k2 = k + tr.dir;
    const s = segOf(k, tr.dir);
    if (segBusy(g, s, tr.dir, tr) || segBlocked(g, s) || stationBlocked(g, k2)) return;
    tr.state = 'run';
    tr.seg = s;
    tr.prog = 0;
    tr.auth = false;
    tr.waitingAuth = false;
    tr.held = false;
    return;
  }

  // En ligne
  if (trainImmobilised(g, tr) || segBlocked(g, tr.seg)) return;
  if (tr.prog < 1) {
    const sp = segSpeed(g, tr.seg) * (tr.degraded ? 0.7 : 1);
    tr.prog = Math.min(1, tr.prog + sp / line.runTimes[tr.seg]);
    if (tr.prog < 1) return;
  }
  const k2 = tr.at + tr.dir;
  if (stationBlocked(g, k2)) return;
  const isTerm = k2 === 0 || k2 === LAST;
  if (!isTerm && platformBusy(g, k2, tr.dir, tr)) return;
  arrive(g, tr, k2);
}

function arrive(g, tr, k) {
  const trip = tr.trip;
  tr.seg = null;
  tr.prog = 0;
  tr.at = k;

  if (tr.dump) {
    g.waiting[k][di(tr.dir)] += tr.load;
    tr.load = 0;
    tr.dump = false;
  }

  if (k === trip.dest) {
    if (trip.counted && inService(g)) {
      g.stats.counted++;
      if (g.t - trip.arr[k] < LATE) g.stats.onTime++;
    }
    if (k === 0 || k === LAST) {
      alight(g, tr, k);
      if (tr.retire) {
        tr.state = 'depot';
        say(g, 'info', `La rame du train ${trip.num} rentre à l'atelier.`);
      } else {
        tr.state = 'layover';
        tr.layoverSince = g.t;
      }
      tr.trip = null;
      return;
    }
    // Terminus partiel : les voyageurs restants descendent et attendent le train suivant.
    const rest = tr.load;
    tr.load = 0;
    g.waiting[k][di(tr.dir)] += rest;
    const nd = -tr.dir;
    tr.dir = nd;
    startTrip(g, tr, makeTrip(g, k, nd, g.t + TURNBACK_TIME));
    tr.dwellLeft = Math.max(tr.dwellLeft, TURNBACK_TIME);
    say(g, 'info', `Le train ${trip.num} a fait demi-tour à ${line.stations[k].short} et repart en ${tr.trip.num} vers ${line.stations[termOfDir(nd)].short}.`);
    return;
  }

  tr.state = 'dwell';
  if (tr.skip) {
    tr.dwellLeft = 0;
    return;
  }
  alight(g, tr, k);
  tr.dwellLeft = board(g, tr, k);
}

function updateSatisfaction(g) {
  let crowd = 0;
  for (let k = 0; k < N; k++) for (let d = 0; d < 2; d++) crowd += Math.max(0, g.waiting[k][d] - CROWD_OK);
  let late = 0;
  for (const tr of g.trains) {
    if (!tr.trip || tr.hlp) continue;
    const dl = trainDelay(g, tr);
    if (dl > LATE) late += (dl - LATE) / 60;
  }
  let drain = crowd / 1300 + late * 0.022;
  if (g.t < g.annonceUntil) drain *= 0.5;
  if (drain < 0.1) g.sat = Math.min(100, g.sat + 0.3);
  g.sat -= drain;
}

const CHATTER = [
  (st, m) => `${m} min d'attente à ${st}, quai noir de monde.`,
  (st) => `Toujours bloqués à ${st}. Personne ne sait rien.`,
  (st) => `Quai de ${st} saturé, on ne voit même plus la ligne jaune.`,
  (st, m) => `Ça fait ${m} min que j'attends à ${st}. La U, quoi.`,
];

function passengerChatter(g) {
  for (let k = 0; k < N; k++) {
    for (let d = 0; d < 2; d++) {
      const w = g.waiting[k][d];
      const key = `crowd-${k}-${d}`;
      if (w > 650 && (g.alerts[key] ?? 0) < g.t) {
        g.alerts[key] = g.t + 900;
        const rate = (line.demand[k][d] * demandProfile(g.t)) / 60 || 1;
        const m = Math.max(5, Math.round(w / rate / 60));
        say(g, 'voyageur', CHATTER[Math.floor(g.rng() * CHATTER.length)](line.stations[k].short, m));
      }
    }
  }
}

function say(g, kind, text) {
  g.feed.unshift({ t: g.t, kind, text });
  if (g.feed.length > 40) g.feed.length = 40;
  g.events.push({ type: 'feed', kind, text });
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

function spawnIncident(g, p) {
  const def = INCIDENTS[p.type];
  const inc = { id: g.nextId++, type: p.type, start: g.t, left: def.natural, total: def.natural, crewId: null, resolved: false };
  const r = p.r;
  const st = (k) => line.stations[k].name;
  const busy = (pred) => !!g.incidents.find((i) => !i.resolved && pred(i));
  let a, b;

  switch (p.type) {
    case 'signal':
    case 'personnes': {
      inc.s = Math.floor(r * (N - 1));
      if (busy((i) => i.s === inc.s)) inc.s = (inc.s + 3) % (N - 1);
      a = st(inc.s); b = st(inc.s + 1);
      break;
    }
    case 'ligneL': {
      inc.s = line.sharedL[Math.floor(r * line.sharedL.length)];
      a = st(inc.s); b = st(inc.s + 1);
      break;
    }
    case 'colis': {
      inc.k = 1 + Math.floor(r * (N - 2));
      if (busy((i) => i.k === inc.k)) inc.k = 1 + ((inc.k + 4) % (N - 2));
      break;
    }
    case 'affluence': {
      inc.k = [0, 6, 8, 3][Math.floor(r * 4)];
      break;
    }
    case 'malaise':
    case 'panne': {
      const cands = g.trains.filter((tr) => tr.trip && !tr.hlp && (p.type === 'panne' ? tr.state === 'run' && tr.prog < 0.9 : true) && !busy((i) => i.trainId === tr.id));
      if (!cands.length) return;
      const tr = cands[Math.floor(r * cands.length)];
      inc.trainId = tr.id;
      inc.num = tr.trip.num;
      const k = tr.at;
      a = st(k); b = st(Math.min(LAST, Math.max(0, k + tr.dir)));
      break;
    }
    case 'derangement':
      inc.k = g.node.k;
      break;
  }
  if (inc.k != null) inc.where = st(inc.k);
  else if (inc.s != null) inc.where = `${st(inc.s)} ↔ ${st(inc.s + 1)}`;
  else inc.where = `train ${inc.num}`;

  g.incidents.push(inc);
  g.stats.incidents++;
  const text = def.annonce.replace('{a}', a).replace('{b}', b).replace('{st}', inc.where).replace('{num}', inc.num);
  say(g, 'annonce', `${text} Reprise estimée ${fmtClock(g.t + def.natural)}.`);
  g.events.push({ type: 'incident', inc });
}

function resolveIncident(g, inc) {
  inc.resolved = true;
  inc.resolvedAt = g.t;
  if (inc.crewId) g.stats.resolved++;
  if (inc.type === 'panne') {
    const tr = g.trains.find((x) => x.id === inc.trainId);
    if (tr) {
      tr.degraded = true;
      tr.retire = true;
    }
  }
  if (inc.type === 'derangement') {
    for (const tr of g.trains) tr.waitingAuth = false;
  }
  const lbl = INCIDENTS[inc.type].label;
  say(g, 'annonce', `Fin de l'incident (${lbl[0].toLowerCase()}${lbl.slice(1)}, ${inc.where}). Le trafic reprend progressivement.`);
  g.events.push({ type: 'resolved', inc });
}

export function crewEta(g, inc, crewId) {
  const def = INCIDENTS[inc.type];
  if (!def.spec) return null;
  return def.spec === crewId ? def.specTime : def.otherTime;
}

export function crewState(g, c) {
  if (c.incidentId) return 'mission';
  if (g.t < c.readyAt) return 'cooldown';
  return 'ready';
}

// ---------------------------------------------------------------------------
// Actions du joueur
// ---------------------------------------------------------------------------

export function trainActions(g, tr) {
  const acts = [];
  if (!tr.trip || tr.state === 'layover' || tr.state === 'depot' || tr.hlp) return acts;
  const trip = tr.trip;
  const here = tr.state === 'dwell' ? tr.at : tr.at + tr.dir;
  const atStation = tr.state === 'dwell';

  if (atStation && tr.at !== trip.origin && !tr.held) acts.push({ type: 'hold', label: 'Retenir 2 min à quai', hint: 'Espace les trains', effect: [+1, -1] });

  const remaining = Math.abs(trip.dest - here) - 1;
  if (!tr.skip && remaining >= 2) acts.push({ type: 'omit', label: `Direct jusqu'à ${line.stations[trip.dest].short}`, hint: `Saute ${remaining} arrêts`, effect: [+1, -1] });

  const tbs = [];
  for (let k = here; k !== trip.dest; k += tr.dir) {
    if (line.stations[k].turnback && !(atStation && k === trip.origin)) tbs.push(k);
  }
  for (const k of tbs.slice(0, 2)) {
    acts.push({ type: 'partial', station: k, label: `Terminus partiel à ${line.stations[k].short}`, hint: 'Demi-tour, le train rattrape la grille', effect: [+2, -2] });
  }
  acts.push({ type: 'suppress', label: 'Supprimer le train', hint: 'Retiré des statistiques, rame haut-le-pied', effect: [+3, -3] });
  return acts;
}

export function apply(g, action) {
  if (g.over) return { ok: false };
  const res = doApply(g, action);
  if (res.ok) g.log.push({ t: g.t, ...action });
  return res;
}

function doApply(g, a) {
  const tr = a.trainId != null ? g.trains.find((x) => x.id === a.trainId) : null;
  switch (a.type) {
    case 'dispatch': {
      const inc = g.incidents.find((i) => i.id === a.incidentId && !i.resolved);
      const c = g.crew.find((x) => x.id === a.crewId);
      if (!inc || !c || inc.crewId || crewState(g, c) !== 'ready') return { ok: false };
      const eta = crewEta(g, inc, c.id);
      if (eta == null) return { ok: false };
      inc.crewId = c.id;
      inc.left = Math.min(inc.left, eta);
      inc.total = inc.left;
      c.incidentId = inc.id;
      return { ok: true };
    }
    case 'hold': {
      if (!tr || tr.state !== 'dwell' || tr.held) return { ok: false };
      tr.holdLeft += 120;
      tr.held = true;
      g.sat -= 0.3;
      return { ok: true };
    }
    case 'omit': {
      if (!tr || !tr.trip || tr.skip) return { ok: false };
      const here = tr.state === 'dwell' ? tr.at : tr.at + tr.dir;
      const n = Math.abs(tr.trip.dest - here) - 1;
      tr.skip = true;
      if (tr.state === 'dwell') tr.dwellLeft = Math.min(tr.dwellLeft, 10);
      g.sat -= 1.2 * n;
      g.stats.omitted += n;
      say(g, 'annonce', `Le train ${tr.trip.num} sera direct jusqu'à ${line.stations[tr.trip.dest].name}.`);
      say(g, 'voyageur', `Le ${tr.trip.num} ne s'arrête plus. Super, merci.`);
      return { ok: true };
    }
    case 'partial': {
      if (!tr || !tr.trip) return { ok: false };
      const k = a.station;
      tr.trip.dest = k;
      tr.trip.counted = false;
      tr.trip.partial = true;
      g.sat -= 3;
      g.stats.partial++;
      say(g, 'annonce', `Le train ${tr.trip.num} est limité à ${line.stations[k].name}. Les voyageurs sont invités à descendre.`);
      if (tr.state === 'dwell' && tr.at === k) arrive(g, tr, k);
      return { ok: true };
    }
    case 'suppress': {
      if (!tr || !tr.trip || tr.hlp) return { ok: false };
      tr.trip.counted = false;
      tr.hlp = true;
      tr.skip = true;
      if (tr.state === 'dwell') {
        g.waiting[tr.at][di(tr.dir)] += tr.load;
        tr.load = 0;
        tr.dwellLeft = Math.min(tr.dwellLeft, 20);
        tr.holdLeft = 0;
      } else tr.dump = true;
      tr.trip.dest = termOfDir(tr.dir);
      g.sat -= 5;
      g.stats.suppressed++;
      say(g, 'annonce', `Le train ${tr.trip.num} est supprimé. Nous vous prions de nous excuser pour la gêne occasionnée.`);
      return { ok: true };
    }
    case 'reserve': {
      const r = g.reserves.find((x) => x.id === a.reserveId && !x.used);
      if (!r) return { ok: false };
      r.used = true;
      const t = newTrain(g, r.at);
      g.trains.push(t);
      if (r.at === 0) {
        t.layoverSince = g.t - MIN_LAYOVER;
      } else {
        t.dir = -1;
        startTrip(g, t, makeTrip(g, r.at, -1, g.t + 60, { counted: false, extra: true }));
        t.dwellLeft = Math.max(t.dwellLeft, 60);
      }
      say(g, 'info', `${r.label} injectée.`);
      return { ok: true };
    }
    case 'annonce': {
      if (g.t < g.annonceReadyAt) return { ok: false };
      g.annonceUntil = g.t + 300;
      g.annonceReadyAt = g.t + 900;
      g.sat = Math.min(100, g.sat + 1);
      say(g, 'annonce', 'Information voyageurs diffusée sur toute la ligne. Merci de votre patience.');
      return { ok: true };
    }
    case 'authorize': {
      if (!tr || !tr.waitingAuth) return { ok: false };
      if (g.t < g.node.busyUntil) {
        tr.holdLeft += 180;
        tr.waitingAuth = false;
        tr.auth = true;
        g.sat -= 4;
        g.stats.conflicts++;
        say(g, 'annonce', 'Conflit d\'itinéraire à Versailles-Chantiers : arrêt d\'urgence, reprise après vérification.');
        return { ok: true, conflict: true };
      }
      tr.auth = true;
      tr.waitingAuth = false;
      g.node.busyUntil = g.t + 75;
      return { ok: true };
    }
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Fin de partie
// ---------------------------------------------------------------------------

function endGame(g, failed) {
  g.over = true;
  g.failed = failed;
  if (!failed) {
    for (const tr of g.trains) {
      if (tr.trip && tr.trip.counted && !tr.hlp && trainDelay(g, tr) >= LATE) {
        g.stats.counted++;
      }
    }
  }
  g.result = result(g);
  g.events.push({ type: 'over' });
}

export function result(g) {
  const reg = regularity(g);
  const [s2, s3] = SCENARIO.stars;
  const stars = g.failed ? 0 : 1 + (reg >= s2 ? 1 : 0) + (reg >= s3 ? 1 : 0);
  return {
    ...g.stats,
    failed: g.failed,
    regularity: Math.round(reg * 10) / 10,
    satisfaction: Math.round(g.sat),
    stars,
    transported: Math.round(g.stats.transported),
    revenue: Math.round(g.stats.revenue),
    endedAt: g.t,
  };
}

// Avance la simulation jusqu'au début du service (mise en place des trains).
export function warmup(g) {
  while (g.t < SERVICE_START) step(g);
  g.events.length = 0;
  g.feed.length = 0;
  for (const row of g.waiting) {
    row[0] = Math.min(row[0], 120);
    row[1] = Math.min(row[1], 120);
  }
}
