// Accueil : carte du réseau, départs par ligne, dépôt (collection, colis), classement, fiche mission.
import {
  MISSIONS, LINES, LINE_UNLOCK, RAMES, LIVREES, RARITIES, BOX_SHOP, MAX_LEVEL, levelCost,
  dailyMission, weeklyMission, dailyKey, lineOf, buildRoute,
} from './route.js';
import {
  RENOV, MAX_STATION, STATIONS, ROLES, SABOTAGES, CHANTIER_SLOTS, staffPower, staffText, withSabotage, SABOTAGE_FOIL_STARS,
} from './reseau.js';
import { api } from './api.js';
import { mountNetMap } from './netmap.js';

let netmap = null;

const $ = (id) => document.getElementById(id);
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtHM = ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

let C; // contexte fourni par main.js : startMission, toast, progress, store, audio…
export const state = { tab: 'reseau', line: 'U', profile: null, crowns: null, ghostChoice: null, network: null, netAt: 0 };

// ---------------------------------------------------------------------------
// Progression : étoiles par ligne, déblocages
// ---------------------------------------------------------------------------

export const starsOn = (lineId) => MISSIONS.filter((m) => m.line === lineId).reduce((s, m) => s + (C.progress()[m.id]?.stars || 0), 0);
export const maxStarsOn = (lineId) => MISSIONS.filter((m) => m.line === lineId).length * 3;
export function lineOpen(id) {
  const u = LINE_UNLOCK[id];
  return !u || starsOn(u.line) >= u.stars || starsOn(id) > 0;
}
export const missionOpen = (m) => m.daily || m.weekly || (lineOpen(m.line) && starsOn(m.line) >= m.need);
const totalStars = () => Object.keys(LINES).reduce((s, id) => s + starsOn(id), 0);

// Rame et livrée utilisées pour une mission
export function gear(m) {
  const p = state.profile;
  const livree = p?.equip.livree ?? 'origine';
  if (m.fixedRame) return { rame: { id: m.fixedRame, level: 1 }, livree };
  if (!p) return { rame: { id: 'Z2N', level: 1 }, livree: 'origine' };
  const r = p.rames.find((x) => x.id === p.equip.rame) ?? { id: 'Z2N', level: 1 };
  return { rame: { id: r.id, level: r.level }, livree };
}

export async function refreshProfile() {
  if (!api.loggedIn) { state.profile = null; state.network = null; renderWallet(); return; }
  try {
    const [p, n] = await Promise.all([api.profile(), api.network()]);
    state.profile = p;
    setNetwork(n);
  } catch { /* garde le précédent */ }
  renderWallet();
}

function setNetwork(n) {
  state.network = n;
  state.netAt = Date.now();
}

