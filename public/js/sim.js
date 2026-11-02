// Simulation déterministe d'un service.
// Aucune dépendance au DOM : le même code pourra tourner côté serveur pour rejouer une partie
// (seed + journal d'actions) et produire le score officiel.

import { LINE_U, SERIES, CREW, INCIDENTS, EVENTS, SCENARIO } from './data.js';
import { mulberry32, pickWeighted } from './rng.js';

export const WARMUP_START = 5 * 3600 + 30 * 60;
export const SERVICE_START = 6 * 3600 + 30 * 60;
export const SERVICE_END = 9 * 3600 + 30 * 60;
export const REAL_DURATION = 300; // secondes réelles
export const SIM_PER_REAL = (SERVICE_END - SERVICE_START) / REAL_DURATION; // 36
export const EVENT_WINDOW = 14 * SIM_PER_REAL; // 14 s réelles pour trancher un dilemme

const HEADWAY = 900;
const DWELL_SCHED = 60;
const MIN_LAYOVER = 240;
const LATE = 300;
const CREW_COOLDOWN = 420;
const TURNBACK_TIME = 180;
const CROWD_OK = 280;
const HOLD_MAX = 480;

const line = LINE_U;
const N = line.stations.length;
const LAST = N - 1;
const di = (dir) => (dir === 1 ? 0 : 1);
const segOf = (k, dir) => (dir === 1 ? k : k - 1);
const termOfDir = (dir) => (dir === 1 ? LAST : 0);
const H = (h, m) => h * 3600 + m * 60;

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
    stats: {
      counted: 0, onTime: 0, suppressed: 0, partial: 0, omitted: 0, transported: 0, revenue: 0,
      leftBehind: 0, conflicts: 0, incidents: 0, resolved: 0, specialist: 0, dilemmas: 0, dilemmasWon: 0,
    },
    streak: 0,
    bestStreak: 0,
    streakRewards: {},
    feed: [],
    events: [],
    dilemma: null,
    watches: [],
    annonceUntil: 0,
    annonceReadyAt: 0,
    reserves: [
      { id: 'R1', at: 0, label: 'La Défense', used: false },
      { id: 'R2', at: 9, label: 'Trappes', used: false },
    ],
    node: { k: 6, busyUntil: 0 },
    alerts: {},
    nextId: 1,
    missionSeq: [0, 0],
    log: [],
    over: false,
    failed: false,
  };

  for (let t = WARMUP_START + 60; t <= SERVICE_END; t += HEADWAY) g.pending[0].push({ t });
  for (let t = WARMUP_START + 480; t <= SERVICE_END; t += HEADWAY) g.pending[LAST].push({ t });

  for (let i = 0; i < 4; i++) {
    g.trains.push(newTrain(g, 0));
    g.trains.push(newTrain(g, LAST));
  }

  planService(g);
  return g;
}

function newTrain(g, at, serie = 'Z 2N') {
  return {
    id: g.nextId++,
    serie,
    capacity: SERIES[serie].capacity,
    speed: SERIES[serie].speed,
    dir: at === 0 ? 1 : -1,
    at,
    seg: null,
    prog: 0,
    state: 'layover',
    layoverSince: WARMUP_START - 900,
    trip: null,
    load: 0,
    dwellLeft: 0,
    lock: false,
    lockSince: 0,
    degraded: false,
    retire: false,
    skip: false,
    hlp: false,
    dump: false,
    auth: false,
    waitingAuth: false,
    vip: false,
  };
}

