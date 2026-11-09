// Serveur Ukipu (Cloudflare Worker + base D1).
// Sert le jeu (fichiers statiques) et l'API /api/* : comptes, parties vérifiées, classements, fantômes, fil d'actu.
// Le serveur fait foi : il rejoue chaque partie à partir du journal des commandes et recalcule le score.

import { missionById, dailyKey, weekKey, MISSIONS, LINES, RAMES, LIVREES } from '../public/js/drive/route.js';
import { withSabotage, SABOTAGES, ROLES } from '../public/js/drive/reseau.js';
import { computeSchedule, replay } from '../public/js/drive/sim.js';
import {
  ECONOMY_SCHEMA, MIGRATIONS, ensureWallet, profile, touch, ownedRame, ownsLivree, addBox, addTickets, openBox, buyBox, upgradeRame, equip, claimDaily, runReward,
} from './economy.js';
import {
  NETWORK_SCHEMA, NETWORK_MIGRATIONS, network, collect, renovate, assignStaff, sabotage, pendingSabotage, runTicketsFx, weekly, bulletin, openLines,
} from './network.js';
import {
  SAISON_SCHEMA, SAISON_MIGRATIONS, addXp, seasonState, claimAll, equipCosmetics, checkout, confirm, webhook, passHolders,
} from './saison.js';
import { xpFor } from '../public/js/drive/saison.js';
import { VERSION } from '../public/js/drive/version.js';
import { PUSH_SCHEMA, publicKey, subscribe, unsubscribe, notify } from './push.js';
import { cron } from './cron.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS best (
    user_id INTEGER NOT NULL,
    mission TEXT NOT NULL,
    score INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    time REAL NOT NULL,
    frames TEXT NOT NULL,
    grades TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, mission)
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mission TEXT NOT NULL,
    score INTEGER NOT NULL,
    stars INTEGER NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    mission TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS best_mission ON best (mission, score DESC)',
];

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([...SCHEMA, ...ECONOMY_SCHEMA, ...NETWORK_SCHEMA, ...SAISON_SCHEMA, ...PUSH_SCHEMA].map((q) => env.DB.prepare(q)));
  for (const q of [...MIGRATIONS, ...NETWORK_MIGRATIONS, ...SAISON_MIGRATIONS]) { try { await env.DB.prepare(q).run(); } catch { /* colonne déjà présente */ } }
  schemaReady = true;
}

// Les notifications partent en arrière-plan : la réponse au joueur n'attend pas les services de notification
const withBackground = (env, ctx) => Object.assign(Object.create(env), {
  bg: (p) => (ctx?.waitUntil ? ctx.waitUntil(Promise.resolve(p).catch((e) => console.error('bg', e))) : p),
});