// Montant actuel d'une caisse (extrapolé depuis la dernière lecture du serveur)
function caisseNow(lineId) {
  const c = state.network?.caisses?.[lineId];
  if (!c) return 0;
  return Math.min(c.cap, Math.floor(c.amount + ((Date.now() - state.netAt) / 3600000) * c.rate));
}
const caisseTotal = () => Object.keys(state.network?.caisses ?? {}).reduce((s, id) => s + caisseNow(id), 0);
const stationOf = (name) => state.network?.stations?.[name] ?? { level: 0, until: 0 };
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(s % 60).padStart(2, '0')}`;
};
const fmtDur = (min) => (min >= 60 ? `${min / 60} h` : `${min} min`);

// Sabotage en attente sur la ligne de cette mission (jamais sur les défis à armes égales)
export function pendingSabotage(m) {
  if (m.daily || m.weekly) return null;
  return state.network?.incoming?.find((x) => x.line === m.line) ?? null;
}
export function applySabotage(m) {
  const sab = pendingSabotage(m);
  return sab ? withSabotage(m, { kind: sab.kind, by: sab.by }) : m;
}

const pict = (lineId, size = '') => {
  const l = LINES[lineId];
  return `<span class="pict ${size}" style="background:${l.color};color:${l.ink}">${l.id}</span>`;
};

// ---------------------------------------------------------------------------
// Écran d'accueil à onglets
// ---------------------------------------------------------------------------

export function initHome(ctx) {
  C = ctx;
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showHome(b.dataset.tab);
  });
  $('home-body').addEventListener('click', onHomeClick);
  // minuteurs de chantier et caisses en direct
  setInterval(() => {
    if ($('screen-start').hidden) return;
    let done = false;
    document.querySelectorAll('[data-until]').forEach((el) => {
      const left = Number(el.dataset.until) - Date.now();
      if (left <= 0) done = true;
      el.textContent = fmtLeft(left);
    });
    const cc = $('mh-collect');
    if (cc) { const n = caisseTotal(); cc.querySelector('b').textContent = fr0.format(n); cc.classList.toggle('full', isFull()); }
    if (done && api.loggedIn) api.network().then((n) => { setNetwork(n); if (state.tab === 'reseau') { const sh = $('mh-sheet'); if (sh && !sh.hidden && sh.dataset.station) showStationSheet(sh.dataset.station); } }).catch(() => {});
  }, 1000);
  $('wallet').addEventListener('click', () => showHome('depot'));
}

export function showHome(tab = state.tab) {
  state.tab = tab;
  for (const id of ['screen-brief', 'screen-pause', 'screen-end', 'screen-box']) $(id).hidden = true;
  $('screen-start').hidden = false;
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  renderWallet();
  const body = $('home-body');
  body.scrollTop = 0;
  if (netmap) { netmap.destroy(); netmap = null; }
  body.classList.toggle('map-mode', tab === 'reseau');
  if (tab === 'reseau') renderReseau(body);
  else if (tab === 'departs') renderDeparts(body);
  else if (tab === 'depot') renderDepot(body);
  else renderClassement(body);
}

function renderWallet() {
  const el = $('wallet');
  const p = state.profile;
  if (!p) { el.hidden = true; return; }
  const boxes = Object.values(p.boxes).reduce((s, n) => s + n, 0);
  el.hidden = false;
  el.innerHTML = `<span title="Tickets">🎟 ${fr0.format(p.tickets)}</span><span title="Pièces détachées">⚙ ${fr0.format(p.parts)}</span>${boxes ? `<span class="wallet-box">🎁 ${boxes}</span>` : ''}`;
}

async function onHomeClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  if (a === 'line') { state.line = t.dataset.id; showHome('departs'); }
  else if (a === 'mission') {
    const m = [...MISSIONS, dailyMission(), weeklyMission()].find((x) => x.id === t.dataset.id);
    if (m && missionOpen(m)) showBrief(m);
    else C.toast(m && !lineOpen(m.line) ? 'Débloque d\'abord cette ligne' : 'Gagne plus d\'étoiles sur cette ligne pour débloquer la mission');
  } else if (a === 'locked') C.toast(t.dataset.why);
  else if (a === 'daily') claimDaily();
  else if (a === 'open') openBoxFlow(t.dataset.kind);
  else if (a === 'buy') {
    try { state.profile = await api.buyBox(t.dataset.kind); C.audio.good(); C.toast(`${BOX_SHOP[t.dataset.kind].name} acheté`); showHome('depot'); } catch (err) { C.toast(err.message); }
  } else if (a === 'equip-rame' || a === 'equip-livree') {
    try {
      state.profile = await api.equip(a === 'equip-rame' ? { rame: t.dataset.id } : { livree: t.dataset.id });
      C.audio.click();
      showHome('depot');
    } catch (err) { C.toast(err.message); }
  } else if (a === 'upgrade') {
    try {
      const r = await api.upgrade(t.dataset.id);
      state.profile = r.profile;
      C.audio.perfect();
      C.toast(`${RAMES[t.dataset.id].name} passe au niveau ${r.level}`);
      showHome('depot');
    } catch (err) { C.toast(err.message); }
  } else if (a === 'logout') { await api.logout(); state.profile = null; showHome('reseau'); }
  else if (a === 'tab') showHome(t.dataset.tab);
  else if (a === 'account') openAccountModal();
  else if (a === 'modal-close') $('mh-modal').hidden = true;
  else if (a === 'line-sheet') showLineSheet(t.dataset.id);
  else if (a === 'sheet-close') { $('mh-sheet').hidden = true; netmap?.select(null); }
  else if (a === 'collect') collectCaisses();
  else if (a === 'renovate') {
    try {
      const r = await api.renovate(t.dataset.station);
      state.profile = r.profile;
      setNetwork(r.network);
      renderWallet();
      C.audio.good();
      C.toast(`🚧 Chantier lancé à ${r.station}`);
      showStationSheet(r.station);
    } catch (err) { C.toast(err.message); }
  } else if (a === 'assign') {
    try {
      setNetwork(await api.assignStaff(t.dataset.card, t.dataset.line || null));
      C.audio.click();
      showHome('depot');
    } catch (err) { C.toast(err.message); }
  } else if (a === 'sabo') openSabotage(t.dataset.pseudo);
  else if (a === 'sabo-go') {
    try {
      const r = await api.sabotage(t.dataset.pseudo, t.dataset.line, t.dataset.kind);
      setNetwork(r.network);
      C.audio.alarm?.();
      C.toast(`😈 ${SABOTAGES[r.kind].icon} envoyé sur la ${LINES[r.line].name} de ${r.pseudo}`);
      showHome('classement');
    } catch (err) { C.toast(err.message); }
  } else if (a === 'bulletin') openBulletin();
  else if (a === 'zoom-in') netmap?.zoom(1.35);
  else if (a === 'zoom-out') netmap?.zoom(1 / 1.35);
  else if (a === 'zoom-fit') netmap?.fit();
}

// ---------------------------------------------------------------------------
// Onglet Réseau : compte, cadeau du jour, carte, lignes, fil d'actu
// ---------------------------------------------------------------------------

function renderReseau(body) {
  const p = state.profile;
  const today = dailyKey();
  const giftDay = p ? ((p.daily.last === dailyKey(new Date(Date.now() - 86400000)) ? p.daily.streak : 0) % 7) + 1 : 0;
  const hasGift = p && p.daily.last !== today;
  const agent = !api.online ? '<span class="mh-chip off">Hors ligne</span>'
    : api.loggedIn ? `<button class="mh-chip" type="button" data-act="account">👤 ${esc(api.user.pseudo)}</button>`
      : '<button class="mh-chip login" type="button" data-act="account">Se connecter</button>';
  body.innerHTML = `
    <div class="map-hero">
      <div class="map-host" id="map-host"></div>
      <div class="mh-top">
        ${agent}
        <span class="mh-right">
          ${state.network ? `<button class="mh-chip collect${isFull() ? ' full' : ''}" id="mh-collect" type="button" data-act="collect">💰 <b>${fr0.format(caisseTotal())}</b></button>` : ''}
          <span class="mh-chip">★ ${totalStars()}</span>
        </span>
      </div>
      <div class="mh-ticker"><span class="ticker-tag">Info</span><div class="ticker-win"><span id="mh-ticker-text">Touche une ligne pour voir ses départs · pince pour zoomer</span></div></div>
      <div class="mh-zoom">
        <button type="button" data-act="zoom-in" aria-label="Zoomer">+</button>
        <button type="button" data-act="zoom-out" aria-label="Dézoomer">−</button>
        <button type="button" data-act="zoom-fit" aria-label="Recentrer">⤢</button>
      </div>
      ${hasGift ? `<button class="mh-gift" type="button" data-act="daily"><span>🎁</span><small>Jour ${giftDay}/7</small></button>` : ''}
      <div class="mh-defis">${dailyCard('compact')}${weeklyCard('compact')}</div>
      <div class="mh-legend">${Object.values(LINES).map((l) => `<button type="button" data-act="${lineOpen(l.id) ? 'line-sheet' : 'locked'}" data-id="${l.id}" data-why="${esc(lineOpen(l.id) ? '' : `${LINE_UNLOCK[l.id].stars} ★ sur la ${LINES[LINE_UNLOCK[l.id].line].name} pour débloquer`)}" class="${lineOpen(l.id) ? '' : 'locked'}">${pict(l.id, 'pict-sm')}</button>`).join('')}</div>
      <div class="mh-sheet" id="mh-sheet" hidden></div>
      <div class="mh-tip" id="mh-tip" hidden></div>
      <div class="mh-modal" id="mh-modal" hidden><div class="mh-modal-card"><div id="account" class="account"></div><button class="ghost-btn" type="button" data-act="modal-close">${api.loggedIn ? 'Fermer' : 'Plus tard'}</button></div></div>
    </div>`;
  const mount = () => {
    if (netmap) netmap.destroy();
    netmap = mountNetMap($('map-host'), {
      lineOpen, crowns: state.crowns, focus: 'U',
      net: () => (state.network ? { stations: state.network.stations, caisse: caisseNow, cap: (id) => state.network.caisses[id]?.cap ?? 0, incoming: state.network.incoming } : null),
      onLine: (id) => showLineSheet(id),
      onStation: (name) => showStationSheet(name),
      onCaisse: () => collectCaisses(),
      onEmpty: () => { $('mh-sheet').hidden = true; $('mh-tip').hidden = true; },
    });
  };
  mount();
  if (api.online) {
    api.lines().then((d) => { state.crowns = d.lines; if (state.tab === 'reseau' && $('map-host')) mount(); }).catch(() => {});
    api.feed().then(({ events }) => {
      const el = $('mh-ticker-text');
      if (!events.length || !el) return;
      el.textContent = events.slice(0, 6).map((e) => e.text).join('   ·   ');
      el.classList.add('scroll');
      el.style.animationDuration = `${Math.max(14, el.textContent.length / 6)}s`;
    }).catch(() => {});
    if (!api.loggedIn && !state.askedLogin) { state.askedLogin = true; openAccountModal(); }
  }
}

function openAccountModal() {
  const m = $('mh-modal');
  if (!m) return;
  m.hidden = false;
  C.renderAccount();
}

function showLineSheet(id) {
  const l = LINES[id];
  const open = lineOpen(id);
  const u = LINE_UNLOCK[id];
  const crown = state.crowns?.[id]?.crown;
  const sh = $('mh-sheet');
  $('mh-tip').hidden = true;
  delete sh.dataset.station;
  const n = state.network;
  const staff = n?.staff.find((c) => c.line === id);
  const sab = n?.incoming.find((x) => x.line === id);
  const extra = open && n ? `
    <div class="sh-net">
      <span>💰 <b>${fr0.format(caisseNow(id))}</b> / ${fr0.format(n.caisses[id]?.cap ?? 0)} · ${n.caisses[id]?.rate ?? 0} 🎟/h</span>
      <span>${staff ? `${ROLES[staff.role].icon} <b>${esc(staff.name)}</b>` : '<button class="chip-btn" type="button" data-act="tab" data-tab="depot">Affecter du personnel</button>'}</span>
    </div>
    ${sab ? `<p class="sh-sabo">😈 <b>${esc(sab.by)}</b> t'a saboté : ${SABOTAGES[sab.kind].icon} ${SABOTAGES[sab.kind].text} sur ton prochain service. ${SABOTAGE_FOIL_STARS} ★ sans incident pour le déjouer.</p>` : ''}` : '';
  sh.innerHTML = `
    <div class="sh-head">${pict(id, 'pict-md')}<div><b>${l.name}</b><small>${l.kind} · ${l.stations[0].name} ↔ ${l.stations[l.stations.length - 1].name}</small></div><button type="button" class="sh-x" data-act="sheet-close" aria-label="Fermer">✕</button></div>
    <div class="sh-stats">
      <span><b>${starsOn(id)}/${maxStarsOn(id)}</b> ★</span>
      <span><b>${MISSIONS.filter((m) => m.line === id).length}</b> missions</span>
      <span><b>${l.stations.length}</b> gares</span>
      <span>${crown ? `👑 <b>${esc(crown.pseudo)}</b>` : 'Couronne libre'}</span>
    </div>
    ${extra}
    ${open ? `<button class="big-btn" type="button" data-act="line" data-id="${id}">Voir les départs ›</button>` : `<p class="sh-lock">🔒 ${u.stars} ★ sur la ${LINES[u.line].name} pour débloquer cette ligne</p>`}`;
  sh.hidden = false;
}

const isFull = () => Object.keys(state.network?.caisses ?? {}).some((id) => caisseNow(id) >= (state.network.caisses[id].cap || 1));

async function collectCaisses() {
  if (!api.loggedIn) { openAccountModal(); return; }
  try {
    const r = await api.collect();
    state.profile = r.profile;
    setNetwork(r.network);
    renderWallet();
    C.audio.perfect();
    C.toast(`💰 +${fr0.format(r.collected)} 🎟 récoltés dans les caisses`);
    const cc = $('mh-collect');
    if (cc) { cc.querySelector('b').textContent = '0'; cc.classList.remove('full'); }
  } catch (err) { C.toast(err.message); }
}

function showStationSheet(name) {
  const st = STATIONS.get(name);
  if (!st) return;
  const sh = $('mh-sheet');
  $('mh-tip').hidden = true;
  const cur = stationOf(name);
  const mine = st.lines.some((id) => lineOpen(id));
  const lvl = cur.level;
  const next = RENOV[lvl + 1];
  const busy = Object.values(state.network?.stations ?? {}).filter((x) => x.until).length;
  let act;
  if (!api.loggedIn) act = '<button class="big-btn" type="button" data-act="account">Se connecter pour rénover</button>';
  else if (!mine) act = '<p class="sh-lock">🔒 Exploite une ligne qui dessert cette gare pour la rénover.</p>';
  else if (cur.until) act = `<div class="sh-works">🚧 Travaux en cours · ${esc(RENOV[lvl + 1].name)} · <b data-until="${cur.until}">${fmtLeft(cur.until - Date.now())}</b></div>`;
  else if (!next) act = '<p class="sh-lock">⭐ Gare au niveau maximum. Elle rapporte à toutes les lignes qui la desservent.</p>';
  else {
    const p = state.profile;
    const can = p && p.tickets >= next.tickets && p.parts >= next.parts && busy < CHANTIER_SLOTS;
    act = `<div class="sh-next"><b>Niveau ${lvl + 1} · ${next.name}</b><small>${next.what} +${8 * st.lines.length} 🎟/h de recettes</small></div>
      <button class="big-btn${can ? '' : ' off'}" type="button" data-act="renovate" data-station="${esc(name)}">Lancer le chantier · 🎟 ${fr0.format(next.tickets)}${next.parts ? ` · ⚙ ${next.parts}` : ''} · ${fmtDur(next.minutes)}</button>
      ${busy >= CHANTIER_SLOTS ? `<p class="sh-lock">${CHANTIER_SLOTS} chantiers déjà en cours : attends qu'un se termine.</p>` : ''}`;
  }
  sh.dataset.station = name;
  sh.innerHTML = `
    <div class="sh-head"><span class="sh-gare">${'★'.repeat(lvl)}<span class="off">${'★'.repeat(MAX_STATION - lvl)}</span></span><div><b>${esc(name)}</b><small>${esc(RENOV[lvl].name)} · ${st.lines.map((id) => LINES[id].name).join(', ')}</small></div><button type="button" class="sh-x" data-act="sheet-close" aria-label="Fermer">✕</button></div>
    <div class="sh-lines">${st.lines.map((id) => pict(id, 'pict-sm')).join('')}</div>
    ${act}`;
  sh.hidden = false;
}

// Cartes des défis à armes égales : détachées des lignes, avec le pictogramme de LEUR ligne
function challengeCard(m, tag, cls, extra = '') {
  const l = lineOf(m);
  const p = C.progress()[m.id];
  const wx = { rain: 'Pluie', snow: 'Neige' }[m.weather] ?? (m.light < 0.2 ? 'Nuit' : 'Temps sec');
  const n = m.stops ? m.stops.length : Math.abs(m.to - m.from);
  const res = p ? `<span class="dc-stars">${'★'.repeat(p.stars)}<span class="off">${'★'.repeat(3 - p.stars)}</span></span><small>${fr0.format(p.score)} pts</small>` : '<span class="dc-go">Jouer ›</span>';
  return `
    <button class="daily-card ${m.weekly ? 'weekly ' : ''}${cls}" type="button" data-act="mission" data-id="${m.id}" style="--lc:${l.color}">
      <span class="dc-tag">${tag}</span>
      ${pict(l.id, 'pict-md')}
      <span class="dc-mid"><b>${cls === 'compact' ? '' : `${l.name} · `}${esc(l.stations[m.from].name)} › ${esc(l.stations[m.to].name)}</b><small>${n} arrêts · ${wx}${cls === 'compact' ? '' : ` · Z 2N imposée${extra}`}</small></span>
      <span class="dc-end">${res}</span>
    </button>`;
}
const dailyCard = (cls = '') => challengeCard(dailyMission(), 'Défi du jour', cls, ' · même parcours pour tous');
const weeklyCard = (cls = '') => {
  const end = new Date();
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const days = Math.round((end - new Date()) / 86400000);
  return challengeCard(weeklyMission(), cls === 'compact' ? '🎖️ Défi hebdo' : '🎖️ Défi hebdo · couronne de régulateur', cls, ` · ${days ? `encore ${days} j` : 'dernier jour'}`);
};

// ---------------------------------------------------------------------------
// Onglet Départs : missions de la ligne choisie
// ---------------------------------------------------------------------------

function renderDeparts(body) {
  const l = LINES[state.line] ?? LINES.U;
  const prog = C.progress();
  const row = (m) => {
    const p = prog[m.id];
    const open = missionOpen(m);
    const st = p ? p.stars : 0;
    const kind = m.daily ? 'Défi du jour' : m.stops ? 'Semi-direct' : 'Omnibus';
    const ml = lineOf(m);
    const n = m.stops ? m.stops.length : Math.abs(m.to - m.from);
    const right = !open
      ? `<span class="pill pill-off">${m.need} ★ requises</span>`
      : p ? `<span class="row-stars">${'★'.repeat(st)}<span class="off">${'★'.repeat(3 - st)}</span></span><span class="row-type">${fr0.format(p.score)} pts</span>`
        : `<span class="pill ${m.daily ? 'pill-led' : 'pill-ok'}">${m.daily ? 'Aujourd\'hui' : 'Nouveau'}</span>`;
    const wx = { rain: ' · pluie', snow: ' · neige' }[m.weather] ?? (m.light < 0.2 ? ' · nuit' : '');
    return `
      <button class="row${open ? '' : ' row-locked'}${m.daily ? ' row-daily' : ''}" type="button" data-act="mission" data-id="${m.id}">
        <span class="row-time">${fmtHM(m.clock)}</span>
        <span class="row-mid">
          <span class="row-type">${m.daily ? `${pict(ml.id, 'pict-xs')} ` : ''}${kind} · ${n} arrêts${wx}</span>
          <span class="row-dest">${m.title}</span>
          <span class="row-via">${ml.stations[m.from].name} › ${ml.stations[m.to].name}</span>
        </span>
        <span class="row-end">${right}</span>
      </button>`;
  };
  const crown = state.crowns?.[l.id]?.crown;
  body.innerHTML = `
    <div class="defis">${dailyCard()}${weeklyCard()}</div>
    <div class="line-tabs">${Object.values(LINES).map((x) => `<button type="button" class="lt${x.id === l.id ? ' on' : ''}${lineOpen(x.id) ? '' : ' locked'}" data-act="${lineOpen(x.id) ? 'line' : 'locked'}" data-id="${x.id}" data-why="${lineOpen(x.id) ? '' : esc(`${LINE_UNLOCK[x.id].stars} ★ sur la ${LINES[LINE_UNLOCK[x.id].line].name} pour débloquer`)}">${pict(x.id, 'pict-sm')}</button>`).join('')}</div>
    <section class="board">
      <div class="board-head">
        <div><h1 class="board-title">Départs</h1><p class="board-sub">${l.kind} · ${l.name}${crown ? ` · 👑 ${esc(crown.pseudo)}` : ''}</p></div>
        <div class="board-brand">${pict(l.id, 'pict-lg')}</div>
      </div>
      ${MISSIONS.filter((m) => m.line === l.id).map(row).join('')}
      <div class="board-foot"><span class="best">${starsOn(l.id)} / ${maxStarsOn(l.id)} ★ sur la ${l.name}</span><span class="howto">Touche une mission pour voir la fiche et choisir ton fantôme.</span></div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Onglet Dépôt : colis, rames, livrées
