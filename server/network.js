// Le réseau de chaque joueur, côté serveur : caisses, chantiers de gares, personnel, sabotages,
// défi hebdo (couronne de régulateur), U d'Or et Bulletin trafic du lundi.

import { LINES, MISSIONS, RARITIES, weekKey, weeklyMission, dailyKey } from '../public/js/drive/route.js';
import { PASS_PERKS, seasonKey } from '../public/js/drive/saison.js';
import {
  openLinesFrom, STATIONS, RENOV, MAX_STATION, CHANTIER_SLOTS, caisseRate, caisseCap,
  STAFF, cardDef, staffPower, staffFx, STAFF_MAX_LEVEL, SABOTAGES,
} from '../public/js/drive/reseau.js';

export const NETWORK_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stations (
    user_id INTEGER NOT NULL,
    station TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, station)
  )`,
  `CREATE TABLE IF NOT EXISTS caisses (
    user_id INTEGER NOT NULL,
    line TEXT NOT NULL,
    since INTEGER NOT NULL,
    PRIMARY KEY (user_id, line)
  )`,
  `CREATE TABLE IF NOT EXISTS staff (
    user_id INTEGER NOT NULL,
    card TEXT NOT NULL,
    copies INTEGER NOT NULL DEFAULT 1,
    line TEXT,
    PRIMARY KEY (user_id, card)
  )`,
  `CREATE TABLE IF NOT EXISTS sabotages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user INTEGER NOT NULL,
    to_user INTEGER NOT NULL,
    line TEXT NOT NULL,
    kind TEXT NOT NULL,
    at INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    done_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS sabo_to ON sabotages (to_user, state)',
];

export const NETWORK_MIGRATIONS = [
  'ALTER TABLE wallet ADD COLUMN last_sabo INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE runs ADD COLUMN pct REAL',
  'ALTER TABLE runs ADD COLUMN line TEXT',
];

const err = (status, message) => Object.assign(new Error(message), { status });
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const HOUR = 3600000;

// ---------------------------------------------------------------------------
// Lignes exploitées par un joueur (d'après ses étoiles)
// ---------------------------------------------------------------------------

export async function openLines(env, userId) {
  const rows = await env.DB.prepare('SELECT mission, stars FROM best WHERE user_id = ?').bind(userId).all();
  const stars = {};
  for (const r of rows.results) {
    const m = MISSIONS.find((x) => x.id === r.mission);
    if (m) stars[m.line] = (stars[m.line] || 0) + r.stars;
  }
  return openLinesFrom((id) => stars[id] || 0);
}

// Termine les chantiers arrivés à échéance
async function settleStations(env, userId, now) {
  await env.DB.prepare('UPDATE stations SET level = level + 1, until = 0 WHERE user_id = ? AND until > 0 AND until <= ?').bind(userId, now).run();
}

async function staffRows(env, userId) {
  const rows = await env.DB.prepare('SELECT card, copies, line FROM staff WHERE user_id = ?').bind(userId).all();
  return rows.results;
}