export default {
  // Toutes les heures : rappels (caisses pleines, chantiers terminés, cadeau du jour)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { await ensureSchema(env); await cron(env, event.scheduledTime); })().catch((e) => console.error('cron', e)));
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    env = withBackground(env, ctx);
    try {
      await ensureSchema(env);
      return await route(req, env, url);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return json({ error: status === 500 ? 'Erreur du serveur, réessaie dans un instant.' : e.message }, status);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

async function body(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 400_000) throw new HttpError(413, 'Données trop volumineuses.');
  try { return await req.json(); } catch { throw new HttpError(400, 'Requête illisible.'); }
}

async function route(req, env, url) {
  const p = url.pathname;
  const m = req.method;
  if (p === '/api/health') return json({ ok: true, today: dailyKey(), version: VERSION });
  if (p === '/api/register' && m === 'POST') return register(env, await body(req));
  if (p === '/api/login' && m === 'POST') return login(env, await body(req));
  if (p === '/api/logout' && m === 'POST') return logout(req, env);
  if (p === '/api/me' && m === 'GET') return me(env, await auth(req, env));
  if (p === '/api/runs' && m === 'POST') return submitRun(env, await auth(req, env), await body(req));
  if (p === '/api/leaderboard' && m === 'GET') return leaderboard(env, url.searchParams.get('mission'), await auth(req, env, true));
  if (p === '/api/ghost' && m === 'GET') return ghost(env, url.searchParams.get('mission'), url.searchParams.get('pseudo'));
  if (p === '/api/feed' && m === 'GET') return feed(env);
  if (p === '/api/ranking' && m === 'GET') return ranking(env);
  if (p === '/api/lines' && m === 'GET') return lineCrowns(env);
  if (p === '/api/profile' && m === 'GET') {
    const u = await auth(req, env);
    const back = await touch(env, u.id);
    if (back) await addEvent(env, 'join', `🚆 ${u.pseudo} reprend du service après ${back.days} jours d'absence. Gare à vos couronnes.`);
    return json({ ...(await profile(env, u.id)), welcomeBack: back });
  }
  if (p === '/api/equip' && m === 'POST') { const u = await auth(req, env); const b = await body(req); await equip(env, u.id, b.rame, b.livree); return json(await profile(env, u.id)); }
  if (p === '/api/box/open' && m === 'POST') { const u = await auth(req, env); const b = await body(req); const items = await openBox(env, u.id, String(b.kind)); await boxEvent(env, u, items); return json({ items, profile: await profile(env, u.id) }); }
  if (p === '/api/box/buy' && m === 'POST') { const u = await auth(req, env); const b = await body(req); await buyBox(env, u.id, String(b.kind)); return json(await profile(env, u.id)); }
  if (p === '/api/rame/upgrade' && m === 'POST') { const u = await auth(req, env); const b = await body(req); const level = await upgradeRame(env, u.id, String(b.rame)); return json({ level, profile: await profile(env, u.id) }); }
  if (p === '/api/daily' && m === 'POST') {
    const u = await auth(req, env);
    const now = new Date();
    const gift = await claimDaily(env, u.id, dailyKey(now), dailyKey(new Date(now.getTime() - 86400000)));
    return json({ gift, profile: await profile(env, u.id) });
  }
  // Réseau : caisses, chantiers, personnel, sabotage, semaine
  if (p === '/api/network' && m === 'GET') return json(await network(env, await auth(req, env)));
  if (p === '/api/collect' && m === 'POST') { const u = await auth(req, env); const n = await collect(env, u); return json({ collected: n, network: await network(env, u), profile: await profile(env, u.id) }); }
  if (p === '/api/renovate' && m === 'POST') {
    const u = await auth(req, env);
    const b = await body(req);
    const r = await renovate(env, u, b.station);
    return json({ ...r, network: await network(env, u), profile: await profile(env, u.id) });
  }
  if (p === '/api/staff/assign' && m === 'POST') { const u = await auth(req, env); const b = await body(req); await assignStaff(env, u, b.card, b.line || null); return json(await network(env, u)); }
  if (p === '/api/sabotage' && m === 'POST') {
    const u = await auth(req, env);
    const r = await sabotage(env, u, await body(req));
    env.bg(notify(env, r.targetId, { title: '😈 Sabotage !', body: `${u.pseudo} t'a saboté sur la ${LINES[r.line].name} : ${SABOTAGES[r.kind].text}. Déjoue-le sur ton prochain service !`, url: '/?tab=reseau', tag: 'sabotage' }));
    return json({ ...r, network: await network(env, u) });
  }
  if (p === '/api/targets' && m === 'GET') return targets(env, await auth(req, env));
  if (p === '/api/weekly' && m === 'GET') {
    const now = new Date();
    return json({ current: await weekly(env, weekKey(now)), previous: await weekly(env, weekKey(new Date(now.getTime() - 7 * 86400000))) });
  }
  if (p === '/api/bulletin' && m === 'GET') {
    const now = new Date();
    const key = url.searchParams.get('week') === 'current' ? weekKey(now) : weekKey(new Date(now.getTime() - 7 * 86400000));
    return json(await bulletin(env, key));
  }
  // Saison et Pass Navigo
  if (p === '/api/season' && m === 'GET') return json(await seasonState(env, await auth(req, env)));
  if (p === '/api/season/claim' && m === 'POST') {
    const u = await auth(req, env);
    const got = await claimAll(env, u);
    return json({ got, season: await seasonState(env, u), profile: await profile(env, u.id) });
  }
  if (p === '/api/cosmetics' && m === 'POST') { const u = await auth(req, env); await equipCosmetics(env, u, await body(req)); return json(await seasonState(env, u)); }
  if (p === '/api/pass/checkout' && m === 'POST') { const u = await auth(req, env); return json(await checkout(env, u, await body(req), url.origin)); }
  if (p === '/api/pass/confirm' && m === 'POST') {
    const u = await auth(req, env);
    const b = await body(req);
    return json({ ...(await confirm(env, u, b.session_id, addEvent)), season: await seasonState(env, u) });
  }
  if (p === '/api/stripe/webhook' && m === 'POST') return json(await webhook(env, req, addEvent));
  // Notifications
  if (p === '/api/push/key' && m === 'GET') return json({ key: await publicKey(env) });
  if (p === '/api/push/subscribe' && m === 'POST') { const u = await auth(req, env); await subscribe(env, u, await body(req), url.origin); return json({ ok: true }); }
  if (p === '/api/push/unsubscribe' && m === 'POST') { const u = await auth(req, env); const b = await body(req); await unsubscribe(env, u, b.endpoint); return json({ ok: true }); }
  if (p === '/api/push/test' && m === 'POST') {
    const u = await auth(req, env);
    const r = await notify(env, u.id, { title: '🚆 Ukipu', body: 'Les notifications marchent : on te préviendra quand on te vole une couronne.', url: '/', tag: 'test' }, { force: true });
    return json(r);
  }
  if (p === '/api/cron' && m === 'POST' && env.PUSH_TEST_ALLOW === '1') return json(await cron(env, Date.now(), { force: true })); // tests locaux
  throw new HttpError(404, 'Adresse inconnue.');
}

// Joueurs que l'on peut saboter, avec les lignes qu'ils exploitent
async function targets(env, user) {
  const users = await env.DB.prepare('SELECT id, pseudo FROM users WHERE id != ? ORDER BY pseudo COLLATE NOCASE LIMIT 60').bind(user.id).all();
  const pend = await env.DB.prepare("SELECT to_user, line FROM sabotages WHERE state = 'pending'").all();
  const out = [];
  for (const u of users.results) {
    const open = await openLines(env, u.id);
    out.push({ pseudo: u.pseudo, lines: open, pending: pend.results.filter((x) => x.to_user === u.id).map((x) => x.line) });
  }
  return json({ players: out });
}

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

const PSEUDO = /^[\p{L}\p{N}_.-]{3,16}$/u;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 20000 }, key, 256);
  return hex(bits);
}