// ---------------------------------------------------------------------------

const RAR = (r) => RARITIES[r] ?? RARITIES.commun;
const RARITY_RANK = Object.fromEntries(Object.keys(RARITIES).map((k, i) => [k, i]));

function statBars(id) {
  const r = RAMES[id];
  const bar = (k, v, min, max) => `<div class="sb"><span>${k}</span><i><b style="width:${Math.round(((v - min) / (max - min)) * 100)}%"></b></i></div>`;
  return `<div class="stats">${bar('Accélération', r.accel, 1.3, 2.1)}${bar('Freinage', r.brake, 1.3, 1.75)}${bar('Portes', r.board, 14, 26)}${bar('Adhérence', r.grip, 0.95, 1.4)}</div>`;
}

function renderDepot(body) {
  if (!api.online || !api.loggedIn) {
    body.innerHTML = `<section class="panel"><div class="panel-head"><h2>Le dépôt</h2></div>
      <p class="muted pad">${api.online ? 'Connecte-toi (onglet Réseau) pour collectionner des rames et des livrées, ouvrir des colis et améliorer ton matériel.' : 'Hors ligne : la collection n\'est disponible que sur le jeu en ligne.'}</p>
      <button class="big-btn" type="button" data-act="tab" data-tab="reseau">Aller au réseau</button></section>`;
    return;
  }
  const p = state.profile;
  if (!p) { body.innerHTML = '<p class="muted pad">Chargement…</p>'; refreshProfile().then(() => showHome('depot')); return; }
  const own = Object.fromEntries(p.rames.map((r) => [r.id, r]));
  const boxes = Object.entries(BOX_SHOP).map(([k, b]) => {
    const n = p.boxes[k] || 0;
    return `<div class="box-card ${k}">
      <div class="box-ico">${boxIcon(k)}</div>
      <div class="box-mid"><b>${b.name}</b><small>${b.hint}</small></div>
      <div class="box-act">
        ${n ? `<button class="pill pill-good" type="button" data-act="open" data-kind="${k}">Ouvrir (${n})</button>` : ''}
        <button class="pill ${p.tickets >= b.price ? 'pill-ok' : 'pill-off'}" type="button" data-act="buy" data-kind="${k}">🎟 ${fr0.format(b.price)}</button>
      </div>
    </div>`;
  }).join('');
  const rames = Object.entries(RAMES).map(([id, r]) => {
    const o = own[id];
    const rar = RAR(r.rarity);
    if (!o) return `<div class="rame-card unknown" style="--rar:${rar.color}"><div class="rc-top"><span class="rar">${rar.label}</span></div><div class="rc-sil">${trainSvg(id, null, true)}</div><b>???</b><small>À trouver dans les colis</small></div>`;
    const eq = p.equip.rame === id;
    const cost = levelCost(o.level);
    const canUp = o.level < MAX_LEVEL;
    return `<div class="rame-card${eq ? ' eq' : ''}" style="--rar:${rar.color}">
      <div class="rc-top"><span class="rar">${rar.label}</span><span class="lvl">Niv. ${o.level}</span></div>
      <div class="rc-sil">${trainSvg(id, eq ? p.equip.livree : null)}</div>
      <b>${r.name}</b><small>${r.perk}</small>
      ${statBars(id)}
      <div class="rc-act">
        ${eq ? '<span class="pill pill-good">Équipée</span>' : `<button class="pill pill-ok" type="button" data-act="equip-rame" data-id="${id}">Équiper</button>`}
        ${canUp ? `<button class="pill ${p.parts >= cost.parts && p.tickets >= cost.tickets ? 'pill-led' : 'pill-off'}" type="button" data-act="upgrade" data-id="${id}">Niv. ${o.level + 1} · ⚙ ${cost.parts} · 🎟 ${cost.tickets}</button>` : '<span class="pill pill-off">Niveau max</span>'}
      </div>
    </div>`;
  }).join('');
  const livrees = Object.entries(LIVREES).map(([id, l]) => {
    const has = p.livrees.includes(id);
    const eq = p.equip.livree === id;
    const rar = RAR(l.rarity);
    return `<button class="liv${has ? '' : ' locked'}${eq ? ' eq' : ''}" type="button" style="--rar:${rar.color}" ${has && !eq ? `data-act="equip-livree" data-id="${id}"` : ''}>
      <span class="sw" style="background:linear-gradient(180deg, ${l.body ?? '#eef1f5'} 0 55%, ${l.band ?? '#c4245f'} 55% 70%, ${l.body ?? '#eef1f5'} 70%)"></span>
      <b>${has ? l.name : '???'}</b><small>${eq ? 'Portée' : has ? rar.label : `${rar.label} · à trouver`}</small>
    </button>`;
  }).join('');
  const net = state.network;
  const openIds = Object.keys(LINES).filter(lineOpen);
  const staff = (net?.staff ?? []).slice().sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0));
  const staffHtml = staff.length ? staff.map((c) => {
    const rar = RAR(c.rarity);
    const pw = staffPower(c.rarity, c.level);
    return `<div class="staff-card${c.pote ? ' pote' : ''}${c.line ? ' on' : ''}" style="--rar:${rar.color}">
      <div class="sc-top"><span class="rar">${c.pote ? 'Légendaire · pote' : rar.label}</span><span class="lvl">Niv. ${c.level}</span></div>
      <div class="sc-face">${c.pote ? `<span class="sc-ini">${esc(c.name.slice(0, 2).toUpperCase())}</span>` : `<span class="sc-ico">${ROLES[c.role].icon}</span>`}</div>
      <b>${esc(c.name)}</b><small class="sc-role">${ROLES[c.role].icon} ${ROLES[c.role].name}</small>
      <p class="sc-trait">« ${esc(c.trait)} »</p>
      <p class="sc-fx">${staffText(c.role, pw)}</p>
      <div class="sc-lines">${openIds.map((id) => `<button type="button" class="sc-line${c.line === id ? ' on' : ''}" data-act="assign" data-card="${esc(c.id)}" data-line="${c.line === id ? '' : id}" title="${c.line === id ? 'Retirer' : `Affecter à la ${LINES[id].name}`}">${pict(id, 'pict-xs')}</button>`).join('')}</div>
    </div>`;
  }).join('') : '<p class="muted pad">Pas encore de personnel. Les cartes sortent des colis… et les légendaires, ce sont les autres joueurs.</p>';
  body.innerHTML = `
    <section class="panel"><div class="panel-head"><h2>Colis</h2><span class="muted">🎟 ${fr0.format(p.tickets)} · ⚙ ${fr0.format(p.parts)}</span></div><div class="boxes">${boxes}</div></section>
    <section class="panel"><div class="panel-head"><h2>Personnel</h2><span class="muted">Une carte par ligne · touche une ligne pour affecter</span></div><div class="staffs">${staffHtml}</div></section>
    <section class="panel"><div class="panel-head"><h2>Rames</h2><span class="muted">${p.rames.length} / ${Object.keys(RAMES).length}</span></div><div class="rames">${rames}</div></section>
    <section class="panel"><div class="panel-head"><h2>Livrées</h2><span class="muted">${p.livrees.length} / ${Object.keys(LIVREES).length}</span></div><div class="livs">${livrees}</div></section>`;
}