// Trois actes : mise en route calme, pointe dense, retour au calme.
function planService(g) {
  const { rng } = g;
  const jitter = (t, m) => t + Math.round((rng() * 2 - 1) * m * 60);
  const types = Object.entries(INCIDENTS).filter(([, d]) => d.weight > 0);
  const incSlots = [H(6, 44), H(7, 18), H(7, 42), H(8, 34), H(9, 2)];
  let lastType = null;
  for (const slot of incSlots) {
    let type;
    do type = pickWeighted(rng, types.map(([k, d]) => [k, d.weight]));
    while (type === lastType);
    lastType = type;
    g.plan.push({ t: jitter(slot, 5), kind: 'incident', type, r: rng() });
  }
  g.plan.push({ t: jitter(H(8, 8), 6), kind: 'incident', type: 'derangement', r: rng() });

  const pool = ['journaliste', 'heuresup', 'directeur', 'controle', 'rameNeuve', 'ligneN'];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const evSlots = [H(6, 56), H(7, 30), H(7, 58), H(8, 48)];
  evSlots.forEach((slot, i) => g.plan.push({ t: jitter(slot, 4), kind: 'event', type: pool[i], r: rng() }));
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
export const activeIncidents = (g) => g.incidents.filter((i) => !i.resolved);

const incidentAt = (g, pred) => g.incidents.find((i) => !i.resolved && pred(i));
const stationBlocked = (g, k) => !!incidentAt(g, (i) => i.type === 'colis' && i.k === k && !i.through);
const stationThrough = (g, k) => !!incidentAt(g, (i) => i.type === 'colis' && i.k === k && i.through);
const segBlocked = (g, s) => !!incidentAt(g, (i) => i.type === 'personnes' && i.s === s && !(i.alt && g.t >= i.altAt));
const segSingle = (g, s) => !!incidentAt(g, (i) => i.type === 'signal' && i.s === s && i.alt);
const trainImmobilised = (g, tr) => !!incidentAt(g, (i) => i.type === 'panne' && i.trainId === tr.id);
const trainHeld = (g, tr) => !!incidentAt(g, (i) => i.type === 'malaise' && i.trainId === tr.id);
const derangementActive = (g) => !!incidentAt(g, (i) => i.type === 'derangement');

function segSpeed(g, s) {
  let f = 1;
  for (const i of g.incidents) {
    if (i.resolved) continue;
    const onSeg = i.s === s || (i.segs && i.segs.includes(s));
    if (!onSeg) continue;
    if (i.type === 'signal' && !i.alt) f = Math.min(f, 0.35);
    if (i.type === 'personnes' && i.alt) f = Math.min(f, 0.3);
    if (i.type === 'ligneL') f = Math.min(f, 0.5);
    if (i.type === 'ligneN') f = Math.min(f, 0.55);
  }
  return f;
}

function affluenceMult(g, k) {
  const inc = incidentAt(g, (i) => i.type === 'affluence' && i.k === k);
  if (!inc) return 1;
  return inc.alt ? 0 : 3;
}

function dwellBonus(g, k) {
  let b = 0;
  if (incidentAt(g, (i) => i.type === 'affluence' && i.k === k && !i.alt)) b += 20;
  for (const w of g.watches) if (w.type === 'controle' && w.k === k && g.t < w.to) b += 25;
  return b;
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
    d = g.t + Math.max(0, tr.dwellLeft) - sched;
  }
  return Math.max(0, Math.round(d));
}

export function trainStatus(g, tr) {
  if (trainImmobilised(g, tr)) return 'Immobilisé';
  if (trainHeld(g, tr)) return 'Malaise à bord';
  if (tr.waitingAuth) return 'Attend le feu vert';
  if (tr.lock) return 'Retenu à quai';
  if (tr.hlp) return 'Haut-le-pied';
  if (tr.state === 'run') return tr.prog >= 1 ? 'Arrêté au signal' : 'En marche';
  return 'À quai';
}

const platformBusy = (g, k, dir, self) => g.trains.some((o) => o !== self && o.state === 'dwell' && o.at === k && o.dir === dir);
const segBusy = (g, s, dir, self) => {
  const single = segSingle(g, s);
  return g.trains.some((o) => o !== self && o.state === 'run' && o.seg === s && (single || o.dir === dir));
};

// ---------------------------------------------------------------------------
// Pas de simulation (1 seconde simulée)
// ---------------------------------------------------------------------------

