// Fait rouler le conducteur titulaire sur chaque mission pour vérifier horaires, notes et rejeu.
import { MISSIONS, dailyMission, weeklyMission, lineOf } from '../public/js/drive/route.js';
import { withSabotage, SABOTAGES } from '../public/js/drive/reseau.js';
import { createRun, step, aiInput, computeSchedule, newLog, record, replay } from '../public/js/drive/sim.js';

const rame = process.argv[2] ?? 'Z2N';
const sabotaged = Object.keys(SABOTAGES).map((kind, i) => ({ ...withSabotage(MISSIONS[i * 3], { kind, by: 'Test' }), id: MISSIONS[i * 3].id }));
for (const m of [...MISSIONS, dailyMission(), weeklyMission(), ...sabotaged]) {
  const sched = computeSchedule(m);
  const r = createRun(m, { sched, rame: { id: rame, level: 1 } });
  const log = newLog();
  let n = 0;
  while (!r.over && n++ < 60 * 1200) {
    const i = aiInput(r);
    i.lever = Math.round(i.lever * 100) / 100; i.horn = !!i.horn; i.close = !!i.close;
    record(log, i); step(r, i); r.events.length = 0;
  }
  const res = r.result;
  const rp = replay(m, sched, log, { id: rame, level: 1 });
  const ok = rp.result && rp.result.score === res.score ? 'rejeu ok' : `REJEU ${rp.result?.score}`;
  console.log(`${lineOf(m).id} ${m.id.padEnd(15)} ${m.from}->${m.to} ${(res.time / 60).toFixed(1)} min ${String(res.score).padStart(6)}/${res.ref} ${'★'.repeat(res.stars)} arrêts=${res.grades.length} ${res.grades.filter((g) => g.grade !== 'parfait').map((g) => g.grade).join(',') || 'tout parfait'} ${ok}`);
}
