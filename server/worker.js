// Serveur Ukipu (Cloudflare Worker + base D1).
// Sert le jeu (fichiers statiques) et l'API /api/* : comptes, parties vérifiées, classements, fantômes, fil d'actu.
// Le serveur fait foi : il rejoue chaque partie à partir du journal des commandes et recalcule le score.

import { missionById, dailyKey, MISSIONS } from '../public/js/drive/route.js';
import { computeSchedule, replay } from '../public/js/drive/sim.js';

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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!schemaReady) {
        await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
        schemaReady = true;
      }
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
  if (p === '/api/health') return json({ ok: true, today: dailyKey() });
  if (p === '/api/register' && m === 'POST') return register(env, await body(req));
  if (p === '/api/login' && m === 'POST') return login(env, await body(req));
  if (p === '/api/logout' && m === 'POST') return logout(req, env);
  if (p === '/api/me' && m === 'GET') return me(env, await auth(req, env));
  if (p === '/api/runs' && m === 'POST') return submitRun(env, await auth(req, env), await body(req));
  if (p === '/api/leaderboard' && m === 'GET') return leaderboard(env, url.searchParams.get('mission'), await auth(req, env, true));
  if (p === '/api/ghost' && m === 'GET') return ghost(env, url.searchParams.get('mission'), url.searchParams.get('pseudo'));
  if (p === '/api/feed' && m === 'GET') return feed(env);
  if (p === '/api/ranking' && m === 'GET') return ranking(env);
  throw new HttpError(404, 'Adresse inconnue.');
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
  const row = await env.DB.prepare('SELECT data FROM schedules WHERE mission = ?').bind(mission.id).first();
  if (row) return JSON.parse(row.data);
  const s = computeSchedule(mission);
  const sched = { arr: s.arr, dep: s.dep };
  await env.DB.prepare('INSERT OR REPLACE INTO schedules (mission, data) VALUES (?, ?)').bind(mission.id, JSON.stringify(sched)).run();
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
  return m;
}

function checkLog(log) {
  const ok = log && Number.isInteger(log.n) && log.n > 0 && log.n < 60 * 60 * 20
    && Array.isArray(log.l) && Array.isArray(log.h) && Array.isArray(log.c)
    && log.l.length < 20000 && log.h.length < 2000 && log.c.length < 200
    && log.l.every((e) => Array.isArray(e) && Number.isInteger(e[0]) && typeof e[1] === 'number' && e[1] >= -1 && e[1] <= 1)
    && log.h.every(Number.isInteger) && log.c.every(Number.isInteger);
  if (!ok) throw new HttpError(400, 'Journal de conduite invalide.');
}

async function submitRun(env, user, b) {
  const mission = checkMission(b.mission);
  checkLog(b.log);
  const sched = await scheduleFor(env, mission);
  const r = replay(mission, sched, b.log);
  if (!r.over) throw new HttpError(400, 'Partie incomplète : elle n\'a pas pu être vérifiée.');
  const res = r.result;
  const now = Date.now();
  await env.DB.prepare('INSERT INTO runs (user_id, mission, score, stars, at) VALUES (?, ?, ?, ?, ?)').bind(user.id, mission.id, res.score, res.stars, now).run();

  const prev = await env.DB.prepare('SELECT score, stars FROM best WHERE user_id = ? AND mission = ?').bind(user.id, mission.id).first();
  const leaderBefore = await env.DB.prepare('SELECT b.user_id, u.pseudo, b.score FROM best b JOIN users u ON u.id = b.user_id WHERE b.mission = ? ORDER BY b.score DESC, b.at ASC LIMIT 1').bind(mission.id).first();
  const isBest = !prev || res.score > prev.score;
  if (isBest) {
    const grades = JSON.stringify(res.grades.map((g) => ({ name: g.name, grade: g.grade, d: g.d == null ? null : Math.round(g.d * 100) / 100 })));
    await env.DB.prepare(`INSERT INTO best (user_id, mission, score, stars, time, frames, grades, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, mission) DO UPDATE SET score = excluded.score, stars = MAX(best.stars, excluded.stars), time = excluded.time, frames = excluded.frames, grades = excluded.grades, at = excluded.at`)
      .bind(user.id, mission.id, res.score, res.stars, res.time, JSON.stringify(r.frames), grades, now).run();
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
      await addEvent(env, 'crown', `👑 ${user.pseudo} prend la tête de « ${mission.title} » (${fmt(res.score)} pts) et détrône ${dethroned}.`);
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

  const rank = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE mission = ? AND score > ?').bind(mission.id, isBest ? res.score : prev.score).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM best WHERE mission = ?').bind(mission.id).first();
  return json({
    score: res.score, stars: res.stars, best: isBest, previous: prev?.score ?? null,
    rank: rank.n + 1, players: total.n, crown, dethroned,
  });
}

async function leaderboard(env, missionId, user) {
  const mission = missionById(String(missionId || ''));
  if (!mission) throw new HttpError(400, 'Mission inconnue.');
  const rows = await env.DB.prepare(`SELECT u.pseudo, b.score, b.stars, b.time, b.grades FROM best b JOIN users u ON u.id = b.user_id
    WHERE b.mission = ? ORDER BY b.score DESC, b.at ASC LIMIT 20`).bind(mission.id).all();
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
    top: rows.results.map((r, i) => ({ rank: i + 1, pseudo: r.pseudo, score: r.score, stars: r.stars, time: r.time, grades: JSON.parse(r.grades) })),
    mine,
  });
}

async function ghost(env, missionId, pseudo) {
  const row = await env.DB.prepare('SELECT b.frames, b.score, u.pseudo FROM best b JOIN users u ON u.id = b.user_id WHERE b.mission = ? AND u.pseudo = ?')
    .bind(String(missionId || ''), String(pseudo || '')).first();
  if (!row) throw new HttpError(404, 'Pas de fantôme pour ce conducteur.');
  return json({ pseudo: row.pseudo, score: row.score, frames: JSON.parse(row.frames) });
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
  const rows = await env.DB.prepare(`SELECT u.pseudo, SUM(b.stars) AS stars, SUM(b.score) AS score, COUNT(*) AS missions
    FROM best b JOIN users u ON u.id = b.user_id WHERE b.mission IN (${ph}) GROUP BY u.id ORDER BY stars DESC, score DESC LIMIT 50`).bind(...ids).all();
  const crowns = await env.DB.prepare(`SELECT u.pseudo, COUNT(*) AS n FROM best b JOIN users u ON u.id = b.user_id
    WHERE b.mission IN (${ph}) AND b.score = (SELECT MAX(score) FROM best b2 WHERE b2.mission = b.mission) GROUP BY u.id`).bind(...ids).all();
  const cmap = Object.fromEntries(crowns.results.map((c) => [c.pseudo, c.n]));
  return json({ players: rows.results.map((r, i) => ({ rank: i + 1, pseudo: r.pseudo, stars: r.stars, score: r.score, missions: r.missions, crowns: cmap[r.pseudo] || 0 })) });
}

const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