const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function newSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created) VALUES (?, ?, ?)').bind(await sha256(token), userId, Date.now()).run();
  return token;
}

async function register(env, b) {
  const pseudo = String(b.pseudo ?? '').trim();
  const password = String(b.password ?? '');
  if (!PSEUDO.test(pseudo)) throw new HttpError(400, 'Pseudo : 3 à 16 caractères (lettres, chiffres, _ . -).');
  if (password.length < 6) throw new HttpError(400, 'Mot de passe : 6 caractères minimum.');
  const exists = await env.DB.prepare('SELECT id FROM users WHERE pseudo = ?').bind(pseudo).first();
  if (exists) throw new HttpError(409, 'Ce pseudo est déjà pris.');
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const res = await env.DB.prepare('INSERT INTO users (pseudo, pass_hash, salt, created) VALUES (?, ?, ?, ?)').bind(pseudo, hash, salt, Date.now()).run();
  const id = res.meta.last_row_id;
  await ensureWallet(env, id);
  await addBox(env, id, 'standard', 1);
  await addEvent(env, 'join', `🚆 ${pseudo} a pris son service sur la ligne U.`);
  return json({ token: await newSession(env, id), user: { id, pseudo } });
}

async function login(env, b) {
  const pseudo = String(b.pseudo ?? '').trim();
  const password = String(b.password ?? '');
  const u = await env.DB.prepare('SELECT id, pseudo, pass_hash, salt FROM users WHERE pseudo = ?').bind(pseudo).first();
  if (!u || !sameHash(await hashPassword(password, u.salt), u.pass_hash)) throw new HttpError(401, 'Pseudo ou mot de passe incorrect.');
  return json({ token: await newSession(env, u.id), user: { id: u.id, pseudo: u.pseudo } });
}

