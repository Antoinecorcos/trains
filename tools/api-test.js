// Teste l'API locale (npx wrangler dev) : inscription, parties vérifiées, classement, fantôme, fil d'actu.
import { missionById, weeklyMission } from '../public/js/drive/route.js';
import { withSabotage } from '../public/js/drive/reseau.js';
import { createRun, step, aiInput, computeSchedule, newLog, record } from '../public/js/drive/sim.js';

const BASE = process.env.API ?? 'http://localhost:8787';
const call = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, data: await r.json() };
};

function play(id, sloppy = 0, sab = null) {
  const base = missionById(id);
  const m = withSabotage(base, sab);
  const r = createRun(m, { sched: computeSchedule(base) });
  const log = newLog();
  while (!r.over) {
    const i = aiInput(r);
    i.lever = Math.round((i.lever + (sloppy && r.step % 97 === 0 ? sloppy : 0)) * 100) / 100;
    i.lever = Math.max(-1, Math.min(1, i.lever));
    i.horn = !!i.horn; i.door = !!i.door; i.lights = !!i.lights;
    record(log, i); step(r, i); r.events.length = 0;
  }
  return { log: { n: log.n, l: log.l, h: log.h, c: log.c, f: log.f }, score: r.result.score };
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

// ---- Économie : profil, cadeau quotidien, boîtes, équipement, amélioration ----
const tok = a.data.token;
let prof = await call('/api/profile', {}, tok);
console.log('profile', prof.status, { tickets: prof.data.tickets, parts: prof.data.parts, rames: prof.data.rames, boxes: prof.data.boxes, equip: prof.data.equip });
const daily = await call('/api/daily', { method: 'POST' }, tok);
console.log('daily', daily.status, daily.data.gift);
const daily2 = await call('/api/daily', { method: 'POST' }, tok);
console.log('daily again', daily2.status, daily2.data.error);
for (const kind of ['standard', 'standard', 'rare']) {
  const o = await call('/api/box/open', { method: 'POST', body: JSON.stringify({ kind }) }, tok);
  console.log('open', kind, o.status, o.data.items ?? o.data.error);
}
const buy = await call('/api/box/buy', { method: 'POST', body: JSON.stringify({ kind: 'legendaire' }) }, tok);
console.log('buy legendaire (trop cher ?)', buy.status, buy.data.error ?? 'ok');
const eqBad = await call('/api/equip', { method: 'POST', body: JSON.stringify({ rame: 'Z6100' }) }, tok);
console.log('equip non possédée', eqBad.status, eqBad.data.error ?? 'possédée');
const runBad = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: good.log, rame: 'RERNG' }) }, tok);
console.log('run avec rame non possédée', runBad.status, runBad.data.error ?? runBad.data.score);
const up = await call('/api/rame/upgrade', { method: 'POST', body: JSON.stringify({ rame: 'Z2N' }) }, tok);
console.log('upgrade Z2N', up.status, up.data.level ?? up.data.error);
const lines = await call('/api/lines');
console.log('lines', JSON.stringify(lines.data.lines));
prof = await call('/api/profile', {}, tok);
console.log('profile after', { tickets: prof.data.tickets, parts: prof.data.parts, rames: prof.data.rames.length, livrees: prof.data.livrees, boxes: prof.data.boxes });

