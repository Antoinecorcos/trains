// Teste l'API locale (npx wrangler dev) : inscription, parties vérifiées, classement, fantôme, fil d'actu.
import { missionById } from '../public/js/drive/route.js';
import { createRun, step, aiInput, computeSchedule, newLog, record } from '../public/js/drive/sim.js';

const BASE = process.env.API ?? 'http://localhost:8787';
const call = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, data: await r.json() };
};

function play(id, sloppy = 0) {
  const m = missionById(id);
  const r = createRun(m, { sched: computeSchedule(m) });
  const log = newLog();
  while (!r.over) {
    const i = aiInput(r);
    i.lever = Math.round((i.lever + (sloppy && r.step % 97 === 0 ? sloppy : 0)) * 100) / 100;
    i.lever = Math.max(-1, Math.min(1, i.lever));
    i.horn = !!i.horn; i.close = !!i.close;
    record(log, i); step(r, i); r.events.length = 0;
  }
  return { log: { n: log.n, l: log.l, h: log.h, c: log.c }, score: r.result.score };
}

const stamp = Date.now() % 100000;
const a = await call('/api/register', { method: 'POST', body: JSON.stringify({ pseudo: `Antoine${stamp}`, password: 'secret12' }) });
const b = await call('/api/register', { method: 'POST', body: JSON.stringify({ pseudo: `Thomas${stamp}`, password: 'secret12' }) });
console.log('register', a.status, b.status, a.data.user?.pseudo);
const dup = await call('/api/register', { method: 'POST', body: JSON.stringify({ pseudo: `antoine${stamp}`, password: 'secret12' }) });
console.log('duplicate pseudo', dup.status, dup.data.error);
const bad = await call('/api/login', { method: 'POST', body: JSON.stringify({ pseudo: `Antoine${stamp}`, password: 'nope' }) });
console.log('bad login', bad.status, bad.data.error);

const sloppy = play('m1', 0.6);
const good = play('m1');
let t0 = Date.now();
const r1 = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: sloppy.log }) }, b.data.token);
console.log('thomas run', r1.status, 'client', sloppy.score, 'server', r1.data.score, r1.data, `${Date.now() - t0} ms`);
t0 = Date.now();
const r2 = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: good.log }) }, a.data.token);
console.log('antoine run', r2.status, 'client', good.score, 'server', r2.data.score, r2.data, `${Date.now() - t0} ms`);
const forged = { ...good.log, n: 50 };
const r3 = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: forged }) }, a.data.token);
console.log('truncated log', r3.status, r3.data.error);
const lb = await call('/api/leaderboard?mission=m1', {}, a.data.token);
console.log('leaderboard', lb.data.top.slice(0, 3).map((x) => `${x.rank}. ${x.pseudo} ${x.score}`), 'mine', lb.data.mine);
const gh = await call(`/api/ghost?mission=m1&pseudo=Thomas${stamp}`);
console.log('ghost frames', gh.status, gh.data.frames?.length);
const me = await call('/api/me', {}, a.data.token);
console.log('me', me.data.user.pseudo, me.data.progress);
const fd = await call('/api/feed');
console.log('feed', fd.data.events.slice(0, 4).map((e) => e.text));
const rk = await call('/api/ranking');
console.log('ranking', rk.data.players.slice(0, 3));
