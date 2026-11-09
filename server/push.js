// Notifications sur le téléphone (Web Push, RFC 8030 / 8291 / 8292), entièrement avec WebCrypto.
// Les clés VAPID sont créées au premier besoin et gardées dans la base : rien à configurer.

export const PUSH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS push_user ON push_subs (user_id)',
  `CREATE TABLE IF NOT EXISTS kv (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS push_log (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, ref)
  )`,
];

const err = (status, message) => Object.assign(new Error(message), { status });
const te = new TextEncoder();

const b64u = {
  enc(buf) {
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// Services de notification des navigateurs (Chrome/Android, Firefox, Safari/iPhone, Edge)
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
function allowedEndpoint(env, endpoint) {
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (env.PUSH_TEST_ALLOW === '1' && u.protocol === 'http:' && u.hostname === 'localhost') return true; // tests locaux
  return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

// ---------------------------------------------------------------------------
// Clés VAPID (identité du serveur auprès des services de notification)
// ---------------------------------------------------------------------------

let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  let row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicKey = b64u.enc(await crypto.subtle.exportKey('raw', kp.publicKey));
    const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    await env.DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ publicKey, privateJwk })).run();
    row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'vapid'").first();
  }
  const v = JSON.parse(row.v);
  vapidCache = { publicKey: v.publicKey, key: await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return vapidCache;
}

export async function publicKey(env) {
  return (await vapid(env)).publicKey;
}

async function vapidHeader(env, endpoint) {
  const v = await vapid(env);
  const contact = (await env.DB.prepare("SELECT v FROM kv WHERE k = 'origin'").first())?.v ?? 'https://ukipu.workers.dev';
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, te.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${v.publicKey}`;
}

// ---------------------------------------------------------------------------
// Chiffrement du message (aes128gcm) : seul le téléphone abonné peut le lire
// ---------------------------------------------------------------------------

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

export async function encrypt(sub, payload) {
  const uaPublic = b64u.dec(sub.p256dh);
  const authSecret = b64u.dec(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// ---------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------

export async function subscribe(env, user, b, origin) {
  const endpoint = String(b?.endpoint ?? '');
  const p256dh = String(b?.keys?.p256dh ?? '');
  const auth = String(b?.keys?.auth ?? '');
  if (!allowedEndpoint(env, endpoint) || endpoint.length > 1000) throw err(400, 'Service de notification inconnu.');
  if (b64u.dec(p256dh).length !== 65 || b64u.dec(auth).length !== 16) throw err(400, 'Abonnement invalide.');
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO push_subs (endpoint, user_id, p256dh, auth, at) VALUES (?, ?, ?, ?, ?)').bind(endpoint, user.id, p256dh, auth, Date.now()),
    env.DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('origin', ?)").bind(origin),
  ]);
}

export async function unsubscribe(env, user, endpoint) {
  await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(endpoint ?? ''), user.id).run();
}

// Heures calmes : pas de notification entre 23 h et 8 h (heure de Paris)
function quietHours(now = Date.now()) {
  const h = new Date(now + 3600000).getUTCHours();
  return h >= 23 || h < 8;
}

// Envoie une notification à tous les appareils d'un joueur. msg : { title, body, url, tag }
// opts.once : { kind, ref } pour ne jamais envoyer deux fois le même rappel.
export async function notify(env, userId, msg, opts = {}) {
  if (!userId || (!opts.force && env.PUSH_TEST_ALLOW !== '1' && quietHours())) return { sent: 0 };
  if (opts.once) {
    const r = await env.DB.prepare('INSERT OR IGNORE INTO push_log (user_id, kind, ref, at) VALUES (?, ?, ?, ?)').bind(userId, opts.once.kind, String(opts.once.ref), Date.now()).run();
    if (!r.meta.changes) return { sent: 0, already: true };
  }
  const subs = (await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').bind(userId).all()).results;
  let sent = 0;
  const errors = [];
  for (const s of subs) {
    try {
      const body = await encrypt(s, JSON.stringify(msg));
      const r = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          authorization: await vapidHeader(env, s.endpoint),
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream',
          ttl: '43200',
          urgency: 'normal',
        },
        body,
      });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (r.ok) sent++;
      else errors.push(`${r.status} ${(await r.text()).slice(0, 120)}`);
    } catch (e) {
      errors.push(String(e).slice(0, 120));
    }
  }
  if (errors.length) console.error('push', userId, errors);
  return { sent, errors, devices: subs.length };
}

export async function hasSubs(env, userIds) {
  if (!userIds.length) return new Set();
  const rows = await env.DB.prepare(`SELECT DISTINCT user_id FROM push_subs WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).all();
  return new Set(rows.results.map((r) => r.user_id));
}
