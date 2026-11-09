// Accès au serveur Ukipu (/api/*). Si le serveur est absent (page de démonstration, fichiers locaux),
// le jeu passe en mode hors ligne : tout reste jouable, sans classement.

const TOKEN_KEY = 'ukipu.token';
const USER_KEY = 'ukipu.user';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

export const api = {
  online: false,
  token: get(TOKEN_KEY),
  user: (() => { try { return JSON.parse(get(USER_KEY) || 'null'); } catch { return null; } })(),
  progress: null,

  async init() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(timer);
      const h = r.ok ? await r.json() : {};
      this.online = h.ok === true;
      this.serverVersion = h.version ?? null;
    } catch {
      this.online = false;
    }
    if (this.online && this.token) {
      try { await this.refresh(); } catch (e) { if (e.status === 401) this.forget(); }
    }
    return this.online;
  },

  async call(path, { method = 'GET', body, timeout = 0 } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    let r;
    const ctrl = timeout ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl?.signal });
    } catch {
      throw Object.assign(new Error(ctrl?.signal.aborted ? 'Le serveur ne répond pas (délai dépassé).' : 'Serveur injoignable. Vérifie ta connexion.'), { status: 0 });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data = {};
    try { data = await r.json(); } catch { /* réponse vide */ }
    if (!r.ok) throw Object.assign(new Error(data.error || `Erreur ${r.status}`), { status: r.status });
    return data;
  },

  remember(token, user) {
    this.token = token;
    this.user = user;
    set(TOKEN_KEY, token);
    set(USER_KEY, JSON.stringify(user));
  },

  forget() {
    this.token = null;
    this.user = null;
    this.progress = null;
    set(TOKEN_KEY, null);
    set(USER_KEY, null);
  },

  async login(pseudo, password) {
    const d = await this.call('/api/login', { method: 'POST', body: { pseudo, password } });
    this.remember(d.token, d.user);
    await this.refresh();
  },

  async register(pseudo, password) {
    const d = await this.call('/api/register', { method: 'POST', body: { pseudo, password } });
    this.remember(d.token, d.user);
    await this.refresh();
  },

  async logout() {
    try { await this.call('/api/logout', { method: 'POST' }); } catch { /* déjà déconnecté */ }
    this.forget();
  },

  async refresh() {
    const d = await this.call('/api/me');
    this.user = d.user;
    this.progress = d.progress;
    set(USER_KEY, JSON.stringify(d.user));
  },

  get loggedIn() { return this.online && !!this.user && !!this.token; },

  submitRun: (mission, log, gear) => api.call('/api/runs', { method: 'POST', body: { mission, log, rame: gear?.rame?.id, livree: gear?.livree } }),
  leaderboard: (mission) => api.call(`/api/leaderboard?mission=${encodeURIComponent(mission)}`),
  ghost: (mission, pseudo) => api.call(`/api/ghost?mission=${encodeURIComponent(mission)}&pseudo=${encodeURIComponent(pseudo)}`),
  feed: () => api.call('/api/feed'),
  ranking: () => api.call('/api/ranking'),
  lines: () => api.call('/api/lines'),
  profile: () => api.call('/api/profile'),
  equip: (what) => api.call('/api/equip', { method: 'POST', body: what }),
  openBox: (kind) => api.call('/api/box/open', { method: 'POST', body: { kind } }),
  buyBox: (kind) => api.call('/api/box/buy', { method: 'POST', body: { kind } }),
  upgrade: (rame) => api.call('/api/rame/upgrade', { method: 'POST', body: { rame } }),
  daily: () => api.call('/api/daily', { method: 'POST' }),
  network: () => api.call('/api/network'),
  collect: () => api.call('/api/collect', { method: 'POST' }),
  renovate: (station) => api.call('/api/renovate', { method: 'POST', body: { station } }),
  assignStaff: (card, line) => api.call('/api/staff/assign', { method: 'POST', body: { card, line } }),
  sabotage: (pseudo, line, kind) => api.call('/api/sabotage', { method: 'POST', body: { pseudo, line, kind } }),
  targets: () => api.call('/api/targets'),
  weekly: () => api.call('/api/weekly'),
  bulletin: (week = 'last') => api.call(`/api/bulletin?week=${week}`),
  season: () => api.call('/api/season'),
  claimSeason: () => api.call('/api/season/claim', { method: 'POST' }),
  cosmetics: (b) => api.call('/api/cosmetics', { method: 'POST', body: b }),
  passCheckout: (gift) => api.call('/api/pass/checkout', { method: 'POST', body: gift ? { gift } : {}, timeout: 20000 }),
  pushKey: () => api.call('/api/push/key'),
  pushSubscribe: (sub) => api.call('/api/push/subscribe', { method: 'POST', body: sub }),
  pushUnsubscribe: (endpoint) => api.call('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  pushTest: () => api.call('/api/push/test', { method: 'POST' }),
  passConfirm: (sessionId) => api.call('/api/pass/confirm', { method: 'POST', body: { session_id: sessionId } }),
};