const boxIcon = (k) => `<svg viewBox="0 0 64 64" width="56" height="56"><rect x="8" y="22" width="48" height="34" rx="4" fill="${{ standard: '#c98a4b', rare: '#3b6fd8', legendaire: '#e2a400' }[k]}"/><rect x="5" y="14" width="54" height="12" rx="3" fill="${{ standard: '#a86e36', rare: '#2a55b0', legendaire: '#c48600' }[k]}"/><rect x="28" y="14" width="8" height="42" fill="#ffd200"/><path d="M32 14c-6-10-16-8-14-2 1 3 8 3 14 2zm0 0c6-10 16-8 14-2-1 3-8 3-14 2z" fill="#ffd200"/></svg>`;

// Petite silhouette de rame (vignettes du dépôt et des colis)
export function trainSvg(id, livreeId, unknown = false) {
  const r = RAMES[id] ?? RAMES.Z2N;
  const l = LIVREES[livreeId] ?? {};
  const body = unknown ? '#2a3170' : l.body ?? r.body;
  const band = unknown ? '#2a3170' : l.band ?? r.band ?? '#c4245f';
  const doors = unknown ? '#2a3170' : l.doors ?? r.doors;
  const nose = r.nose === 'sharp' ? 'M112 8 Q126 10 130 34 L130 44 L112 44 Z' : r.nose === 'flat' ? 'M112 8 Q124 8 126 18 L126 44 L112 44 Z' : 'M112 8 Q126 10 128 26 L128 44 L112 44 Z';
  const win = r.deck === 2
    ? [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${14 + i * 15}" y="13" width="10" height="8" rx="2"/><rect x="${14 + i * 15}" y="26" width="10" height="8" rx="2"/>`).join('')
    : [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${14 + i * 15}" y="15" width="10" height="13" rx="2"/>`).join('');
  return `<svg viewBox="0 0 136 54" class="tsvg"><rect x="4" y="8" width="112" height="36" rx="4" fill="${body}"/><path d="${nose}" fill="${body}"/>
    <g fill="${unknown ? '#1a1f55' : '#26324a'}">${win}</g><rect x="4" y="${r.deck === 2 ? 23 : 32}" width="124" height="3" fill="${band}"/>
    <rect x="40" y="12" width="9" height="32" fill="${doors}"/><rect x="88" y="12" width="9" height="32" fill="${doors}"/>
    <path d="${r.nose === 'sharp' ? 'M114 12 Q124 14 127 30 L114 30 Z' : 'M114 12 Q123 13 125 26 L114 26 Z'}" fill="#1d2533"/>
    <circle cx="22" cy="47" r="4" fill="#16181c"/><circle cx="34" cy="47" r="4" fill="#16181c"/><circle cx="96" cy="47" r="4" fill="#16181c"/><circle cx="108" cy="47" r="4" fill="#16181c"/></svg>`;
}

// ---------------------------------------------------------------------------
// Ouverture d'un colis : les objets sortent un par un, le plus rare en dernier
// ---------------------------------------------------------------------------

export async function openBoxFlow(kind) {
  let res;
  try { res = await api.openBox(kind); } catch (err) { C.toast(err.message); return; }
  state.profile = res.profile;
  api.network().then(setNetwork).catch(() => {});
  renderWallet();
  const scr = $('screen-box');
  const items = res.items;
  let i = -1;
  scr.hidden = false;
  scr.innerHTML = `<div class="box-stage"><p class="box-title">${BOX_SHOP[kind].name}</p><div class="box-big shake">${boxIcon(kind).replace('width="56" height="56"', 'width="170" height="170"')}</div><p class="box-tap">Touche pour ouvrir</p></div>`;
  C.audio.click();
  const next = () => {
    i++;
    if (i >= items.length) {
      scr.innerHTML = `<div class="box-stage"><p class="box-title">Contenu</p><div class="box-sum">${items.map(itemCard).join('')}</div>
        <div class="box-btns"><button class="big-btn" type="button" id="box-done">Continuer</button></div></div>`;
      $('box-done').onclick = () => { scr.hidden = true; if (state.tab === 'depot' && !$('screen-start').hidden) showHome('depot'); };
      return;
    }
    const it = items[i];
    const big = it.type === 'rame' || it.type === 'livree' || it.type === 'staff';
    scr.innerHTML = `<div class="box-stage reveal ${big ? `rar-${it.rarity}` : ''}"><p class="box-count">${i + 1} / ${items.length}</p>${itemCard(it, true)}<p class="box-tap">Touche pour continuer</p></div>`;
    if (big && (it.rarity === 'legendaire' || it.rarity === 'mythique')) C.audio.perfect();
    else if (big) C.audio.good();
    else C.audio.click();
  };
  scr.onclick = (e) => { if (e.target.closest('#box-done')) return; next(); };
}

function itemCard(it, big = false) {
  const cls = big ? 'item big' : 'item';
  if (it.type === 'tickets') return `<div class="${cls}"><span class="item-ico">🎟</span><b>+${fr0.format(it.n)}</b><small>${it.why ?? 'Tickets'}</small></div>`;
  if (it.type === 'parts') return `<div class="${cls}"><span class="item-ico">⚙</span><b>+${it.n}</b><small>${it.why ?? 'Pièces détachées'}</small></div>`;
  const rar = RAR(it.rarity);
  if (it.type === 'livree') {
    const l = LIVREES[it.id];
    return `<div class="${cls} rare-item" style="--rar:${rar.color}"><span class="sw big" style="background:linear-gradient(180deg, ${l.body} 0 55%, ${l.band} 55% 70%, ${l.body} 70%)"></span><b>${l.name}</b><small>Livrée ${rar.label.toLowerCase()}${it.dup ? ' · doublon' : ' · nouvelle !'}</small></div>`;
  }
  if (it.type === 'staff') {
    return `<div class="${cls} rare-item staff-item${it.pote ? ' pote' : ''}" style="--rar:${rar.color}"><span class="sc-face">${it.pote ? `<span class="sc-ini">${esc(it.name.slice(0, 2).toUpperCase())}</span>` : `<span class="sc-ico">${ROLES[it.role].icon}</span>`}</span><b>${esc(it.name)}</b><small>${it.pote ? 'Carte légendaire d\'un pote' : `Personnel ${rar.label.toLowerCase()}`} · ${ROLES[it.role].name}${it.dup ? (it.levelUp ? ' · niveau +1' : ' · doublon') : ' · nouveau !'}</small>${big ? `<p class="sc-trait">« ${esc(it.trait)} »</p>` : ''}</div>`;
  }
  const r = RAMES[it.id];
  return `<div class="${cls} rare-item" style="--rar:${rar.color}">${trainSvg(it.id)}<b>${r.name}</b><small>Rame ${rar.label.toLowerCase()}${it.dup ? ' · doublon' : ' · nouvelle !'}</small></div>`;
}

async function claimDaily() {
  try {
    const r = await api.daily();
    state.profile = r.profile;
    C.audio.good();
    C.toast(`Jour ${r.gift.day} : +${r.gift.tickets} 🎟 et un ${BOX_SHOP[r.gift.box].name.toLowerCase()}`);
    openBoxFlow(r.gift.box);
    showHome('reseau');
  } catch (err) { C.toast(err.message); }
}

// ---------------------------------------------------------------------------
// Onglet Classement
// ---------------------------------------------------------------------------

async function renderClassement(body) {
  body.innerHTML = '<section class="panel"><div class="panel-head"><h2>Classement</h2></div><p class="muted pad">Chargement…</p></section>';
  if (!api.online) { body.innerHTML = '<section class="panel"><div class="panel-head"><h2>Classement</h2></div><p class="muted pad">Hors ligne : classement indisponible.</p></section>'; return; }
  try {
    const [{ players }, { lines }, wk, tg] = await Promise.all([
      api.ranking(), api.lines(), api.weekly().catch(() => null),
      api.loggedIn ? api.targets().catch(() => null) : null,
    ]);
    state.crowns = lines;
    state.targets = tg?.players ?? [];
    const token = api.loggedIn && state.network?.sabotageToken;
    const crowns = Object.values(LINES).map((l) => {
      const c = lines[l.id]?.crown;
      return `<div class="row rk-row">${pict(l.id, 'pict-md')}<span class="row-mid"><span class="row-dest">${c ? `👑 ${esc(c.pseudo)}` : '<span class="muted">Couronne libre</span>'}</span><span class="row-type">${l.name}${c ? ` · ${fr0.format(c.score)} pts cumulés` : ''}</span></span><span class="row-type">${lines[l.id]?.players ?? 0} conducteurs</span></div>`;
    }).join('');
    const list = players.length ? players.map((p) => `
      <div class="row rk-row${api.user && p.pseudo === api.user.pseudo ? ' me' : ''}">
        <span class="row-time">${p.rank}</span>
        <span class="row-mid"><span class="row-dest">${esc(p.pseudo)}${p.crowns ? ` <span class="crowns">👑×${p.crowns}</span>` : ''}</span><span class="row-type">${p.missions} mission${p.missions > 1 ? 's' : ''} · ${fr0.format(p.score)} pts</span></span>
        <span class="row-stars">${p.stars} ★</span>
        ${api.loggedIn && api.user.pseudo !== p.pseudo ? `<button class="sabo-btn${token ? '' : ' off'}" type="button" data-act="sabo" data-pseudo="${esc(p.pseudo)}" aria-label="Saboter ${esc(p.pseudo)}">😈</button>` : ''}
      </div>`).join('') : '<p class="muted pad">Personne n\'a encore roulé. À toi l\'honneur.</p>';
    const cur = wk?.current;
    const prev = wk?.previous;
    const week = cur ? `
      <section class="board week">
        <div class="board-head"><div><h1 class="board-title">Cette semaine</h1><p class="board-sub">Remis en jeu chaque lundi · ${pict(cur.line, 'pict-xs')} défi hebdo</p></div>
          <button class="pill pill-led" type="button" data-act="bulletin">📰 Bulletin du lundi</button></div>
        <div class="row rk-row week-row"><span class="wk-ico">🎖️</span><span class="row-mid"><span class="row-type">Couronne de régulateur · défi hebdo à armes égales</span><span class="row-dest">${cur.regulateur ? `${esc(cur.regulateur.pseudo)} · ${fr0.format(cur.regulateur.score)} pts` : '<span class="muted">Personne encore : fonce !</span>'}</span>${prev?.regulateur ? `<span class="row-via">La semaine dernière : ${esc(prev.regulateur.pseudo)}</span>` : ''}</span><button class="pill pill-ok" type="button" data-act="mission" data-id="${cur.mission}">Jouer</button></div>
        <div class="row rk-row week-row udor"><span class="wk-ico">🏆</span><span class="row-mid"><span class="row-type">U d'Or · pire service de la semaine</span><span class="row-dest">${cur.udor ? `${esc(cur.udor.pseudo)} · ${cur.udor.pct} % sur « ${esc(cur.udor.mission)} »` : '<span class="muted">Pas encore de candidat…</span>'}</span>${prev?.udor ? `<span class="row-via">Tenant du titre : ${esc(prev.udor.pseudo)}</span>` : ''}</span></div>
        ${api.loggedIn ? `<p class="wk-sabo">${token ? '😈 Ton jeton de sabotage du jour est prêt : touche 😈 à côté d\'un pote.' : '😈 Jeton de sabotage utilisé. Nouveau jeton demain.'}</p>` : ''}
      </section>` : '';
    body.innerHTML = `
      ${week}
      <section class="panel" id="feed" hidden></section>
      <section class="board"><div class="board-head"><div><h1 class="board-title">Couronnes</h1><p class="board-sub">👑 Couronne d'exploitant : meilleur cumul de records par ligne, avec sa collection</p></div></div>${crowns}</section>
      <section class="board"><div class="board-head"><div><h1 class="board-title">Conducteurs</h1><p class="board-sub">Étoiles, puis points</p></div></div>${list}</section>`;
    C.renderFeed();
  } catch (err) {
    body.innerHTML = `<section class="panel"><p class="muted pad">${esc(err.message)}</p></section>`;
  }
}

// Fenêtre par-dessus l'accueil (sabotage, bulletin)
function modal(html) {
  let el = $('ui-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ui-modal';
    el.className = 'mh-modal ui-modal';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-act="ui-close"]')) { el.hidden = true; return; }
      if (e.target.closest('[data-act]')) { el.hidden = true; onHomeClick(e); }
    });
  }
  el.innerHTML = `<div class="mh-modal-card ui-card">${html}<button class="ghost-btn" type="button" data-act="ui-close">Fermer</button></div>`;
  el.hidden = false;
  return el;
}