// ---- Réseau : caisses, chantiers, personnel, sabotage, semaine ----
let net = await call('/api/network', {}, tok);
console.log('network', net.status, { open: net.data.open, caisses: net.data.caisses, staff: net.data.staff.map((c) => `${c.name} (${c.rarity}, ${c.role})`), token: net.data.sabotageToken });
const col = await call('/api/collect', { method: 'POST' }, tok);
console.log('collect (vide)', col.status, col.data.error ?? col.data.collected);
const ren = await call('/api/renovate', { method: 'POST', body: JSON.stringify({ station: 'Saint-Cloud' }) }, tok);
console.log('renovate Saint-Cloud', ren.status, ren.data.error ?? { level: ren.data.level, minutes: Math.round((ren.data.until - Date.now()) / 60000) });
const ren2 = await call('/api/renovate', { method: 'POST', body: JSON.stringify({ station: 'Saint-Cloud' }) }, tok);
console.log('renovate twice', ren2.status, ren2.data.error);
const ren3 = await call('/api/renovate', { method: 'POST', body: JSON.stringify({ station: 'Rambouillet' }) }, tok);
console.log('renovate hors réseau', ren3.status, ren3.data.error);
net = await call('/api/network', {}, tok);
if (net.data.staff.length) {
  const as = await call('/api/staff/assign', { method: 'POST', body: JSON.stringify({ card: net.data.staff[0].id, line: 'U' }) }, tok);
  console.log('assign staff U', as.status, as.data.error ?? as.data.staff.filter((c) => c.line).map((c) => `${c.name} → ${c.line}`));
}
const asBad = await call('/api/staff/assign', { method: 'POST', body: JSON.stringify({ card: 'nadia', line: 'C' }) }, tok);
console.log('assign ligne fermée / carte absente', asBad.status, asBad.data.error);

// Thomas sabote Antoine sur la U ; Antoine roule (bien) : sabotage déjoué
const tg = await call('/api/targets', {}, b.data.token);
console.log('targets', tg.status, tg.data.players?.filter((x) => x.pseudo.endsWith(String(stamp))));
const sb = await call('/api/sabotage', { method: 'POST', body: JSON.stringify({ pseudo: `Antoine${stamp}`, line: 'U', kind: 'sanglier' }) }, b.data.token);
console.log('sabotage', sb.status, sb.data.error ?? { pseudo: sb.data.pseudo, line: sb.data.line, kind: sb.data.kind });
const sb2 = await call('/api/sabotage', { method: 'POST', body: JSON.stringify({ pseudo: `Antoine${stamp}`, line: 'U', kind: 'signal' }) }, b.data.token);
console.log('sabotage twice', sb2.status, sb2.data.error);
const sbL = await call('/api/sabotage', { method: 'POST', body: JSON.stringify({ pseudo: `Thomas${stamp}`, line: 'C', kind: 'signal' }) }, tok);
console.log('sabotage ligne non exploitée', sbL.status, sbL.data.error);
net = await call('/api/network', {}, tok);
console.log('incoming', net.data.incoming);
const sabPlay = play('m1', 0, { kind: 'sanglier', by: `Thomas${stamp}` });
const rs = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: sabPlay.log }) }, tok);
console.log('run sabotée', rs.status, 'client', sabPlay.score, 'server', rs.data.score, rs.data.sabotage, rs.data.reward);
net = await call('/api/network', {}, tok);
console.log('incoming after', net.data.incoming.length);

// Défi hebdo
const wk = weeklyMission();
const wp = play(wk.id);
const rw = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: wk.id, log: wp.log }) }, tok);
console.log('weekly run', rw.status, 'client', wp.score, 'server', rw.data.score, rw.data.crown, rw.data.reward);
const wkly = await call('/api/weekly');
console.log('weekly', wkly.status, { regulateur: wkly.data.current.regulateur, udor: wkly.data.current.udor, line: wkly.data.current.line });
const bl = await call('/api/bulletin?week=current');
console.log('bulletin', bl.status, { runs: bl.data.runs, crowns: bl.data.crowns, sabotages: bl.data.sabotages, mostActive: bl.data.mostActive, udor: bl.data.udor });
const fd2 = await call('/api/feed');
console.log('feed', fd2.data.events.slice(0, 5).map((e) => e.text));

