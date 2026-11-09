// Teste les notifications de bout en bout en local : un faux service de notification reçoit les messages,
// les déchiffre comme un téléphone et vérifie la signature VAPID du serveur.
// Prérequis : PUSH_TEST_ALLOW=1 dans .dev.vars, puis npx wrangler dev.
import http from 'node:http';
import crypto from 'node:crypto';
import { missionById } from '../public/js/drive/route.js';
import { createRun, step, aiInput, computeSchedule, newLog, record } from '../public/js/drive/sim.js';

const BASE = process.env.API ?? 'http://localhost:8787';
const call = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, data: await r.json() };
};
const b64u = (b) => Buffer.from(b).toString('base64url');

// Faux téléphone : clé ECDH + secret d'authentification
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const uaPub = ecdh.getPublicKey();
const authSecret = crypto.randomBytes(16);
const hk = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
function decrypt(body) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPub);
  const ikm = hk(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.lastIndexOf(2)).toString());
}
function verifyVapid(h) {
  const m = /vapid t=([^,]+), k=(.+)/.exec(h);
  const [head, claims, sig] = m[1].split('.');
  const raw = Buffer.from(m[2], 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  return { ok, claims: JSON.parse(Buffer.from(claims, 'base64url')) };
}

const received = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const v = verifyVapid(req.headers.authorization);
      received.push({ path: req.url, enc: req.headers['content-encoding'], vapid: v.ok, aud: v.claims.aud, msg: decrypt(Buffer.concat(chunks)) });
    } catch (e) { received.push({ path: req.url, error: String(e) }); }
    res.writeHead(201); res.end();
  });
});
await new Promise((r) => server.listen(9911, r));

function play(id) {
  const m = missionById(id);
  const r = createRun(m, { sched: computeSchedule(m) });
  const log = newLog();
  while (!r.over) { const i = aiInput(r); i.lever = Math.round(i.lever * 100) / 100; record(log, i); step(r, i); r.events.length = 0; }
  return { n: log.n, l: log.l, h: log.h, c: log.c, f: log.f };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const st = Date.now() % 100000;
const A = (await call('/api/register', { method: 'POST', body: JSON.stringify({ pseudo: `Notif${st}`, password: 'secret12' }) })).data;
const B = (await call('/api/register', { method: 'POST', body: JSON.stringify({ pseudo: `Voleur${st}`, password: 'secret12' }) })).data;
const key = await call('/api/push/key');
console.log('clé VAPID', key.status, key.data.key?.length);
const sub = { endpoint: `http://localhost:9911/push/${st}`, keys: { p256dh: b64u(uaPub), auth: b64u(authSecret) } };
console.log('abonnement', (await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }, A.token)).status);
const bad = await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ ...sub, endpoint: 'https://evil.example.com/x' }) }, A.token);
console.log('service inconnu refusé', bad.status, bad.data.error);
console.log('test', (await call('/api/push/test', { method: 'POST' }, A.token)).data);

// A prend la tête d'une mission, puis B la lui vole (score plus haut : même conduite + un arrêt déjà fait)
// (mission du défi hebdo de la semaine prochaine : personne ne l'a encore jouée)
const { weeklyMission } = await import('../public/js/drive/route.js');
const fresh = weeklyMission(new Date(Date.now() + 86400000)).id;
const id = fresh.startsWith('weekly') ? 'l4' : fresh;
const { execSync: sh } = await import('node:child_process');
sh(`npx wrangler d1 execute ukipu --local --command "DELETE FROM best WHERE mission = '${id}'"`, { stdio: 'ignore' }); // base locale de test uniquement
const best = play(id);
const worse = { ...best, h: [] }; // même conduite sans klaxon : sanglier percuté, score plus bas
const first = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: id, log: worse }) }, A.token);
const steal = await call('/api/runs', { method: 'POST', body: JSON.stringify({ mission: id, log: best }) }, B.token);
console.log('mission', id, 'A', first.data.score, first.data.crown, '· B', steal.data.score);
console.log('vol de couronne', steal.data.crown, steal.data.dethroned);
// B sabote A
const sb = await call('/api/sabotage', { method: 'POST', body: JSON.stringify({ pseudo: A.user.pseudo, line: 'U', kind: 'feuilles' }) }, B.token);
console.log('sabotage', sb.status, sb.data.error ?? 'ok');
// chantier terminé : on lance une rénovation puis on la fait finir dans le passé
const ren = await call('/api/renovate', { method: 'POST', body: JSON.stringify({ station: 'Puteaux' }) }, A.token);
console.log('chantier', ren.status, ren.data.error ?? 'lancé');
const { execSync } = await import('node:child_process');
execSync(`npx wrangler d1 execute ukipu --local --command "UPDATE stations SET until = ${Date.now() - 1000} WHERE user_id = ${A.user.id}"`, { stdio: 'ignore' });
// tâche horaire (rappels)
console.log('cron', (await call('/api/cron', { method: 'POST' })).data);
await wait(1500);
console.log('notifications reçues :');
for (const r of received) console.log(' ', r.error ?? `${r.vapid ? 'signature ok' : 'SIGNATURE KO'} · ${r.enc} · ${r.msg.title} — ${r.msg.body} → ${r.msg.url}`);
server.close();