async function pseudoMap(env, ids) {
  if (!ids.length) return {};
  const rows = await env.DB.prepare(`SELECT id, pseudo FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return Object.fromEntries(rows.results.map((r) => [r.id, r.pseudo]));
}

// Effet cumulé du personnel affecté à une ligne
function lineFx(staff, lineId, pseudoOf) {
  const fx = {};
  for (const s of staff) {
    if (s.line !== lineId) continue;
    const def = cardDef(s.card, pseudoOf);
    if (!def) continue;
    Object.assign(fx, staffFx(def.role, staffPower(def.rarity, Math.min(s.copies, STAFF_MAX_LEVEL))));
  }
  return fx;
}

async function context(env, userId, now = Date.now()) {
  await settleStations(env, userId, now);
  const [open, st, staff, pass] = await Promise.all([
    openLines(env, userId),
    env.DB.prepare('SELECT station, level, until FROM stations WHERE user_id = ?').bind(userId).all(),
    staffRows(env, userId),
    env.DB.prepare('SELECT 1 AS ok FROM passes WHERE user_id = ? AND season = ? LIMIT 1').bind(userId, seasonKey(new Date(now))).first(),
  ]);
  const ids = staff.map((s) => /^p(\d+)$/.exec(s.card)?.[1]).filter(Boolean).map(Number);
  const names = await pseudoMap(env, ids);
  const pseudoOf = (id) => names[id];
  const stations = Object.fromEntries(st.results.map((r) => [r.station, { level: r.level, until: r.until }]));
  return { open, stations, staff, pseudoOf, levelOf: (name) => stations[name]?.level || 0, pass: !!pass };
}

// ---------------------------------------------------------------------------
// État complet du réseau d'un joueur
// ---------------------------------------------------------------------------

export async function network(env, user, now = Date.now()) {
  const ctx = await context(env, user.id, now);
  // une caisse par ligne exploitée, ouverte le jour où la ligne l'est
  for (const id of ctx.open) await env.DB.prepare('INSERT OR IGNORE INTO caisses (user_id, line, since) VALUES (?, ?, ?)').bind(user.id, id, now).run();
  const cs = await env.DB.prepare('SELECT line, since FROM caisses WHERE user_id = ?').bind(user.id).all();
  const caisses = {};
  for (const c of cs.results) {
    if (!ctx.open.includes(c.line)) continue;
    const fx = lineFx(ctx.staff, c.line, ctx.pseudoOf);
    const rate = caisseRate(c.line, ctx.levelOf, fx);
    const cap = caisseCap(rate, { ...fx, capHours: (fx.capHours ?? 0) + (ctx.pass ? PASS_PERKS.capHours : 0) });
    caisses[c.line] = { rate: Math.round(rate), cap, amount: Math.min(cap, Math.floor(((now - c.since) / HOUR) * rate)), since: c.since };
  }
  const incoming = await env.DB.prepare(`SELECT s.id, s.line, s.kind, s.at, u.pseudo AS by FROM sabotages s JOIN users u ON u.id = s.from_user
    WHERE s.to_user = ? AND s.state = 'pending' ORDER BY s.id`).bind(user.id).all();
  const w = await env.DB.prepare('SELECT last_sabo FROM wallet WHERE user_id = ?').bind(user.id).first();
  return {
    now,
    open: ctx.open,
    stations: ctx.stations,
    caisses,
    staff: ctx.staff.map((s) => {
      const def = cardDef(s.card, ctx.pseudoOf);
      return { id: s.card, copies: s.copies, level: Math.min(s.copies, STAFF_MAX_LEVEL), line: s.line, ...def };
    }),
    incoming: incoming.results,
    sabotageToken: (w?.last_sabo ?? 0) !== dailyKey(new Date(now)),
    pass: ctx.pass,
    slots: CHANTIER_SLOTS + (ctx.pass ? PASS_PERKS.chantiers : 0),
  };
}

export async function collect(env, user, now = Date.now()) {
  const net = await network(env, user, now);
  let total = 0;
  const stmts = [];
  for (const [line, c] of Object.entries(net.caisses)) {
    if (c.amount < 1) continue;
    total += c.amount;
    stmts.push(env.DB.prepare('UPDATE caisses SET since = ? WHERE user_id = ? AND line = ?').bind(now, user.id, line));
  }
  if (!total) throw err(400, 'Les caisses sont vides, reviens un peu plus tard.');
  stmts.push(env.DB.prepare('UPDATE wallet SET tickets = tickets + ? WHERE user_id = ?').bind(total, user.id));
  await env.DB.batch(stmts);
  return total;
}

export async function renovate(env, user, station, now = Date.now()) {
  const st = STATIONS.get(String(station));
  if (!st) throw err(400, 'Gare inconnue.');
  const ctx = await context(env, user.id, now);
  if (!st.lines.some((id) => ctx.open.includes(id))) throw err(400, 'Cette gare n\'est sur aucune de tes lignes.');
  const cur = ctx.stations[st.name] ?? { level: 0, until: 0 };
  if (cur.until) throw err(400, 'Un chantier est déjà en cours dans cette gare.');
  if (cur.level >= MAX_STATION) throw err(400, 'Cette gare est déjà au niveau maximum.');
  const busy = Object.values(ctx.stations).filter((s) => s.until).length;
  const slots = CHANTIER_SLOTS + (ctx.pass ? PASS_PERKS.chantiers : 0);
  if (busy >= slots) throw err(400, `${slots} chantiers au maximum en même temps${ctx.pass ? '' : ' (3 avec le Pass Navigo)'}.`);
  const step = RENOV[cur.level + 1];
  // l'agent de maintenance le plus efficace parmi les lignes de la gare raccourcit le chantier
  const k = Math.min(1, ...st.lines.map((id) => lineFx(ctx.staff, id, ctx.pseudoOf).chantier ?? 1));
  const until = now + Math.round(step.minutes * 60000 * k);
  const pay = await env.DB.prepare('UPDATE wallet SET tickets = tickets - ?, parts = parts - ? WHERE user_id = ? AND tickets >= ? AND parts >= ?')
    .bind(step.tickets, step.parts, user.id, step.tickets, step.parts).run();
  if (!pay.meta.changes) throw err(400, 'Pas assez de tickets ou de pièces.');
  await env.DB.prepare('INSERT INTO stations (user_id, station, level, until) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, station) DO UPDATE SET until = excluded.until')
    .bind(user.id, st.name, cur.level, until).run();
  return { station: st.name, level: cur.level + 1, until };
}

export async function assignStaff(env, user, card, line) {
  const row = await env.DB.prepare('SELECT card FROM staff WHERE user_id = ? AND card = ?').bind(user.id, String(card)).first();
  if (!row) throw err(400, 'Tu n\'as pas cette carte.');
  if (line) {
    if (!LINES[line]) throw err(400, 'Ligne inconnue.');
    const open = await openLines(env, user.id);
    if (!open.includes(line)) throw err(400, 'Tu n\'exploites pas encore cette ligne.');
  }
  // une carte par ligne : celle qui occupait le poste retourne au vestiaire
  const stmts = [];
  if (line) stmts.push(env.DB.prepare('UPDATE staff SET line = NULL WHERE user_id = ? AND line = ?').bind(user.id, line));
  stmts.push(env.DB.prepare('UPDATE staff SET line = ? WHERE user_id = ? AND card = ?').bind(line || null, user.id, String(card)));
  await env.DB.batch(stmts);
}

// Tirage d'une carte personnel (dans une boîte). Légendaire : la carte d'un autre joueur.
export async function drawStaff(env, userId, rarity) {
  let card;
  if (rarity === 'legendaire' || rarity === 'mythique') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE id != ?').bind(userId).first();
    if (n.n > 0) {
      const u = await env.DB.prepare('SELECT id FROM users WHERE id != ? LIMIT 1 OFFSET ?').bind(userId, Math.floor(rand() * n.n)).first();
      card = `p${u.id}`;
    } else card = 'titulaire';
  } else {
    let pool = Object.keys(STAFF).filter((id) => STAFF[id].rarity === rarity);
    if (!pool.length) pool = Object.keys(STAFF).filter((id) => STAFF[id].rarity !== 'legendaire');
    card = pool[Math.floor(rand() * pool.length)];
  }
  const had = await env.DB.prepare('SELECT copies FROM staff WHERE user_id = ? AND card = ?').bind(userId, card).first();
  return { card, dup: !!had, levelUp: !!had && had.copies < STAFF_MAX_LEVEL };
}

export function staffStmt(env, userId, card) {
  return env.DB.prepare('INSERT INTO staff (user_id, card) VALUES (?, ?) ON CONFLICT (user_id, card) DO UPDATE SET copies = copies + 1').bind(userId, card);
}

export async function cardInfo(env, card) {
  const m = /^p(\d+)$/.exec(card);
  const names = m ? await pseudoMap(env, [Number(m[1])]) : {};
  return cardDef(card, (id) => names[id]);
}

// Bonus de tickets du régulateur affecté à la ligne
export async function runTicketsFx(env, userId, lineId) {
  const ctx = await context(env, userId);
  return lineFx(ctx.staff, lineId, ctx.pseudoOf);
}

// ---------------------------------------------------------------------------
// Sabotage amical
// ---------------------------------------------------------------------------

export async function sabotage(env, user, b, now = Date.now()) {
  const kind = String(b.kind || '');
  const line = String(b.line || '');
  if (!SABOTAGES[kind]) throw err(400, 'Sabotage inconnu.');
  const target = await env.DB.prepare('SELECT id, pseudo FROM users WHERE pseudo = ?').bind(String(b.pseudo || '')).first();
  if (!target) throw err(404, 'Joueur introuvable.');
  if (target.id === user.id) throw err(400, 'Se saboter soi-même, c\'est déjà ce que fait la U.');
  const today = dailyKey(new Date(now));
  const w = await env.DB.prepare('SELECT last_sabo FROM wallet WHERE user_id = ?').bind(user.id).first();
  if (w?.last_sabo === today) throw err(400, 'Un seul sabotage par jour. Reviens demain !');
  const open = await openLines(env, target.id);
  if (!open.includes(line)) throw err(400, `${target.pseudo} n'exploite pas cette ligne.`);
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(line = ?) AS same FROM sabotages WHERE to_user = ? AND state = 'pending'").bind(line, target.id).first();
  if (pend.same > 0) throw err(400, `Un sabotage attend déjà ${target.pseudo} sur cette ligne.`);
  if (pend.n >= 3) throw err(400, `${target.pseudo} a déjà trois sabotages sur le dos. Laisse-lui une chance !`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sabotages (from_user, to_user, line, kind, at) VALUES (?, ?, ?, ?, ?)').bind(user.id, target.id, line, kind, now),
    env.DB.prepare('UPDATE wallet SET last_sabo = ? WHERE user_id = ?').bind(today, user.id),
  ]);
  return { pseudo: target.pseudo, line, kind };
}

