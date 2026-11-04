// Saison mensuelle et Pass Navigo côté serveur : points de saison, paliers, cosmétiques, paiement Stripe.
// Le Pass s'achète mois par mois (paiement unique, pas d'abonnement) et peut être offert à un pote.

import {
  TIERS, XP_PER_TIER, PASS_PRICE_CENTS, seasonKey, seasonName, daysLeft, tierOf, track, cosmetic,
} from '../public/js/drive/saison.js';
import { LIVREES } from '../public/js/drive/route.js';
import { addTickets, addBox } from './economy.js';

export const SAISON_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS season_xp (
    user_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    claimed TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, season)
  )`,
  `CREATE TABLE IF NOT EXISTS passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    by_user INTEGER,
    stripe_session TEXT UNIQUE,
    amount INTEGER,
    at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cosmetics (
    user_id INTEGER NOT NULL,
    item TEXT NOT NULL,
    PRIMARY KEY (user_id, item)
  )`,
  'CREATE INDEX IF NOT EXISTS passes_user ON passes (user_id, season)',
];

export const SAISON_MIGRATIONS = [
  'ALTER TABLE wallet ADD COLUMN horn TEXT',
  'ALTER TABLE wallet ADD COLUMN fx TEXT',
  'ALTER TABLE wallet ADD COLUMN emote TEXT',
  'ALTER TABLE wallet ADD COLUMN rame_name TEXT',
];

const err = (status, message) => Object.assign(new Error(message), { status });

export async function hasPass(env, userId, key = seasonKey()) {
  return !!(await env.DB.prepare('SELECT 1 AS ok FROM passes WHERE user_id = ? AND season = ? LIMIT 1').bind(userId, key).first());
}

// Joueurs qui ont le Pass ce mois-ci (pour le badge 🎫 dans les classements)
export async function passHolders(env, key = seasonKey()) {
  const rows = await env.DB.prepare('SELECT DISTINCT user_id FROM passes WHERE season = ?').bind(key).all();
  return new Set(rows.results.map((r) => r.user_id));
}

async function row(env, userId, key) {
  await env.DB.prepare('INSERT OR IGNORE INTO season_xp (user_id, season) VALUES (?, ?)').bind(userId, key).run();
  return env.DB.prepare('SELECT xp, claimed FROM season_xp WHERE user_id = ? AND season = ?').bind(userId, key).first();
}

export async function addXp(env, userId, n, key = seasonKey()) {
  const before = await row(env, userId, key);
  await env.DB.prepare('UPDATE season_xp SET xp = xp + ? WHERE user_id = ? AND season = ?').bind(n, userId, key).run();
  const xp = before.xp + n;
  return { gained: n, xp, tier: tierOf(xp), tierUp: tierOf(xp) > tierOf(before.xp) };
}

export async function seasonState(env, user, key = seasonKey()) {
  const r = await row(env, user.id, key);
  const [cos, w, pass] = await env.DB.batch([
    env.DB.prepare('SELECT item FROM cosmetics WHERE user_id = ?').bind(user.id),
    env.DB.prepare('SELECT horn, fx, emote, rame_name FROM wallet WHERE user_id = ?').bind(user.id),
    env.DB.prepare(`SELECT p.by_user, u.pseudo FROM passes p LEFT JOIN users u ON u.id = p.by_user WHERE p.user_id = ? AND p.season = ? ORDER BY p.id LIMIT 1`).bind(user.id, key),
  ]);
  const eq = w.results[0] ?? {};
  const p = pass.results[0];
  return {
    key,
    name: seasonName(key),
    daysLeft: daysLeft(key),
    xp: r.xp,
    tier: tierOf(r.xp),
    perTier: XP_PER_TIER,
    claimed: JSON.parse(r.claimed),
    pass: !!p,
    giftedBy: p && p.by_user && p.by_user !== user.id ? p.pseudo : null,
    cosmetics: cos.results.map((c) => c.item),
    equip: { horn: eq.horn ?? null, fx: eq.fx ?? null, emote: eq.emote ?? null, rameName: eq.rame_name ?? null },
    price: PASS_PRICE_CENTS,
    payments: !!env.STRIPE_SECRET,
  };
}

async function grant(env, userId, r) {
  if (r.type === 'tickets') await addTickets(env, userId, r.n);
  else if (r.type === 'parts') await addTickets(env, userId, 0, r.n);
  else if (r.type === 'box') await addBox(env, userId, r.kind);
  else if (r.type === 'cosmetic') await env.DB.prepare('INSERT OR IGNORE INTO cosmetics (user_id, item) VALUES (?, ?)').bind(userId, r.item).run();
  else if (r.type === 'livree' && LIVREES[r.id]) await env.DB.prepare('INSERT OR IGNORE INTO livrees (user_id, livree) VALUES (?, ?)').bind(userId, r.id).run();
}

// Récupère toutes les récompenses atteintes et pas encore prises (piste gratuite, et piste Pass si on l'a)
export async function claimAll(env, user, key = seasonKey()) {
  const r = await row(env, user.id, key);
  const tier = tierOf(r.xp);
  const pass = await hasPass(env, user.id, key);
  const claimed = new Set(JSON.parse(r.claimed));
  const got = [];
  for (const t of track(key)) {
    if (t.tier > tier) break;
    for (const [lane, rewards] of [['f', t.free], ['p', t.pass]]) {
      const id = `${lane}${t.tier}`;
      if (claimed.has(id) || (lane === 'p' && !pass)) continue;
      claimed.add(id);
      for (const rw of rewards) { await grant(env, user.id, rw); got.push(rw); }
    }
  }
  if (!got.length) throw err(400, 'Rien à récupérer pour l\'instant : continue de rouler !');
  await env.DB.prepare('UPDATE season_xp SET claimed = ? WHERE user_id = ? AND season = ?').bind(JSON.stringify([...claimed]), user.id, key).run();
  return got;
}

// Cosmétiques portés : klaxon, traînée, emote, nom de la rame
export async function equipCosmetics(env, user, b) {
  const own = new Set((await env.DB.prepare('SELECT item FROM cosmetics WHERE user_id = ?').bind(user.id).all()).results.map((c) => c.item));
  const sets = [];
  for (const k of ['horn', 'fx', 'emote']) {
    if (!(k in b)) continue;
    const v = b[k] ? String(b[k]) : null;
    if (v && (!v.startsWith(`${k}:`) || !own.has(v))) throw err(400, 'Tu n\'as pas cet objet.');
    sets.push([k, v]);
  }
  if ('rameName' in b) {
    if (!own.has(cosmetic.rename)) throw err(400, 'Le nom de rame se débloque avec le Pass Navigo.');
    const name = String(b.rameName ?? '').replace(/[<>"]/g, '').trim().slice(0, 24) || null;
    sets.push(['rame_name', name]);
  }
  for (const [col, v] of sets) await env.DB.prepare(`UPDATE wallet SET ${col} = ? WHERE user_id = ?`).bind(v, user.id).run();
}

// ---------------------------------------------------------------------------
// Paiement Stripe : une page de paiement hébergée par Stripe, puis confirmation
// (au retour du joueur, et par le webhook si on l'a configuré)
// ---------------------------------------------------------------------------

async function stripe(env, path, form) {
  let r;
  try {
    r = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: form ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${env.STRIPE_SECRET}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
  } catch (e) {
    console.error('Stripe injoignable', path, String(e));
    throw err(502, 'Stripe injoignable pour l\'instant, réessaie dans un instant.');
  }
  let data = {};
  try { data = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) {
    // visible dans les journaux du Worker (Cloudflare → ukipu → Observabilité)
    console.error('Stripe', path, r.status, JSON.stringify(data.error ?? data));
    throw err(502, `Stripe a refusé (${r.status}) : ${data.error?.message ?? 'erreur inconnue'}`);
  }
  return data;
}

export async function checkout(env, user, b, origin) {
  if (!env.STRIPE_SECRET) throw err(503, 'Le paiement n\'est pas encore branché. Reviens bientôt !');
  const key = seasonKey();
  let target = { id: user.id, pseudo: user.pseudo };
  if (b.gift) {
    target = await env.DB.prepare('SELECT id, pseudo FROM users WHERE pseudo = ?').bind(String(b.gift)).first();
    if (!target) throw err(404, 'Joueur introuvable.');
  }
  if (await hasPass(env, target.id, key)) throw err(400, target.id === user.id ? 'Tu as déjà le Pass ce mois-ci.' : `${target.pseudo} a déjà le Pass ce mois-ci.`);
  const label = target.id === user.id ? `Pass Navigo Ukipu · ${seasonName(key)}` : `Pass Navigo Ukipu · ${seasonName(key)} (offert à ${target.pseudo})`;
  // Prix : soit un prix créé dans Stripe (STRIPE_PRICE = price_…, suffit d'une clé restreinte « Checkout Sessions »),
  // soit un prix décrit à la volée (demande aussi le droit d'écriture sur les produits et les prix)
  // Code fiscal du produit : exigé quand Stripe est le vendeur officiel (Managed Payments, il gère alors la TVA).
  // Par défaut « services fournis par voie électronique » ; modifiable avec la variable STRIPE_TAX_CODE.
  const item = env.STRIPE_PRICE
    ? { 'line_items[0][price]': env.STRIPE_PRICE }
    : {
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(PASS_PRICE_CENTS),
      'line_items[0][price_data][product_data][name]': label,
      'line_items[0][price_data][product_data][tax_code]': env.STRIPE_TAX_CODE || 'txcd_10000000',
    };
  // STRIPE_MANAGED_PAYMENTS=false : désactive Managed Payments pour ces paiements (tu restes le vendeur)
  const managed = String(env.STRIPE_MANAGED_PAYMENTS ?? '').toLowerCase() === 'false' ? { 'managed_payments[enabled]': 'false' } : {};
  const s = await stripe(env, 'checkout/sessions', {
    mode: 'payment',
    success_url: `${origin}/?pass=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?pass=annule`,
    'line_items[0][quantity]': '1',
    ...item,
    ...managed,
    client_reference_id: String(user.id),
    'metadata[buyer]': String(user.id),
    'metadata[target]': String(target.id),
    'metadata[season]': String(key),
  });
  return { url: s.url };
}

// Active le Pass d'une session payée. Idempotent : le retour du joueur et le webhook peuvent arriver tous les deux.
export async function grantFromSession(env, s, addEvent) {
  if (s.payment_status !== 'paid') return null;
  const buyer = Number(s.metadata?.buyer);
  const target = Number(s.metadata?.target);
  const season = Number(s.metadata?.season);
  if (!buyer || !target || !season) return null;
  const res = await env.DB.prepare('INSERT OR IGNORE INTO passes (user_id, season, by_user, stripe_session, amount, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(target, season, buyer, s.id, s.amount_total ?? PASS_PRICE_CENTS, Date.now()).run();
  if (!res.meta.changes) return { already: true, season, target };
  const names = await env.DB.prepare('SELECT id, pseudo FROM users WHERE id IN (?, ?)').bind(buyer, target).all();
  const name = (id) => names.results.find((u) => u.id === id)?.pseudo ?? '?';
  await addEvent(env, 'pass', buyer === target
    ? `🎫 ${name(target)} a pris son Pass Navigo de ${seasonName(season)}.`
    : `🎁 ${name(buyer)} a offert le Pass Navigo de ${seasonName(season)} à ${name(target)} !`);
  return { season, target, gift: buyer !== target };
}

export async function confirm(env, user, sessionId, addEvent) {
  if (!env.STRIPE_SECRET) throw err(503, 'Paiement non configuré.');
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId))) throw err(400, 'Session de paiement inconnue.');
  const s = await stripe(env, `checkout/sessions/${sessionId}`);
  if (Number(s.metadata?.buyer) !== user.id) throw err(403, 'Ce paiement ne vient pas de ton compte.');
  if (s.payment_status !== 'paid') return { paid: false };
  const g = await grantFromSession(env, s, addEvent);
  return { paid: true, gift: Number(s.metadata.target) !== user.id, ...g };
}

// Webhook Stripe (checkout.session.completed), signature vérifiée avec le secret du webhook
export async function webhook(env, req, addEvent) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw err(503, 'Webhook non configuré.');
  const body = await req.text();
  const sig = Object.fromEntries((req.headers.get('stripe-signature') || '').split(',').map((p) => p.split('=')));
  const t = Number(sig.t);
  if (!t || !sig.v1 || Math.abs(Date.now() / 1000 - t) > 600) throw err(400, 'Signature invalide.');
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(`${t}.${body}`)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (mac.length !== sig.v1.length || [...mac].reduce((d, c, i) => d | (c.charCodeAt(0) ^ sig.v1.charCodeAt(i)), 0)) throw err(400, 'Signature invalide.');
  const ev = JSON.parse(body);
  if (ev.type === 'checkout.session.completed') await grantFromSession(env, ev.data.object, addEvent);
  return { received: true };
}

export { TIERS };