export function step(g) {
  if (g.over) return;
  g.t += 1;
  const live = inService(g);

  while (g.plan.length && g.plan[0].t <= g.t) {
    const p = g.plan[0];
    if (p.kind === 'event' && g.dilemma) { p.t += 60; g.plan.sort((a, b) => a.t - b.t); break; }
    g.plan.shift();
    if (p.kind === 'incident') spawnIncident(g, p);
    else spawnEvent(g, p);
  }

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

  if (g.dilemma && g.t >= g.dilemma.deadline) {
    const d = g.dilemma;
    chooseDilemma(g, d.choices[d.choices.length - 1].id, true);
  }
  updateWatches(g);

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
  const pts = [[WARMUP_START, 0.35], [H(6, 30), 0.6], [H(7, 30), 1.25], [H(8, 15), 1.6], [H(9, 0), 1.05], [H(9, 30), 0.7]];
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
        say(g, 'annonce', `Le train de ${fmtClock(lost.t)} au départ de ${line.stations[term].name} est supprimé, faute de rame disponible.`);
        say(g, 'voyageur', 'Supprimé. Évidemment.', term);
        g.events.push({ type: 'suppressed', k: term });
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
  tr.lock = false;
  tr.auth = false;
  tr.waitingAuth = false;
  tr.vip = false;
  tr.load = 0;
  tr.dwellLeft = board(g, tr, trip.origin);
}

function board(g, tr, k) {
  const d = di(tr.dir);
  const room = tr.capacity - tr.load;
  const w = g.waiting[k][d];
  const b = Math.min(w, room);
  tr.load += b;
  g.waiting[k][d] -= b;
  const left = g.waiting[k][d];
  if (inService(g) && left > 60) {
    g.stats.leftBehind += Math.round(left);
    g.sat -= left / 500;
    if (left > 150) say(g, 'voyageur', 'Plein à craquer, impossible de monter.', k);
  }
  return Math.round(30 + b * 0.045 + (left > 60 ? 15 : 0) + dwellBonus(g, k));
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
}

function updateTrain(g, tr) {
  if (tr.state === 'layover' || tr.state === 'depot') return;

  if (tr.state === 'dwell') {
    if (tr.dwellLeft > 0) tr.dwellLeft--;
    if (tr.lock && g.t - tr.lockSince >= HOLD_MAX) tr.lock = false;
    if (tr.dwellLeft > 0 || tr.lock) return;
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
    return;
  }

  if (trainImmobilised(g, tr) || segBlocked(g, tr.seg)) return;
  if (tr.prog < 1) {
    const sp = segSpeed(g, tr.seg) * tr.speed * (tr.degraded ? 0.7 : 1);
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
    if (trip.counted && inService(g)) recordArrival(g, tr, k);
    else if (tr.vip) settleVip(g, tr, false);
    if (k === 0 || k === LAST) {
      alight(g, tr, k);
      if (tr.retire) {
        tr.state = 'depot';
        say(g, 'info', `La rame du ${trip.num} rentre à l'atelier.`);
      } else {
        tr.state = 'layover';
        tr.layoverSince = g.t;
      }
      tr.trip = null;
      tr.vip = false;
      return;
    }
    // Terminus partiel : demi-tour, les voyageurs restants attendent le train suivant.
    g.waiting[k][di(tr.dir)] += tr.load;
    tr.load = 0;
    const nd = -tr.dir;
    tr.dir = nd;
    startTrip(g, tr, makeTrip(g, k, nd, g.t + TURNBACK_TIME));
    tr.dwellLeft = Math.max(tr.dwellLeft, TURNBACK_TIME);
    g.events.push({ type: 'turned', k });
    return;
  }

  tr.state = 'dwell';
  if (tr.skip || stationThrough(g, k)) {
    tr.dwellLeft = 0;
    return;
  }
  alight(g, tr, k);
  tr.dwellLeft = board(g, tr, k);
}

function recordArrival(g, tr, k) {
  const trip = tr.trip;
  const late = g.t - trip.arr[k];
  const ok = late < LATE;
  g.stats.counted++;
  if (ok) {
    g.stats.onTime++;
    g.streak++;
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    g.sat = Math.min(100, g.sat + 0.6);
    g.events.push({ type: 'ontime', k, num: trip.num, streak: g.streak });
    if (g.streak === 5 && !g.streakRewards[5]) { g.streakRewards[5] = true; queueEvent(g, 'croissants'); }
    if (g.streak === 10 && !g.streakRewards[10]) { g.streakRewards[10] = true; queueEvent(g, 'applaudissements'); }
  } else {
    if (g.streak >= 3) g.events.push({ type: 'streakLost', n: g.streak });
    g.streak = 0;
    g.events.push({ type: 'late', k, num: trip.num, mins: Math.floor(late / 60) });
  }
  if (tr.vip) settleVip(g, tr, ok);
}