export async function pendingSabotage(env, userId, line) {
  return env.DB.prepare(`SELECT s.id, s.kind, s.from_user, u.pseudo AS by FROM sabotages s JOIN users u ON u.id = s.from_user
    WHERE s.to_user = ? AND s.line = ? AND s.state = 'pending' ORDER BY s.id LIMIT 1`).bind(userId, line).first();
}

// ---------------------------------------------------------------------------
// Semaine : couronne de régulateur, U d'Or, Bulletin trafic du lundi
// ---------------------------------------------------------------------------

function weekBounds(key) {
  const s = String(key);
  const start = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))) - HOUR; // lundi 0 h, heure de Paris (hiver)
  return [start, start + 7 * 24 * HOUR];
}

export async function weekly(env, key = weekKey()) {
  const m = weeklyMission(null, key);
  const [from, to] = weekBounds(key);
  const top = await env.DB.prepare(`SELECT u.pseudo, b.score, b.stars FROM best b JOIN users u ON u.id = b.user_id
    WHERE b.mission = ? ORDER BY b.score DESC, b.at ASC LIMIT 10`).bind(m.id).all();
  const udor = await env.DB.prepare(`SELECT u.pseudo, r.mission, r.score, r.stars, r.pct FROM runs r JOIN users u ON u.id = r.user_id
    WHERE r.at >= ? AND r.at < ? AND r.pct IS NOT NULL ORDER BY r.pct ASC, r.at DESC LIMIT 1`).bind(from, to).first();
  const title = (id) => MISSIONS.find((x) => x.id === id)?.title ?? (id.startsWith('daily') ? 'Défi du jour' : id.startsWith('weekly') ? 'Défi hebdo' : id);
  return {
    key,
    mission: m.id,
    line: m.line,
    regulateur: top.results[0] ?? null,
    top: top.results,
    udor: udor ? { pseudo: udor.pseudo, mission: title(udor.mission), score: udor.score, stars: udor.stars, pct: Math.round(udor.pct * 100) } : null,
  };
}