// ---- Saison et Pass Navigo (paiement simulé par un webhook signé : STRIPE_WEBHOOK_SECRET=whsec_test_local dans .dev.vars) ----
const { createHmac } = await import('node:crypto');
let ss = await call('/api/season', {}, tok);
console.log('season', ss.status, { key: ss.data.key, name: ss.data.name, xp: ss.data.xp, tier: ss.data.tier, pass: ss.data.pass, payments: ss.data.payments });
for (let i = 0; i < 2; i++) await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: 'm1', log: good.log }) }, tok);
ss = await call('/api/season', {}, tok);
console.log('xp après services', ss.data.xp, 'palier', ss.data.tier);
let cl = await call('/api/season/claim', { method: 'POST' }, tok);
console.log('claim gratuit', cl.status, cl.data.error ?? cl.data.got);
const co = await call('/api/pass/checkout', { method: 'POST', body: '{}' }, tok);
console.log('checkout sans Stripe', co.status, co.data.error);
const sign = (payload) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', 'whsec_test_local').update(`${t}.${payload}`).digest('hex')}`; };
const hook = async (obj, bad) => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: obj } });
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': bad ? 't=1,v1=00' : sign(payload) }, body: payload });
  return { status: r.status, data: await r.json() };
};
const me2 = await call('/api/me', {}, tok);
const meB = await call('/api/me', {}, b.data.token);
const sess = { id: `cs_test_${stamp}`, payment_status: 'paid', amount_total: 299, metadata: { buyer: String(me2.data.user.id), target: String(me2.data.user.id), season: String(ss.data.key) } };
console.log('webhook mal signé', (await hook(sess, true)).status);
console.log('webhook', (await hook(sess)).data, 'rejoué', (await hook(sess)).data);
ss = await call('/api/season', {}, tok);
console.log('pass actif', ss.data.pass);
cl = await call('/api/season/claim', { method: 'POST' }, tok);
console.log('claim pass', cl.status, cl.data.got);
ss = await call('/api/season', {}, tok);
console.log('cosmétiques', ss.data.cosmetics);
const eq = await call('/api/cosmetics', { method: 'POST', body: JSON.stringify({ rameName: 'La Bête de Trappes' }) }, tok);
console.log('nom de rame', eq.status, eq.data.equip ?? eq.data.error);
const hornBad = await call('/api/cosmetics', { method: 'POST', body: JSON.stringify({ horn: 'horn:12' }) }, tok);
console.log('klaxon non possédé', hornBad.status, hornBad.data.error);
const netP = await call('/api/network', {}, tok);
console.log('avantages Pass', { slots: netP.data.slots, caisseU: netP.data.caisses.U });
// cadeau : Antoine offre le Pass à Thomas
const gift = { id: `cs_test_gift_${stamp}`, payment_status: 'paid', amount_total: 299, metadata: { buyer: String(me2.data.user.id), target: String(meB.data.user.id), season: String(ss.data.key) } };
console.log('cadeau', (await hook(gift)).data);
const coAgain = await call('/api/pass/checkout', { method: 'POST', body: JSON.stringify({ gift: `Thomas${stamp}` }) }, tok);
console.log('re-offrir', coAgain.status, coAgain.data.error);
const rk2 = await call('/api/ranking');
console.log('badges', rk2.data.players.filter((x) => x.pseudo.endsWith(String(stamp))).map((x) => `${x.pseudo} ${x.pass ? '🎫' : ''}`));
const fd3 = await call('/api/feed');
console.log('fil', fd3.data.events.slice(0, 3).map((e) => e.text));
// Colis Navigo
prof = await call('/api/profile', {}, tok);
if (prof.data.boxes.navigo) { const o = await call('/api/box/open', { method: 'POST', body: JSON.stringify({ kind: 'navigo' }) }, tok); console.log('Colis Navigo', o.status, o.data.items ?? o.data.error); }
const buyNav = await call('/api/box/buy', { method: 'POST', body: JSON.stringify({ kind: 'navigo' }) }, tok);
console.log('acheter un Colis Navigo', buyNav.status, buyNav.data.error);
