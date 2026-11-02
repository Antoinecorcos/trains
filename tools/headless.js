// Fait tourner des services sans affichage pour calibrer la difficulté.
// Usage : node tools/headless.js [nombre de parties] [politique: idle|bot]
import { createGame, warmup, step, apply, activeIncidents, crewState, trainDelay, trainActions } from '../js/sim.js';

const runs = Number(process.argv[2] ?? 20);
const policy = process.argv[3] ?? 'idle';

function bot(g) {
  for (const inc of activeIncidents(g)) {
    if (inc.crewId) continue;
    const ready = g.crew.filter((c) => crewState(g, c) === 'ready');
    const spec = ready.find((c) => c.id === ({ signal: 'aiguilleur', derangement: 'aiguilleur', colis: 'surete', personnes: 'surete', malaise: 'escale', affluence: 'escale', panne: 'maintenance' })[inc.type]);
    if (spec) apply(g, { type: 'dispatch', incidentId: inc.id, crewId: spec.id });
  }
  for (const tr of g.trains) {
    if (tr.waitingAuth && g.t >= g.node.busyUntil) apply(g, { type: 'authorize', trainId: tr.id });
  }
  if (g.dilemma) apply(g, { type: 'choose', choiceId: g.dilemma.choices[0].id });
  if (g.sat < 80) apply(g, { type: 'annonce' });
  for (const r of g.reserves) if (!r.used && g.t > 7 * 3600 + 30 * 60) apply(g, { type: 'reserve', reserveId: r.id });
}

const res = [];
for (let i = 0; i < runs; i++) {
  const g = createGame(1000 + i);
  warmup(g);
  let maxLoad = 0;
  while (!g.over) {
    step(g);
    if (policy === 'bot' && g.t % 150 === 0) bot(g);
    g.events.length = 0;
    for (const tr of g.trains) maxLoad = Math.max(maxLoad, tr.load);
  }
  res.push({ ...g.result, maxLoad: Math.round(maxLoad) });
}
const avg = (k) => (res.reduce((s, r) => s + r[k], 0) / res.length).toFixed(1);
console.log(`policy=${policy} runs=${runs}`);
console.log(`regularity=${avg('regularity')} sat=${avg('satisfaction')} stars=${avg('stars')} failed=${res.filter((r) => r.failed).length} counted=${avg('counted')} suppressed=${avg('suppressed')} transported=${avg('transported')} leftBehind=${avg('leftBehind')} maxLoad=${avg('maxLoad')}`);
for (const r of res.slice(0, 6)) console.log(JSON.stringify({ reg: r.regularity, sat: r.satisfaction, st: r.stars, f: r.failed, c: r.counted, sup: r.suppressed, inc: r.incidents, dil: r.dilemmas, won: r.dilemmasWon, streak: r.bestStreak, end: r.endedAt }));