export async function bulletin(env, key) {
  const w = await weekly(env, key);
  const [from, to] = weekBounds(key);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const [runs, active, crowns, sabos, loot, perfect] = await env.DB.batch([
    q('SELECT COUNT(*) AS n, SUM(stars = 3) AS three FROM runs WHERE at >= ? AND at < ?', from, to),
    q(`SELECT u.pseudo, COUNT(*) AS n FROM runs r JOIN users u ON u.id = r.user_id WHERE r.at >= ? AND r.at < ? GROUP BY r.user_id ORDER BY n DESC LIMIT 1`, from, to),
    q("SELECT COUNT(*) AS n FROM events WHERE kind = 'crown' AND at >= ? AND at < ?", from, to),
    q("SELECT SUM(state = 'foiled') AS foiled, SUM(state = 'success') AS success FROM sabotages WHERE done_at >= ? AND done_at < ?", from, to),
    q("SELECT COUNT(*) AS n FROM events WHERE kind = 'loot' AND at >= ? AND at < ?", from, to),
    q("SELECT COUNT(*) AS n FROM events WHERE kind = 'shame' AND at >= ? AND at < ?", from, to),
  ]);
  return {
    ...w,
    runs: runs.results[0].n || 0,
    threeStars: runs.results[0].three || 0,
    mostActive: active.results[0] ?? null,
    crowns: crowns.results[0].n || 0,
    sabotages: { foiled: sabos.results[0].foiled || 0, success: sabos.results[0].success || 0 },
    loot: loot.results[0].n || 0,
    incidents: perfect.results[0].n || 0,
  };
}

export { RARITIES, MAX_STATION };