function openSabotage(pseudo) {
  if (!state.network?.sabotageToken) { C.toast('Un seul sabotage par jour. Nouveau jeton demain !'); return; }
  const t = state.targets?.find((x) => x.pseudo === pseudo);
  const lines = t?.lines ?? [];
  const pick = lines.map((id) => {
    const busy = t.pending.includes(id);
    return `<div class="sabo-line${busy ? ' off' : ''}">${pict(id, 'pict-sm')}<div class="sabo-kinds">${busy ? '<small>Déjà saboté sur cette ligne</small>' : Object.entries(SABOTAGES).map(([k, v]) => `<button type="button" class="chip-btn" data-act="sabo-go" data-pseudo="${esc(pseudo)}" data-line="${id}" data-kind="${k}" title="${esc(v.text)}">${v.icon} ${v.name}</button>`).join('')}</div></div>`;
  }).join('');
  modal(`<h2 class="ui-title">😈 Saboter ${esc(pseudo)}</h2>
    <p class="ui-sub">Ton incident frappera son prochain service sur la ligne choisie. S'il fait ${SABOTAGE_FOIL_STARS} ★ sans percuter ni franchir de signal, il le déjoue et empoche le bonus. Sinon, c'est pour toi, et tout le monde le saura.</p>
    ${pick || '<p class="muted">Aucune ligne à saboter.</p>'}`);
}

