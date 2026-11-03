// Économie du jeu côté serveur : tickets, pièces, boîtes, collection de rames et livrées.
// Tous les tirages se font ici avec un générateur cryptographique : le client ne fait qu'afficher.

import { RAMES, LIVREES, RARITIES, MAX_LEVEL, levelCost, BOX_SHOP } from '../public/js/drive/route.js';

export const ECONOMY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wallet (
    user_id INTEGER PRIMARY KEY,
    tickets INTEGER NOT NULL DEFAULT 0,
    parts INTEGER NOT NULL DEFAULT 0,
    rame TEXT NOT NULL DEFAULT 'Z2N',
    livree TEXT NOT NULL DEFAULT 'origine',
    last_daily INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    runs INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS rames (
    user_id INTEGER NOT NULL,
    rame TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    copies INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, rame)
  )`,
  `CREATE TABLE IF NOT EXISTS livrees (
    user_id INTEGER NOT NULL,
    livree TEXT NOT NULL,
    PRIMARY KEY (user_id, livree)
  )`,
  `CREATE TABLE IF NOT EXISTS boxes (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind)
  )`,
];

// Colonnes ajoutées après coup (bases déjà créées) : on les ajoute si elles manquent
export const MIGRATIONS = [
  "ALTER TABLE best ADD COLUMN rame TEXT NOT NULL DEFAULT 'Z2N'",
  "ALTER TABLE best ADD COLUMN livree TEXT NOT NULL DEFAULT 'origine'",
];

export const BOXES = {
  standard: {
    ...BOX_SHOP.standard,
    tickets: [40, 120], parts: [3, 8], rameChance: 0.12, livreeChance: 0.1,
    weights: { commun: 60, rare: 28, epique: 9, legendaire: 2.6, mythique: 0.4 },
  },
  rare: {
    ...BOX_SHOP.rare,
    tickets: [100, 250], parts: [8, 18], rameChance: 0.4, livreeChance: 0.3,
    weights: { commun: 18, rare: 45, epique: 26, legendaire: 9.5, mythique: 1.5 },
  },
  legendaire: {
    ...BOX_SHOP.legendaire,
    tickets: [250, 500], parts: [20, 40], rameChance: 1, livreeChance: 0.6,
    weights: { commun: 0, rare: 0, epique: 70, legendaire: 25, mythique: 5 },
  },
};

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const between = ([a, b]) => a + Math.floor(rand() * (b - a + 1));

function pickRarity(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

function pickOf(table, rarity, exclude = []) {
  let pool = Object.keys(table).filter((id) => table[id].rarity === rarity && !exclude.includes(id));
  if (!pool.length) pool = Object.keys(table).filter((id) => !exclude.includes(id));
  return pool[Math.floor(rand() * pool.length)];
}

export async function ensureWallet(env, userId) {
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO wallet (user_id, tickets, parts) VALUES (?, 200, 0)').bind(userId),
    env.DB.prepare("INSERT OR IGNORE INTO rames (user_id, rame) VALUES (?, 'Z2N')").bind(userId),
    env.DB.prepare("INSERT OR IGNORE INTO livrees (user_id, livree) VALUES (?, 'origine')").bind(userId),
  ]);
}

export async function profile(env, userId) {
  await ensureWallet(env, userId);
  const [w, rames, livrees, boxes] = await env.DB.batch([
    env.DB.prepare('SELECT tickets, parts, rame, livree, last_daily, streak, runs FROM wallet WHERE user_id = ?').bind(userId),
    env.DB.prepare('SELECT rame, level, copies FROM rames WHERE user_id = ?').bind(userId),
    env.DB.prepare('SELECT livree FROM livrees WHERE user_id = ?').bind(userId),
    env.DB.prepare('SELECT kind, n FROM boxes WHERE user_id = ? AND n > 0').bind(userId),
  ]);
  const wallet = w.results[0];
  return {
    tickets: wallet.tickets,
    parts: wallet.parts,
    equip: { rame: wallet.rame, livree: wallet.livree },
    daily: { last: wallet.last_daily, streak: wallet.streak },
    runs: wallet.runs,
    rames: rames.results.map((r) => ({ id: r.rame, level: r.level, copies: r.copies })),
    livrees: livrees.results.map((l) => l.livree),
    boxes: Object.fromEntries(boxes.results.map((b) => [b.kind, b.n])),
  };
}

export async function ownedRame(env, userId, rameId) {
  return env.DB.prepare('SELECT level FROM rames WHERE user_id = ? AND rame = ?').bind(userId, rameId).first();
}

export async function ownsLivree(env, userId, livree) {
  return !!(await env.DB.prepare('SELECT 1 AS ok FROM livrees WHERE user_id = ? AND livree = ?').bind(userId, livree).first());
}

export async function addBox(env, userId, kind, n = 1) {
  await env.DB.prepare('INSERT INTO boxes (user_id, kind, n) VALUES (?, ?, ?) ON CONFLICT (user_id, kind) DO UPDATE SET n = n + excluded.n').bind(userId, kind, n).run();
}

export async function addTickets(env, userId, tickets, parts = 0) {
  await env.DB.prepare('UPDATE wallet SET tickets = tickets + ?, parts = parts + ? WHERE user_id = ?').bind(tickets, parts, userId).run();
}

// Ouvre une boîte : plusieurs objets, le plus rare en dernier (pour le suspense à l'écran)
export async function openBox(env, userId, kind) {
  const def = BOXES[kind];
  if (!def) throw Object.assign(new Error('Boîte inconnue.'), { status: 400 });
  const have = await env.DB.prepare('SELECT n FROM boxes WHERE user_id = ? AND kind = ?').bind(userId, kind).first();
  if (!have || have.n < 1) throw Object.assign(new Error('Tu n\'as pas cette boîte.'), { status: 400 });
  const items = [];
  const tickets = between(def.tickets);
  const parts = between(def.parts);
  items.push({ type: 'tickets', n: tickets });
  items.push({ type: 'parts', n: parts });
  let bonusTickets = 0;
  let bonusParts = 0;
  const stmts = [env.DB.prepare('UPDATE boxes SET n = n - 1 WHERE user_id = ? AND kind = ?').bind(userId, kind)];
  if (rand() < def.livreeChance) {
    const rarity = pickRarity(def.weights);
    const id = pickOf(LIVREES, rarity, ['origine']);
    const dup = await ownsLivree(env, userId, id);
    if (dup) bonusTickets += 60;
    else stmts.push(env.DB.prepare('INSERT OR IGNORE INTO livrees (user_id, livree) VALUES (?, ?)').bind(userId, id));
    items.push({ type: 'livree', id, rarity: LIVREES[id].rarity, dup });
  }
  if (rand() < def.rameChance) {
    const rarity = pickRarity(def.weights);
    const id = pickOf(RAMES, rarity);
    const dup = await ownedRame(env, userId, id);
    if (dup) {
      bonusParts += 12;
      stmts.push(env.DB.prepare('UPDATE rames SET copies = copies + 1 WHERE user_id = ? AND rame = ?').bind(userId, id));
    } else stmts.push(env.DB.prepare('INSERT INTO rames (user_id, rame) VALUES (?, ?)').bind(userId, id));
    items.push({ type: 'rame', id, rarity: RAMES[id].rarity, dup: !!dup });
  }
  if (bonusTickets) items.push({ type: 'tickets', n: bonusTickets, why: 'Livrée en double' });
  if (bonusParts) items.push({ type: 'parts', n: bonusParts, why: 'Rame en double' });
  stmts.push(env.DB.prepare('UPDATE wallet SET tickets = tickets + ?, parts = parts + ? WHERE user_id = ?').bind(tickets + bonusTickets, parts + bonusParts, userId));
  await env.DB.batch(stmts);
  const order = { tickets: 0, parts: 1, livree: 2, rame: 3 };
  items.sort((a, b) => order[a.type] - order[b.type] || (RARITIES_ORDER[a.rarity] ?? 0) - (RARITIES_ORDER[b.rarity] ?? 0));
  return items;
}

const RARITIES_ORDER = Object.fromEntries(Object.keys(RARITIES).map((k, i) => [k, i]));

export async function buyBox(env, userId, kind) {
  const def = BOXES[kind];
  if (!def) throw Object.assign(new Error('Boîte inconnue.'), { status: 400 });
  const res = await env.DB.prepare('UPDATE wallet SET tickets = tickets - ? WHERE user_id = ? AND tickets >= ?').bind(def.price, userId, def.price).run();
  if (!res.meta.changes) throw Object.assign(new Error('Pas assez de tickets.'), { status: 400 });
  await addBox(env, userId, kind);
}

export async function upgradeRame(env, userId, rameId) {
  const r = await ownedRame(env, userId, rameId);
  if (!r) throw Object.assign(new Error('Tu n\'as pas cette rame.'), { status: 400 });
  if (r.level >= MAX_LEVEL) throw Object.assign(new Error('Niveau maximum atteint.'), { status: 400 });
  const cost = levelCost(r.level);
  const res = await env.DB.prepare('UPDATE wallet SET tickets = tickets - ?, parts = parts - ? WHERE user_id = ? AND tickets >= ? AND parts >= ?')
    .bind(cost.tickets, cost.parts, userId, cost.tickets, cost.parts).run();
  if (!res.meta.changes) throw Object.assign(new Error('Pas assez de pièces ou de tickets.'), { status: 400 });
  await env.DB.prepare('UPDATE rames SET level = level + 1 WHERE user_id = ? AND rame = ?').bind(userId, rameId).run();
  return r.level + 1;
}

export async function equip(env, userId, rameId, livree) {
  if (rameId && !(await ownedRame(env, userId, rameId))) throw Object.assign(new Error('Tu n\'as pas cette rame.'), { status: 400 });
  if (livree && !(await ownsLivree(env, userId, livree))) throw Object.assign(new Error('Tu n\'as pas cette livrée.'), { status: 400 });
  if (rameId) await env.DB.prepare('UPDATE wallet SET rame = ? WHERE user_id = ?').bind(rameId, userId).run();
  if (livree) await env.DB.prepare('UPDATE wallet SET livree = ? WHERE user_id = ?').bind(livree, userId).run();
}

// Cadeau quotidien : une boîte par jour, la série de connexions fait grimper la récompense
export async function claimDaily(env, userId, today, yesterday) {
  await ensureWallet(env, userId);
  const w = await env.DB.prepare('SELECT last_daily, streak FROM wallet WHERE user_id = ?').bind(userId).first();
  if (w.last_daily === today) throw Object.assign(new Error('Cadeau déjà récupéré aujourd\'hui. Reviens demain !'), { status: 400 });
  const streak = w.last_daily === yesterday ? w.streak + 1 : 1;
  const day = ((streak - 1) % 7) + 1;
  const tickets = 40 * day;
  const kind = day === 7 ? 'rare' : 'standard';
  await env.DB.batch([
    env.DB.prepare('UPDATE wallet SET last_daily = ?, streak = ?, tickets = tickets + ? WHERE user_id = ?').bind(today, streak, tickets, userId),
    env.DB.prepare('INSERT INTO boxes (user_id, kind, n) VALUES (?, ?, 1) ON CONFLICT (user_id, kind) DO UPDATE SET n = n + 1').bind(userId, kind),
  ]);
  return { streak, day, tickets, box: kind };
}

// Récompense d'une partie
export function runReward(res) {
  return Math.floor(Math.max(0, res.score) / 60) + 15 * res.stars;
}