function settleVip(g, tr, ok) {
  tr.vip = false;
  g.stats.dilemmasWon += ok ? 1 : 0;
  if (ok) {
    g.sat = Math.min(100, g.sat + 10);
    say(g, 'info', `Article élogieux : « Sur la U, le ${tr.trip.num} arrive pile à l'heure. »`);
    g.events.push({ type: 'win', text: 'Article élogieux · Satisfaction +10' });
  } else {
    g.sat -= 10;
    say(g, 'info', '« La U, toujours à la traîne » titre le journal.');
    g.events.push({ type: 'lose', text: 'Article assassin · Satisfaction −10' });
  }
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
  (m) => `${m} min d'attente. Quai noir de monde.`,
  () => 'Toujours bloqués. Personne ne sait rien.',
  () => 'On ne voit même plus la ligne jaune.',
  (m) => `${m} min que j'attends. La U, quoi.`,
];

function passengerChatter(g) {
  for (let k = 0; k < N; k++) {
    for (let d = 0; d < 2; d++) {
      const w = g.waiting[k][d];
      const key = `crowd-${k}`;
      if (w > 650 && (g.alerts[key] ?? 0) < g.t) {
        g.alerts[key] = g.t + 900;
        const rate = (line.demand[k][d] * demandProfile(g.t)) / 60 || 1;
        const m = Math.max(5, Math.round(w / rate / 60));
        say(g, 'voyageur', CHATTER[Math.floor(g.rng() * CHATTER.length)](m), k);
      }
    }
  }
}