async function auth(req, env, optional = false) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (token) {
    const u = await env.DB.prepare('SELECT u.id, u.pseudo FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(await sha256(token)).first();
    if (u) return u;
  }
  if (optional) return null;
  throw new HttpError(401, 'Connecte-toi pour enregistrer tes parties.');
}

async function logout(req, env) {
  const h = req.headers.get('authorization') || '';
  if (h.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(h.slice(7))).run();
  return json({ ok: true });
}

async function me(env, user) {
  const rows = await env.DB.prepare('SELECT mission, score, stars FROM best WHERE user_id = ?').bind(user.id).all();
  const progress = {};
  for (const r of rows.results) progress[r.mission] = { score: r.score, stars: r.stars };
  return json({ user, progress });
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

async function scheduleFor(env, mission) {
  const key = `${mission.id}@4`;
  const row = await env.DB.prepare('SELECT data FROM schedules WHERE mission = ?').bind(key).first();
  if (row) return JSON.parse(row.data);
  const s = computeSchedule(mission);
  const sched = { arr: s.arr, dep: s.dep };
  await env.DB.prepare('INSERT OR REPLACE INTO schedules (mission, data) VALUES (?, ?)').bind(key, JSON.stringify(sched)).run();
  return sched;
}

function checkMission(id) {
  const m = missionById(String(id || ''));
  if (!m) throw new HttpError(400, 'Mission inconnue.');
  if (m.daily) {
    const key = Number(m.id.slice(6));
    const now = new Date();
    const ok = [-1, 0, 1].some((d) => dailyKey(new Date(now.getTime() + d * 86400000)) === key);
    if (!ok) throw new HttpError(400, 'Ce défi du jour est terminé.');
  }
  if (m.weekly || m.rush) {
    const key = Number(m.id.slice(m.rush ? 5 : 7));
    const now = new Date();
    const ok = [-1, 0, 1].some((d) => weekKey(new Date(now.getTime() + d * 86400000)) === key);
    if (!ok) throw new HttpError(400, m.rush ? 'Cette heure de pointe est terminée.' : 'Ce défi hebdo est terminé.');
  }
  return m;
}

function checkLog(log) {
  const ok = log && Number.isInteger(log.n) && log.n > 0 && log.n < 60 * 60 * 20
    && Array.isArray(log.l) && Array.isArray(log.h) && Array.isArray(log.c)
    && log.l.length < 20000 && log.h.length < 2000 && log.c.length < 400
    && log.l.every((e) => Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === 'number' && e[1] >= -1 && e[1] <= 1)
    && log.h.every(Number.isInteger) && log.c.every(Number.isInteger)
    && (log.f == null || (Array.isArray(log.f) && log.f.length < 4000 && log.f.every(Number.isInteger)));
  if (!ok) throw new HttpError(400, 'Journal de conduite invalide.');
}

async function submitRun(env, user, b) {
  const mission = checkMission(b.mission);
  checkLog(b.log);
  const sched = await scheduleFor(env, mission);
  await ensureWallet(env, user.id);
  // Rame et livrée : il faut les posséder (le défi du jour impose sa rame)
  let rame = { id: 'Z2N', level: 1 };
  if (!mission.fixedRame && b.rame && RAMES[b.rame]) {
    const own = await ownedRame(env, user.id, b.rame);
    if (!own) throw new HttpError(400, 'Cette rame ne fait pas partie de ta collection.');
    rame = { id: b.rame, level: own.level };
  }
  const livree = b.livree && LIVREES[b.livree] && (await ownsLivree(env, user.id, b.livree)) ? b.livree : 'origine';
  // Un sabotage en attente sur cette ligne s'applique au service (jamais aux défis à armes égales)
  const sab = mission.daily || mission.weekly || mission.rush ? null : await pendingSabotage(env, user.id, mission.line);
  const played = sab ? withSabotage(mission, { kind: sab.kind, by: sab.by }) : mission;
  const r = replay(played, sched, b.log, rame);
  if (!r.over) throw new HttpError(400, 'Partie incomplète : elle n\'a pas pu être vérifiée.');
  const res = r.result;
  const now = Date.now();
  await env.DB.prepare('INSERT INTO runs (user_id, mission, score, stars, at, pct, line) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, mission.id, res.score, res.stars, now, Math.max(0, res.score) / res.ref, mission.line).run();

  const prev = await env.DB.prepare('SELECT score, stars FROM best WHERE user_id = ? AND mission = ?').bind(user.id, mission.id).first();
  const leaderBefore = await env.DB.prepare('SELECT b.user_id, u.pseudo, b.score FROM best b JOIN users u ON u.id = b.user_id WHERE b.mission = ? ORDER BY b.score DESC, b.at ASC LIMIT 1').bind(mission.id).first();
  const isBest = !prev || res.score > prev.score;
  if (isBest) {
    const grades = JSON.stringify(res.grades.map((g) => ({ name: g.name, grade: g.grade, d: g.d == null ? null : Math.round(g.d * 100) / 100 })));
    await env.DB.prepare(`INSERT INTO best (user_id, mission, score, stars, time, frames, grades, at, rame, livree) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, mission) DO UPDATE SET score = excluded.score, stars = MAX(best.stars, excluded.stars), time = excluded.time, frames = excluded.frames, grades = excluded.grades, at = excluded.at, rame = excluded.rame, livree = excluded.livree`)
      .bind(user.id, mission.id, res.score, res.stars, res.time, JSON.stringify(r.frames), grades, now, rame.id, livree).run();
  } else if (res.stars > prev.stars) {
    await env.DB.prepare('UPDATE best SET stars = ? WHERE user_id = ? AND mission = ?').bind(res.stars, user.id, mission.id).run();
  }

  // Couronne et fil d'actu
  let crown = false;
  let dethroned = null;
  if (isBest && (!leaderBefore || res.score > leaderBefore.score)) {
    crown = true;
    if (leaderBefore && leaderBefore.user_id !== user.id) {
      dethroned = leaderBefore.pseudo;
      env.bg(notify(env, leaderBefore.user_id, mission.weekly
        ? { title: '🎖️ Couronne de régulateur perdue', body: `${user.pseudo} te prend le défi hebdo avec ${fmt(res.score)} pts. Reprends-la !`, url: '/?tab=classement', tag: `crown-${mission.id}` }
        : { title: '👑 Couronne volée !', body: `${user.pseudo} t'a pris la tête de « ${mission.title} » (${fmt(res.score)} pts).`, url: '/?tab=departs', tag: `crown-${mission.id}` }));
      await addEvent(env, 'crown', mission.weekly
        ? `🎖️ ${user.pseudo} prend la couronne de régulateur de la semaine à ${dethroned} (${fmt(res.score)} pts).`
        : `👑 ${user.pseudo} prend la tête de « ${mission.title} » (${fmt(res.score)} pts) et détrône ${dethroned}.`);
    } else if (!leaderBefore) {
      await addEvent(env, 'crown', `👑 ${user.pseudo} ouvre le classement de « ${mission.title} » avec ${fmt(res.score)} pts.`);
    }
  } else if (res.stars === 3 && (!prev || prev.stars < 3)) {
    await addEvent(env, 'stars', `⭐ ${user.pseudo} décroche 3 étoiles sur « ${mission.title} ».`);
  }
  const perfect = res.grades.filter((g) => g.grade === 'parfait').length;
  if (perfect === res.grades.length && perfect >= 4) await addEvent(env, 'perfect', `🎯 ${user.pseudo} : que des arrêts PARFAIT sur « ${mission.title} ».`);
  if (res.stats.hits) await addEvent(env, 'shame', `🐗 ${user.pseudo} a percuté un sanglier sur « ${mission.title} ».`);
  if (res.stats.spad) await addEvent(env, 'shame', `🚨 ${user.pseudo} a franchi un signal fermé sur « ${mission.title} ».`);

  // Sabotage : déjoué (2 étoiles sans percuter ni franchir de signal) ou réussi
  let sabotageOut = null;
  const fx = await runTicketsFx(env, user.id, mission.line);
  if (sab) {
    const foiled = res.stars >= 2 && !res.stats.hits && !res.stats.spad;
    const what = SABOTAGES[sab.kind].name.toLowerCase();
    const bonus = foiled ? Math.round(80 * (fx.foil ?? 1)) : 60;
    await env.DB.prepare('UPDATE sabotages SET state = ?, done_at = ? WHERE id = ?').bind(foiled ? 'foiled' : 'success', now, sab.id).run();
    env.bg(notify(env, sab.from_user, foiled
      ? { title: '🛡️ Sabotage déjoué', body: `${user.pseudo} a déjoué ton sabotage sur la ${LINES[mission.line].name}. Raté !`, url: '/?tab=classement', tag: 'sabotage-result' }
      : { title: '😈 Sabotage réussi', body: `Ton sabotage a eu raison de ${user.pseudo} sur la ${LINES[mission.line].name} : +${bonus} 🎟`, url: '/?tab=classement', tag: 'sabotage-result' }));
    if (foiled) {
      await addTickets(env, user.id, bonus);
      await addEvent(env, 'sabotage', `🛡️ ${user.pseudo} a déjoué le sabotage de ${sab.by} (${what}) sur la ${LINES[mission.line].name}.`);
    } else {
      await addTickets(env, sab.from_user, bonus);
      await addEvent(env, 'sabotage', `😈 Le sabotage de ${sab.by} (${what}) a eu raison de ${user.pseudo} sur la ${LINES[mission.line].name}.`);
    }
    sabotageOut = { by: sab.by, kind: sab.kind, foiled, bonus: foiled ? bonus : 0 };
  }

  // Récompenses : tickets à chaque partie, colis pour les exploits
  const reward = { tickets: Math.round(runReward(res) * (fx.tickets ?? 1)), boxes: [] };
  if (res.stars === 3 && (!prev || prev.stars < 3)) reward.boxes.push('rare');
  if (crown && dethroned) reward.boxes.push('rare');
  if (mission.daily || mission.weekly || mission.rush) {
    const already = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE user_id = ? AND mission = ?').bind(user.id, mission.id).first();
    if (already.n === 1) reward.boxes.push('standard');
  }
  await addTickets(env, user.id, reward.tickets);
  await env.DB.prepare('UPDATE wallet SET runs = runs + 1 WHERE user_id = ?').bind(user.id).run();
  const season = await addXp(env, user.id, xpFor(mission, res));
  for (const kind of reward.boxes) await addBox(env, user.id, kind);

  const rank = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE mission = ? AND score > ?').bind(mission.id, isBest ? res.score : prev.score).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE mission = ?').bind(mission.id).first();
  return json({
    score: res.score, stars: res.stars, best: isBest, previous: prev?.score ?? null,
    rank: rank.n + 1, players: total.n, crown, dethroned, reward, sabotage: sabotageOut, season,
  });
}

async function leaderboard(env, missionId, user) {
  const mission = missionById(String(missionId || ''));
  if (!mission) throw new HttpError(400, 'Mission inconnue.');
  const rows = await env.DB.prepare(`SELECT u.id, u.pseudo, b.score, b.stars, b.time, b.grades, b.rame, b.livree, w.rame_name FROM best b JOIN users u ON u.id = b.user_id
    LEFT JOIN wallet w ON w.user_id = u.id WHERE b.mission = ? ORDER BY b.score DESC, b.at ASC LIMIT 20`).bind(mission.id).all();
  const pass = await passHolders(env);
  let mine = null;
  if (user) {
    const b = await env.DB.prepare('SELECT score, stars FROM best WHERE user_id = ? AND mission = ?').bind(user.id, mission.id).first();
    if (b) {
      const rank = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE mission = ? AND score > ?').bind(mission.id, b.score).first();
      mine = { rank: rank.n + 1, score: b.score, stars: b.stars };
    }
  }
  return json({
    mission: mission.id,
    top: rows.results.map((r, i) => ({ rank: i + 1, pseudo: r.pseudo, score: r.score, stars: r.stars, time: r.time, rame: r.rame, livree: r.livree, rameName: r.rame_name, pass: pass.has(r.id), grades: JSON.parse(r.grades) })),
    mine,
  });
}

async function ghost(env, missionId, pseudo) {
  const row = await env.DB.prepare(`SELECT b.frames, b.score, b.rame, b.livree, u.pseudo, w.fx, w.emote, w.rame_name FROM best b JOIN users u ON u.id = b.user_id
    LEFT JOIN wallet w ON w.user_id = u.id WHERE b.mission = ? AND u.pseudo = ?`)
    .bind(String(missionId || ''), String(pseudo || '')).first();
  if (!row) throw new HttpError(404, 'Pas de fantôme pour ce conducteur.');
  return json({ pseudo: row.pseudo, score: row.score, rame: row.rame, livree: row.livree, fx: row.fx, emote: row.emote, rameName: row.rame_name, frames: JSON.parse(row.frames) });
}

async function addEvent(env, kind, text) {
  await env.DB.prepare('INSERT INTO events (at, kind, text) VALUES (?, ?, ?)').bind(Date.now(), kind, text).run();
}

async function feed(env) {
  const rows = await env.DB.prepare('SELECT at, kind, text FROM events ORDER BY id DESC LIMIT 30').all();
  return json({ events: rows.results });
}

async function ranking(env) {
  const ids = MISSIONS.map((m) => m.id);
  const ph = ids.map(() => '?').join(',');
  const pass = await passHolders(env);
  const rows = await env.DB.prepare(`SELECT u.id, u.pseudo, SUM(b.stars) AS stars, SUM(b.score) AS score, COUNT(*) AS missions
    FROM best b JOIN users u ON u.id = b.user_id WHERE b.mission IN (${ph}) GROUP BY u.id ORDER BY stars DESC, score DESC LIMIT 50`).bind(...ids).all();
  const crowns = await env.DB.prepare(`SELECT u.pseudo, COUNT(*) AS n FROM best b JOIN users u ON u.id = b.user_id
    WHERE b.mission IN (${ph}) AND b.score = (SELECT MAX(score) FROM best b2 WHERE b2.mission = b.mission) GROUP BY u.id`).bind(...ids).all();
  const cmap = Object.fromEntries(crowns.results.map((c) => [c.pseudo, c.n]));
  return json({ players: rows.results.map((r, i) => ({ rank: i + 1, pseudo: r.pseudo, stars: r.stars, score: r.score, missions: r.missions, crowns: cmap[r.pseudo] || 0, pass: pass.has(r.id) })) });
}

const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);