async function openBulletin() {
  let b;
  try { b = await api.bulletin('last'); } catch (err) { C.toast(err.message); return; }
  if (!b.runs) { try { b = await api.bulletin('current'); b.live = true; } catch { /* garde la semaine passée */ } }
  const d = String(b.key);
  const date = `${d.slice(6, 8)}/${d.slice(4, 6)}`;
  const lines = [
    `📰 BULLETIN TRAFIC UKIPU · semaine du ${date}${b.live ? ' (en cours)' : ''}`,
    `🎖️ Régulateur de la semaine : ${b.regulateur ? `${b.regulateur.pseudo} (${fr0.format(b.regulateur.score)} pts sur le défi hebdo, ${LINES[b.line].name})` : 'personne, honte à tous'}`,
    `🏆 U d'Or : ${b.udor ? `${b.udor.pseudo}, ${b.udor.pct} % sur « ${b.udor.mission} »` : 'aucun naufrage, suspect'}`,
    `🚆 ${b.runs} services assurés, dont ${b.threeStars} à 3 étoiles`,
    `👑 ${b.crowns} couronnes ont changé de tête`,
    `😈 Sabotages : ${b.sabotages.success} réussis, ${b.sabotages.foiled} déjoués`,
    b.mostActive ? `💪 Le plus assidu : ${b.mostActive.pseudo} (${b.mostActive.n} services)` : null,
    b.incidents ? `🐗 ${b.incidents} incidents honteux (sangliers, signaux franchis)` : null,
    '👉 ukipu : la U qui pue, mais à l\'heure',
  ].filter(Boolean);
  const text = lines.join('\n');
  const el = modal(`<div class="bulletin"><div class="bl-head"><span class="ticker-tag">Info trafic</span><b>Bulletin du lundi</b></div>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
    <button class="big-btn" type="button" id="bl-copy">Copier pour le groupe</button>`);
  el.querySelector('#bl-copy').onclick = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); C.toast('Bulletin copié, à coller dans le groupe'); } catch { C.toast('Copie impossible sur cet appareil'); }
  };
}