function say(g, kind, text, k = null) {
  g.feed.unshift({ t: g.t, kind, text, k });
  if (g.feed.length > 40) g.feed.length = 40;
  g.events.push({ type: 'feed', kind, text, k });
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

function spawnIncident(g, p) {
  const def = INCIDENTS[p.type];
  const inc = { id: g.nextId++, type: p.type, start: g.t, left: def.natural, total: def.natural, crewId: null, alt: false, resolved: false };
  const r = p.r;
  const st = (k) => line.stations[k].name;
  const busy = (pred) => !!g.incidents.find((i) => !i.resolved && pred(i));
  let a;
  let b;

  switch (p.type) {
    case 'signal':
    case 'personnes': {
      inc.s = Math.floor(r * (N - 1));
      if (busy((i) => i.s === inc.s)) inc.s = (inc.s + 3) % (N - 1);
      a = st(inc.s); b = st(inc.s + 1);
      break;
    }
    case 'ligneL': {
      inc.segs = line.sharedL.slice();
      inc.s = line.sharedL[Math.floor(r * line.sharedL.length)];
      a = st(line.sharedL[0]); b = st(line.sharedL[line.sharedL.length - 1] + 1);
      break;
    }
    case 'ligneN': {
      inc.segs = line.sharedNC.slice();
      inc.s = line.sharedNC[Math.floor(r * line.sharedNC.length)];
      a = st(line.sharedNC[0]); b = st(LAST);
      if (p.natural) { inc.left = p.natural; inc.total = p.natural; }
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
      const cands = g.trains.filter((tr) => tr.trip && !tr.hlp && (p.type === 'panne' ? tr.state === 'run' && tr.prog < 0.85 : true) && !busy((i) => i.trainId === tr.id));
      if (!cands.length) return;
      const tr = cands[Math.floor(r * cands.length)];
      inc.trainId = tr.id;
      inc.num = tr.trip.num;
      a = st(tr.at); b = st(Math.min(LAST, Math.max(0, tr.at + tr.dir)));
      break;
    }
    case 'derangement':
      inc.k = g.node.k;
      break;
  }
  if (inc.k != null) inc.where = st(inc.k);
  else if (inc.segs) inc.where = `${a} ↔ ${b}`;
  else if (inc.s != null) inc.where = `${st(inc.s)} ↔ ${st(inc.s + 1)}`;
  else inc.where = `Train ${inc.num}`;

  g.incidents.push(inc);
  g.stats.incidents++;
  const text = def.annonce.replace('{a}', a).replace('{b}', b).replace('{st}', inc.where).replace('{num}', inc.num);
  say(g, 'annonce', `${text} Reprise estimée ${fmtClock(g.t + inc.left)}.`);
  g.events.push({ type: 'incident', inc });
}

function resolveIncident(g, inc) {
  inc.resolved = true;
  inc.resolvedAt = g.t;
  if (inc.crewId) g.stats.resolved++;
  if (inc.type === 'panne') {
    const tr = g.trains.find((x) => x.id === inc.trainId);
    if (tr && tr.trip) {
      tr.degraded = true;
      tr.retire = true;
      if (inc.alt) {
        tr.trip.counted = false;
        tr.hlp = true;
        tr.skip = true;
        tr.dump = true;
        tr.vip = false;
      }
    }
  }
  if (inc.type === 'derangement') for (const tr of g.trains) tr.waitingAuth = false;
  const lbl = INCIDENTS[inc.type].label;
  say(g, 'annonce', `Fin de l'incident (${lbl[0].toLowerCase()}${lbl.slice(1)}, ${inc.where}). Le trafic reprend.`);
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

// Les réponses possibles à un incident : le spécialiste, un autre agent, la solution alternative.
export function incidentOptions(g, inc) {
  const def = INCIDENTS[inc.type];
  const opts = [];
  if (inc.crewId || inc.alt) return opts;
  if (def.spec) {
    const spec = g.crew.find((c) => c.id === def.spec);
    opts.push({ kind: 'crew', crewId: spec.id, crew: spec, eta: def.specTime, ready: crewState(g, spec) === 'ready', best: true });
    const others = g.crew.filter((c) => c.id !== def.spec && crewState(g, c) === 'ready');
    if (others.length) opts.push({ kind: 'crew', crewId: others[0].id, crew: others[0], eta: def.otherTime, ready: true, best: false });
  }
  if (def.alt) opts.push({ kind: 'alt', label: def.alt.label, icon: def.alt.icon, hint: def.alt.hint });
  return opts;
}

// ---------------------------------------------------------------------------
// Dilemmes
// ---------------------------------------------------------------------------

function spawnEvent(g, p) {
  const def = EVENTS[p.type];
  const d = { id: g.nextId++, type: p.type, start: g.t, deadline: g.t + EVENT_WINDOW, vars: {}, choices: def.choices };
  if (p.type === 'journaliste') {
    const cands = g.trains.filter((tr) => tr.trip && tr.trip.counted && !tr.hlp && Math.abs(tr.trip.dest - tr.at) >= 5 && trainDelay(g, tr) < 120);
    if (!cands.length) return;
    const tr = cands[Math.floor(p.r * cands.length)];
    d.vars = { trainId: tr.id, num: tr.trip.num, dest: line.stations[tr.trip.dest].short };
  }
  if (p.type === 'directeur') {
    d.vars = { from: fmtClock(g.t + 600), to: fmtClock(g.t + 2400), fromT: g.t + 600, toT: g.t + 2400 };
  }
  d.title = fill(def.title, d.vars);
  d.choices = def.choices.map((c) => ({ ...c, hint: fill(c.hint, d.vars) }));
  g.dilemma = d;
  g.events.push({ type: 'dilemma', d });
}

function queueEvent(g, type) {
  g.plan.unshift({ t: g.t, kind: 'event', type, r: g.rng() });
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

function chooseDilemma(g, choiceId, timeout = false) {
  const d = g.dilemma;
  if (!d) return { ok: false };
  g.dilemma = null;
  const yes = choiceId === 'yes';
  if (yes) g.stats.dilemmas++;
  switch (d.type) {
    case 'journaliste': {
      const tr = g.trains.find((x) => x.id === d.vars.trainId);
      if (yes && tr && tr.trip) tr.vip = true;
      break;
    }
    case 'heuresup':
      if (yes) {
        const tr = newTrain(g, LAST);
        tr.layoverSince = g.t - MIN_LAYOVER;
        g.trains.push(tr);
        g.stats.revenue -= 400;
        say(g, 'info', 'Didier repart pour un aller. Une rame de plus à La Verrière.');
      }
      break;
    case 'directeur':
      if (yes) g.watches.push({ type: 'directeur', k: 6, from: d.vars.fromT, to: d.vars.toT, ok: true });
      else g.sat -= 2;
      break;
    case 'controle':
      if (yes) {
        g.stats.revenue += 600;
        g.watches.push({ type: 'controle', k: 8, from: g.t, to: g.t + 900 });
      }
      break;
    case 'rameNeuve':
      if (yes) {
        const tr = newTrain(g, 0, 'Z 50000');
        tr.layoverSince = g.t + 600 - MIN_LAYOVER;
        g.trains.push(tr);
        say(g, 'info', 'La Z 50000 neuve sera prête à La Défense dans 10 minutes.');
      }
      break;
    case 'ligneN':
      if (yes) {
        spawnIncident(g, { type: 'ligneN', r: g.rng(), natural: 480 });
        g.sat = Math.min(100, g.sat + 2);
      } else {
        g.plan.push({ t: g.t + 1200 + Math.floor(g.rng() * 600), kind: 'incident', type: 'ligneN', r: g.rng(), natural: 1080 });
        g.plan.sort((a, b) => a.t - b.t);
      }
      break;
    case 'croissants':
      for (const c of g.crew) if (!c.incidentId) c.readyAt = 0;
      break;
    case 'applaudissements':
      g.sat = Math.min(100, g.sat + 10);
      break;
  }
  g.events.push({ type: 'dilemmaClosed', d, choiceId, timeout });
  return { ok: true };
}

function updateWatches(g) {
  for (const w of g.watches) {
    if (w.done) continue;
    if (w.type === 'directeur') {
      if (g.t >= w.from && g.t < w.to && w.ok && Math.max(...g.waiting[w.k]) > 350) {
        w.ok = false;
        w.done = true;
        g.sat -= 6;
        say(g, 'info', 'Le directeur a vu les quais bondés de Versailles-Chantiers. Il n\'est pas content.');
        g.events.push({ type: 'lose', text: 'Directeur mécontent · Satisfaction −6' });
      } else if (g.t >= w.to) {
        w.done = true;
        g.sat = Math.min(100, g.sat + 8);
        g.stats.dilemmasWon++;
        say(g, 'info', 'Le directeur salue la tenue de Versailles-Chantiers.');
        g.events.push({ type: 'win', text: 'Directeur ravi · Satisfaction +8' });
      }
    } else if (g.t >= w.to) w.done = true;
  }
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
  acts.push({ type: 'hold', icon: tr.lock ? '▶' : '❚❚', label: tr.lock ? 'Libérer' : 'Retenir', enabled: atStation, on: tr.lock });
  const remaining = Math.abs(trip.dest - here) - 1;
  acts.push({ type: 'omit', icon: '»', label: 'Direct', enabled: !tr.skip && remaining >= 2 });
  let tb = null;
  for (let k = here; k !== trip.dest; k += tr.dir) {
    if (line.stations[k].turnback && !(atStation && k === trip.origin)) { tb = k; break; }
  }
  acts.push({ type: 'partial', icon: '↩', label: tb != null ? `Demi-tour` : 'Demi-tour', station: tb, where: tb != null ? line.stations[tb].short : null, enabled: tb != null });
  acts.push({ type: 'suppress', icon: '✕', label: 'Supprimer', enabled: true });
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
      if (!inc || !c || inc.crewId || inc.alt || crewState(g, c) !== 'ready') return { ok: false };
      const eta = crewEta(g, inc, c.id);
      if (eta == null) return { ok: false };
      inc.crewId = c.id;
      inc.left = Math.min(inc.left, eta);
      inc.total = inc.left;
      c.incidentId = inc.id;
      if (INCIDENTS[inc.type].spec === c.id) g.stats.specialist++;
      return { ok: true, spec: INCIDENTS[inc.type].spec === c.id };
    }
    case 'alt': {
      const inc = g.incidents.find((i) => i.id === a.incidentId && !i.resolved);
      if (!inc || inc.crewId || inc.alt || !INCIDENTS[inc.type].alt) return { ok: false };
      inc.alt = true;
      switch (inc.type) {
        case 'signal': break;
        case 'colis': inc.through = true; g.sat -= 2; break;
        case 'malaise': {
          const t = g.trains.find((x) => x.id === inc.trainId);
          if (t) {
            if (t.state === 'dwell') { g.waiting[t.at][di(t.dir)] += t.load; t.load = 0; } else t.dump = true;
          }
          inc.left = Math.min(inc.left, 120);
          inc.total = inc.left;
          g.sat -= 2;
          break;
        }
        case 'panne': inc.left = Math.min(inc.left, 360); inc.total = inc.left; g.sat -= 3; break;
        case 'personnes': inc.altAt = g.t + 240; break;
        case 'affluence': g.sat -= 2; break;
        case 'ligneL':
          inc.left = 1;
          g.plan.push({ t: g.t + 1200 + Math.floor(g.rng() * 600), kind: 'incident', type: 'ligneL', r: g.rng() });
          g.plan.sort((x, y) => x.t - y.t);
          say(g, 'info', 'Vos trains gardent la priorité. Le PCC de la L prend note.');
          break;
      }
      return { ok: true };
    }
    case 'hold': {
      if (!tr || tr.state !== 'dwell' || !tr.trip) return { ok: false };
      tr.lock = !tr.lock;
      tr.lockSince = g.t;
      return { ok: true, lock: tr.lock };
    }
    case 'omit': {
      if (!tr || !tr.trip || tr.skip) return { ok: false };
      const here = tr.state === 'dwell' ? tr.at : tr.at + tr.dir;
      const n = Math.abs(tr.trip.dest - here) - 1;
      if (n < 2) return { ok: false };
      tr.skip = true;
      tr.lock = false;
      if (tr.state === 'dwell') tr.dwellLeft = Math.min(tr.dwellLeft, 10);
      g.sat -= 1.2 * n;
      g.stats.omitted += n;
      say(g, 'annonce', `Le train ${tr.trip.num} sera direct jusqu'à ${line.stations[tr.trip.dest].name}.`);
      say(g, 'voyageur', 'Il ne s\'arrête même pas. Super.', here);
      return { ok: true };
    }
    case 'partial': {
      if (!tr || !tr.trip || a.station == null) return { ok: false };
      const k = a.station;
      tr.trip.dest = k;
      tr.trip.counted = false;
      tr.trip.partial = true;
      tr.lock = false;
      if (tr.vip) settleVip(g, tr, false);
      g.sat -= 3;
      g.stats.partial++;
      say(g, 'annonce', `Le train ${tr.trip.num} est limité à ${line.stations[k].name}.`);
      if (tr.state === 'dwell' && tr.at === k) arrive(g, tr, k);
      return { ok: true };
    }
    case 'suppress': {
      if (!tr || !tr.trip || tr.hlp) return { ok: false };
      tr.trip.counted = false;
      if (tr.vip) settleVip(g, tr, false);
      tr.hlp = true;
      tr.skip = true;
      tr.lock = false;
      if (tr.state === 'dwell') {
        g.waiting[tr.at][di(tr.dir)] += tr.load;
        tr.load = 0;
        tr.dwellLeft = Math.min(tr.dwellLeft, 20);
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
      if (r.at === 0) t.layoverSince = g.t - MIN_LAYOVER;
      else {
        t.dir = -1;
        startTrip(g, t, makeTrip(g, r.at, -1, g.t + 60, { counted: false, extra: true }));
        t.dwellLeft = Math.max(t.dwellLeft, 60);
      }
      say(g, 'info', `Rame de réserve de ${r.label} injectée.`);
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
        tr.dwellLeft += 180;
        tr.waitingAuth = false;
        tr.auth = true;
        g.sat -= 4;
        g.stats.conflicts++;
        say(g, 'annonce', 'Conflit d\'itinéraire à Versailles-Chantiers : arrêt d\'urgence.');
        return { ok: true, conflict: true };
      }
      tr.auth = true;
      tr.waitingAuth = false;
      g.node.busyUntil = g.t + 75;
      return { ok: true };
    }
    case 'choose':
      return chooseDilemma(g, a.choiceId);
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Fin de partie
// ---------------------------------------------------------------------------

function endGame(g, failed) {
  g.over = true;
  g.failed = failed;
  g.dilemma = null;
  if (!failed) {
    for (const tr of g.trains) {
      if (tr.trip && tr.trip.counted && !tr.hlp && trainDelay(g, tr) >= LATE) g.stats.counted++;
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
    bestStreak: g.bestStreak,
    transported: Math.round(g.stats.transported),
    revenue: Math.round(g.stats.revenue),
    endedAt: g.t,
  };
}

export function warmup(g) {
  while (g.t < SERVICE_START) step(g);
  g.events.length = 0;
  g.feed.length = 0;
  for (const row of g.waiting) {
    row[0] = Math.min(row[0], 120);
    row[1] = Math.min(row[1], 120);
  }
}
