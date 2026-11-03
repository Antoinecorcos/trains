// Accueil : carte du réseau, départs par ligne, dépôt (collection, colis), classement, fiche mission.
import {
  MISSIONS, LINES, LINE_UNLOCK, RAMES, LIVREES, RARITIES, BOX_SHOP, MAX_LEVEL, levelCost,
  dailyMission, dailyKey, lineOf, buildRoute,
} from './route.js';
import { api } from './api.js';
import { mountNetMap } from './netmap.js';

let netmap = null;

const $ = (id) => document.getElementById(id);
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtHM = ([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

let C; // contexte fourni par main.js : startMission, toast, progress, store, audio…
export const state = { tab: 'reseau', line: 'U', profile: null, crowns: null, ghostChoice: null };

// ---------------------------------------------------------------------------
// Progression : étoiles par ligne, déblocages
// ---------------------------------------------------------------------------

export const starsOn = (lineId) => MISSIONS.filter((m) => m.line === lineId).reduce((s, m) => s + (C.progress()[m.id]?.stars || 0), 0);
export const maxStarsOn = (lineId) => MISSIONS.filter((m) => m.line === lineId).length * 3;
export function lineOpen(id) {
  const u = LINE_UNLOCK[id];
  return !u || starsOn(u.line) >= u.stars || starsOn(id) > 0;
}
export const missionOpen = (m) => m.daily || (lineOpen(m.line) && starsOn(m.line) >= m.need);
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
  if (!api.loggedIn) { state.profile = null; renderWallet(); return; }
  try { state.profile = await api.profile(); } catch { /* garde le précédent */ }
  renderWallet();
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
    const m = [...MISSIONS, dailyMission()].find((x) => x.id === t.dataset.id);
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
  else if (a === 'sheet-close') $('mh-sheet').hidden = true;
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
        <span class="mh-chip">★ ${totalStars()}</span>
      </div>
      <div class="mh-ticker"><span class="ticker-tag">Info</span><div class="ticker-win"><span id="mh-ticker-text">Touche une ligne pour voir ses départs · pince pour zoomer</span></div></div>
      <div class="mh-zoom">
        <button type="button" data-act="zoom-in" aria-label="Zoomer">+</button>
        <button type="button" data-act="zoom-out" aria-label="Dézoomer">−</button>
        <button type="button" data-act="zoom-fit" aria-label="Recentrer">⤢</button>
      </div>
      ${hasGift ? `<button class="mh-gift" type="button" data-act="daily"><span>🎁</span><small>Jour ${giftDay}/7</small></button>` : ''}
      <div class="mh-legend">${Object.values(LINES).map((l) => `<button type="button" data-act="${lineOpen(l.id) ? 'line-sheet' : 'locked'}" data-id="${l.id}" data-why="${esc(lineOpen(l.id) ? '' : `${LINE_UNLOCK[l.id].stars} ★ sur la ${LINES[LINE_UNLOCK[l.id].line].name} pour débloquer`)}" class="${lineOpen(l.id) ? '' : 'locked'}">${pict(l.id, 'pict-sm')}</button>`).join('')}</div>
      <div class="mh-sheet" id="mh-sheet" hidden></div>
      <div class="mh-tip" id="mh-tip" hidden></div>
      <div class="mh-modal" id="mh-modal" hidden><div class="mh-modal-card"><div id="account" class="account"></div><button class="ghost-btn" type="button" data-act="modal-close">${api.loggedIn ? 'Fermer' : 'Plus tard'}</button></div></div>
    </div>`;
  const mount = () => {
    if (netmap) netmap.destroy();
    netmap = mountNetMap($('map-host'), {
      lineOpen, crowns: state.crowns, focus: 'U',
      onLine: (id) => showLineSheet(id),
      onStation: (name, x, y) => showStationTip(name, x, y),
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
  sh.innerHTML = `
    <div class="sh-head">${pict(id, 'pict-md')}<div><b>${l.name}</b><small>${l.kind} · ${l.stations[0].name} ↔ ${l.stations[l.stations.length - 1].name}</small></div><button type="button" class="sh-x" data-act="sheet-close" aria-label="Fermer">✕</button></div>
    <div class="sh-stats">
      <span><b>${starsOn(id)}/${maxStarsOn(id)}</b> ★</span>
      <span><b>${MISSIONS.filter((m) => m.line === id).length}</b> missions</span>
      <span><b>${l.stations.length}</b> gares</span>
      <span>${crown ? `👑 <b>${esc(crown.pseudo)}</b>` : 'Couronne libre'}</span>
    </div>
    ${open ? `<button class="big-btn" type="button" data-act="line" data-id="${id}">Voir les départs ›</button>` : `<p class="sh-lock">🔒 ${u.stars} ★ sur la ${LINES[u.line].name} pour débloquer cette ligne</p>`}`;
  sh.hidden = false;
}

function showStationTip(name, x, y) {
  const tip = $('mh-tip');
  const lines = Object.values(LINES).filter((l) => l.stations.some((s) => s.name === name)).map((l) => l.id);
  const r = $('map-host').getBoundingClientRect();
  tip.innerHTML = `<b>${esc(name)}</b><span>${lines.map((id) => pict(id, 'pict-xs')).join(' ')}</span>`;
  tip.style.left = `${Math.min(r.width - 200, Math.max(8, x - r.left - 90))}px`;
  tip.style.top = `${Math.max(60, y - r.top - 70)}px`;
  tip.hidden = false;
}

// ---------------------------------------------------------------------------
// Onglet Départs : missions de la ligne choisie
// ---------------------------------------------------------------------------

function renderDeparts(body) {
  const l = LINES[state.line] ?? LINES.U;
  const prog = C.progress();
  const daily = dailyMission();
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
    <div class="line-tabs">${Object.values(LINES).map((x) => `<button type="button" class="lt${x.id === l.id ? ' on' : ''}${lineOpen(x.id) ? '' : ' locked'}" data-act="${lineOpen(x.id) ? 'line' : 'locked'}" data-id="${x.id}" data-why="${lineOpen(x.id) ? '' : esc(`${LINE_UNLOCK[x.id].stars} ★ sur la ${LINES[LINE_UNLOCK[x.id].line].name} pour débloquer`)}">${pict(x.id, 'pict-sm')}</button>`).join('')}</div>
    <section class="board">
      <div class="board-head">
        <div><h1 class="board-title">Départs</h1><p class="board-sub">${l.kind} · ${l.name}${crown ? ` · 👑 ${esc(crown.pseudo)}` : ''}</p></div>
        <div class="board-brand">${pict(l.id, 'pict-lg')}</div>
      </div>
      ${row(daily)}
      ${MISSIONS.filter((m) => m.line === l.id).map(row).join('')}
      <div class="board-foot"><span class="best">${starsOn(l.id)} / ${maxStarsOn(l.id)} ★ sur la ${l.name}</span><span class="howto">Le défi du jour impose la Z 2N : tout le monde à armes égales.</span></div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Onglet Dépôt : colis, rames, livrées
// ---------------------------------------------------------------------------

const RAR = (r) => RARITIES[r] ?? RARITIES.commun;

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
  body.innerHTML = `
    <section class="panel"><div class="panel-head"><h2>Colis</h2><span class="muted">🎟 ${fr0.format(p.tickets)} · ⚙ ${fr0.format(p.parts)}</span></div><div class="boxes">${boxes}</div></section>
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
    const big = it.type === 'rame' || it.type === 'livree';
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
    const [{ players }, { lines }] = await Promise.all([api.ranking(), api.lines()]);
    state.crowns = lines;
    const crowns = Object.values(LINES).map((l) => {
      const c = lines[l.id]?.crown;
      return `<div class="row rk-row">${pict(l.id, 'pict-md')}<span class="row-mid"><span class="row-dest">${c ? `👑 ${esc(c.pseudo)}` : '<span class="muted">Couronne libre</span>'}</span><span class="row-type">${l.name}${c ? ` · ${fr0.format(c.score)} pts cumulés` : ''}</span></span><span class="row-type">${lines[l.id]?.players ?? 0} conducteurs</span></div>`;
    }).join('');
    const list = players.length ? players.map((p) => `
      <div class="row rk-row${api.user && p.pseudo === api.user.pseudo ? ' me' : ''}">
        <span class="row-time">${p.rank}</span>
        <span class="row-mid"><span class="row-dest">${esc(p.pseudo)}${p.crowns ? ` <span class="crowns">👑×${p.crowns}</span>` : ''}</span><span class="row-type">${p.missions} mission${p.missions > 1 ? 's' : ''} · ${fr0.format(p.score)} pts</span></span>
        <span class="row-stars">${p.stars} ★</span>
      </div>`).join('') : '<p class="muted pad">Personne n\'a encore roulé. À toi l\'honneur.</p>';
    body.innerHTML = `
      <section class="panel" id="feed" hidden></section>
      <section class="board"><div class="board-head"><div><h1 class="board-title">Couronnes</h1><p class="board-sub">Meilleur cumul de records par ligne</p></div></div>${crowns}</section>
      <section class="board"><div class="board-head"><div><h1 class="board-title">Conducteurs</h1><p class="board-sub">Étoiles, puis points</p></div></div>${list}</section>`;
    C.renderFeed();
  } catch (err) {
    body.innerHTML = `<section class="panel"><p class="muted pad">${esc(err.message)}</p></section>`;
  }
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
  const gearHtml = m.fixedRame
    ? `<div class="gear"><div class="gear-pic">${trainSvg(m.fixedRame, g.livree)}</div><div><b>Rame imposée : ${RAMES[m.fixedRame].name}</b><small>Défi du jour : tout le monde à armes égales.</small></div></div>`
    : `<div class="gear"><div class="gear-pic">${trainSvg(g.rame.id, g.livree)}</div><div><b>${RAMES[g.rame.id].name} · niv. ${g.rame.level}</b><small>${LIVREES[g.livree]?.name ?? ''}</small></div></div>
       ${prof && prof.rames.length > 1 ? `<div class="gear-pick">${prof.rames.map((r) => `<button type="button" class="chip-btn${r.id === g.rame.id ? ' on' : ''}" data-rame="${r.id}">${RAMES[r.id].name.split(' «')[0]}</button>`).join('')}</div>` : ''}`;
  $('brief').innerHTML = `
    <div class="board-head">
      <div>
        <p class="board-sub">${line.name} · ${m.daily ? 'Défi du jour' : m.stops ? 'Semi-direct' : 'Omnibus'} · départ ${fmtHM(m.clock)}</p>
        <h2 class="board-title" style="font-size:28px">${m.title}</h2>
      </div>
      ${pict(line.id, 'pict-lg')}
    </div>
    <div class="brief-body">
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