// Couronne de ligne : le meilleur total de records sur les missions de la ligne
async function lineCrowns(env) {
  const out = {};
  for (const line of Object.values(LINES)) {
    const ids = MISSIONS.filter((m) => m.line === line.id).map((m) => m.id);
    const ph = ids.map(() => '?').join(',');
    const row = await env.DB.prepare(`SELECT u.pseudo, SUM(b.score) AS score, COUNT(*) AS n FROM best b JOIN users u ON u.id = b.user_id
      WHERE b.mission IN (${ph}) GROUP BY u.id ORDER BY score DESC LIMIT 1`).bind(...ids).first();
    const players = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM best WHERE mission IN (${ph})`).bind(...ids).first();
    out[line.id] = { crown: row ? { pseudo: row.pseudo, score: row.score, missions: row.n } : null, players: players.n };
  }
  return json({ lines: out });
}

async function boxEvent(env, user, items) {
  for (const it of items) {
    if (it.dup) continue;
    if (it.type === 'rame' && (it.rarity === 'legendaire' || it.rarity === 'mythique')) {
      await addEvent(env, 'loot', `✨ ${user.pseudo} a sorti la rame ${it.rarity === 'mythique' ? 'MYTHIQUE' : 'légendaire'} ${RAMES[it.id].name} !`);
    }
    if (it.type === 'staff' && it.pote) await addEvent(env, 'loot', `🃏 ${user.pseudo} a tiré la carte légendaire de ${it.name} (${ROLES[it.role].name.toLowerCase()}).`);
    if (it.type === 'livree' && it.rarity === 'mythique') await addEvent(env, 'loot', `✨ ${user.pseudo} a déniché la livrée ${LIVREES[it.id].name}.`);
  }
}