// ---------------------------------------------------------------------------
// Fiche mission : arrêts, conditions, rame, adversaire fantôme
// ---------------------------------------------------------------------------

export function showBrief(m) {
  const p = C.progress()[m.id];
  const line = lineOf(m);
  const route = buildRoute(m);
  const all = route.stations.slice(1).map((st) => st.k);
  const stops = m.stops ?? all;
  const probe = { limits: 0, signals: 0, leaves: 0, animals: 0, works: 0 };
  m.build({ limit: () => probe.limits++, signal: () => probe.signals++, leaves: () => probe.leaves++, animal: () => probe.animals++, works: () => probe.works++, runner: () => {}, passengers: () => {} });
  const cond = [];
  if (m.weather === 'rain') cond.push('<span class="pill pill-ok">Pluie · rails glissants</span>');
  if (m.weather === 'snow') cond.push('<span class="pill pill-ok">Neige · freinages longs</span>');
  if (m.light < 0.2) cond.push('<span class="pill pill-off">Nuit</span>');
  if (route.tunnels.length) cond.push('<span class="pill pill-off">Tunnel</span>');
  if (route.bridges.length) cond.push('<span class="pill pill-off">Pont sur la Seine</span>');
  if (probe.leaves) cond.push('<span class="pill pill-late">Feuilles mortes</span>');
  if (probe.animals) cond.push('<span class="pill pill-late">Animal sur la voie</span>');
  if (probe.works) cond.push('<span class="pill pill-late">Travaux</span>');
  if (probe.signals) cond.push('<span class="pill pill-off">Signal fermé</span>');
  const g = gear(m);
  const prof = state.profile;
  const sab = pendingSabotage(m);
  const gearHtml = m.fixedRame
    ? `<div class="gear"><div class="gear-pic">${trainSvg(m.fixedRame, g.livree)}</div><div><b>Rame imposée : ${RAMES[m.fixedRame].name}</b><small>${m.weekly ? 'Défi hebdo' : 'Défi du jour'} : tout le monde à armes égales.</small></div></div>`
    : `<div class="gear"><div class="gear-pic">${trainSvg(g.rame.id, g.livree)}</div><div><b>${RAMES[g.rame.id].name} · niv. ${g.rame.level}</b><small>${LIVREES[g.livree]?.name ?? ''}</small></div></div>
       ${prof && prof.rames.length > 1 ? `<div class="gear-pick">${prof.rames.map((r) => `<button type="button" class="chip-btn${r.id === g.rame.id ? ' on' : ''}" data-rame="${r.id}">${RAMES[r.id].name.split(' «')[0]}</button>`).join('')}</div>` : ''}`;
  $('brief').innerHTML = `
    <div class="board-head">
      <div>
        <p class="board-sub">${line.name} · ${m.daily ? 'Défi du jour' : m.weekly ? 'Défi hebdo' : m.stops ? 'Semi-direct' : 'Omnibus'} · départ ${fmtHM(m.clock)}</p>
        <h2 class="board-title" style="font-size:28px">${m.title}</h2>
      </div>
      ${pict(line.id, 'pict-lg')}
    </div>
    <div class="brief-body">
      ${sab ? `<p class="brief-sabo">😈 <b>${esc(sab.by)}</b> t'a saboté : ${SABOTAGES[sab.kind].icon} ${SABOTAGES[sab.kind].text} sur ce service.<small>${SABOTAGE_FOIL_STARS} ★ sans percuter ni franchir de signal pour le déjouer et empocher le bonus.</small></p>` : ''}
      <p class="brief-blurb">${m.blurb}</p>
      <div class="brief-stops">${all.map((k) => `<span class="${stops.includes(k) ? '' : 'pass'}">${line.stations[k].name}</span>`).join('')}</div>
      <div class="brief-cond">${cond.join('')}</div>
      ${gearHtml}
      <div class="brief-best">${p ? `Ton record : ${fr0.format(p.score)} pts · ${'★'.repeat(p.stars)}` : 'Pas encore de record sur cette mission.'}</div>
      <div class="brief-lb" id="brief-lb"></div>
    </div>
    <div class="brief-actions">
      <button class="big-btn" type="button" id="btn-go">Prendre les commandes</button>
      <button class="ghost-btn" type="button" id="btn-back">Retour aux départs</button>
    </div>`;
  $('screen-start').hidden = true;
  $('screen-brief').hidden = false;
  $('btn-go').onclick = () => C.startMission(m);
  $('btn-back').onclick = () => { $('screen-brief').hidden = true; showHome('departs'); };
  $('brief').querySelectorAll('[data-rame]').forEach((b) => {
    b.onclick = async () => {
      try { state.profile = await api.equip({ rame: b.dataset.rame }); showBrief(m); } catch (err) { C.toast(err.message); }
    };
  });
  const hasMe = !!C.store.get(C.ghostKey(m.id), null) || (api.loggedIn && p);
  state.ghostChoice = hasMe ? { type: 'me' } : { type: 'titulaire' };
  renderGhostChoice(m, null);
  if (api.online) {
    api.leaderboard(m.id).then((lb) => {
      const leader = lb.top[0];
      if (leader && (!api.user || leader.pseudo !== api.user.pseudo)) state.ghostChoice = { type: 'player', pseudo: leader.pseudo };
      renderGhostChoice(m, lb);
    }).catch(() => {});
  }
}

function renderGhostChoice(m, lb) {
  const el = $('brief-lb');
  if (!el) return;
  const hasMe = !!C.store.get(C.ghostKey(m.id), null) || (api.loggedIn && C.progress()[m.id]);
  const gc = state.ghostChoice;
  const opt = (type, pseudo, label, sub) => {
    const on = gc.type === type && (type !== 'player' || gc.pseudo === pseudo);
    return `<button class="lb-row${on ? ' on' : ''}" type="button" data-gt="${type}" data-gp="${esc(pseudo ?? '')}">${label}<small>${sub}</small><i>${on ? 'Fantôme ✓' : 'Fantôme'}</i></button>`;
  };
  let html = '<p class="feed-title">Rouler contre</p>';
  if (lb && lb.top.length) {
    html += lb.top.slice(0, 5).map((r) => opt('player', r.pseudo, `<b>${r.rank === 1 ? '👑' : `${r.rank}.`} ${esc(r.pseudo)}</b>`, `${fr0.format(r.score)} pts · ${'★'.repeat(r.stars)} · ${esc(RAMES[r.rame]?.name ?? 'Z 2N')}`)).join('');
    if (lb.mine && lb.mine.rank > 5) html += `<p class="acc-note">Toi : ${lb.mine.rank}e · ${fr0.format(lb.mine.score)} pts</p>`;
  }
  if (hasMe && !(lb && lb.top.some((r) => api.user && r.pseudo === api.user.pseudo && r.rank <= 5))) html += opt('me', null, '<b>Ton record</b>', 'Ton meilleur passage');
  html += opt('titulaire', null, '<b>Le titulaire</b>', 'Conducteur de référence');
  el.innerHTML = html;
  el.onclick = (e) => {
    const b = e.target.closest('[data-gt]');
    if (!b) return;
    const type = b.dataset.gt;
    const pseudo = b.dataset.gp;
    state.ghostChoice = type === 'player' && api.user && pseudo === api.user.pseudo ? { type: 'me' } : { type, pseudo };
    renderGhostChoice(m, lb);
  };
}
