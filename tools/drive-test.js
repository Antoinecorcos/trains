// Fait rouler le conducteur titulaire sur chaque mission pour vérifier horaires et notes.
import { MISSIONS, dailyMission } from '../js/drive/route.js';
import { createRun, step, aiInput, computeSchedule } from '../js/drive/sim.js';

for (const m of [...MISSIONS, dailyMission()]) {
  const sched = computeSchedule(m);
  const r = createRun(m, { sched });
  let n = 0;
  while (!r.over && n++ < 60 * 900) { step(r, aiInput(r)); r.events.length = 0; }
  const res = r.result;
  console.log(`${m.id.padEnd(16)} time=${res.time.toFixed(1)}s score=${res.score}/${res.ref} stars=${res.stars} combo=${res.bestCombo} grades=${res.grades.map((g) => `${g.grade}:${g.d?.toFixed(2)}:${g.gap?.toFixed(1)}`).join(' ')} pen=${Math.round(res.parts.penalty)} comfort=${res.comfort}`);
}
