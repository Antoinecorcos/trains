// Ukipu — mode conduite : écrans, pupitre, boucle de jeu.
import { MISSIONS, dailyMission, weeklyMission, lineOf, buildRoute } from './route.js';
import { SABOTAGES } from './reseau.js';
import {
  DT, createRun, step, computeSchedule, aiInput, newLog, record, limitAt, nextLimit, nextStop, nextSignal, clockAt, projectedGap, adhesionAt, lightsWanted, nearPlatform,
} from './sim.js';
import { World } from './world.js';
import { Audio } from './audio.js';
import { api } from './api.js';
import { initHome, showHome, showBrief, gear, state as home, refreshProfile, openBoxFlow, missionOpen, applySabotage } from './home.js';

const $ = (id) => document.getElementById(id);
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const SPEED = (() => { try { return Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('vitesse')) || 1)); } catch { return 1; } })();

const audio = new Audio();
audio.muted = store.get('ukipu.drive.muted', false);
let world;
let run = null;
let mission = null;
let sched = null;
let ghost = null;
let running = false;
let paused = false;
let acc = 0;
let last = performance.now();
let lever = 0;
let hornEdge = false;
let hornHeld = false;
let doorReq = false;
let lightsReq = false;
let toastTimer = 0;
let runLog = null;
let ghostChoice = null; // { type: 'titulaire' | 'me' | 'player', pseudo }
let starting = false;
let runGear = null;
const schedCache = {};
const tips = store.get('ukipu.drive.tips', {});

const allMissions = () => [...MISSIONS, dailyMission(), weeklyMission()];
const progKey = () => (api.loggedIn ? `ukipu.drive.progress.u.${api.user.pseudo.toLowerCase()}` : 'ukipu.drive.progress.v2');
const ghostKey = (id) => (api.loggedIn ? `ukipu.drive.ghost.u.${api.user.pseudo.toLowerCase()}.${id}` : `ukipu.drive.ghost.v2.${id}`);
const progress = () => store.get(progKey(), {});
const syncProgress = () => { if (api.loggedIn && api.progress) store.set(progKey(), api.progress); };
const totalStars = () => Object.entries(progress()).filter(([id]) => !id.startsWith('daily')).reduce((s, [, p]) => s + (p.stars || 0), 0);
// Mission suivante ouverte sur la même ligne
const nextMission = () => {
  const list = MISSIONS.filter((m) => m.line === (mission?.line ?? 'U'));
  const i = list.findIndex((m) => m.id === mission?.id);
  return list.slice(i + 1).find((m) => missionOpen(m)) ?? null;
};
const fmtClock = (t, sec = true) => {
  const s = Math.floor(t);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return sec ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
};

// ---------------------------------------------------------------------------
// Tableau des départs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Compte, fil d'actu, classement général
// ---------------------------------------------------------------------------

function renderAccount() {
  const el = $('account');
  if (!api.online) {
    el.innerHTML = `
      <label class="row row-input" for="pseudo">
        <span class="row-time small">Agent</span>
        <input id="pseudo" type="text" maxlength="16" autocomplete="nickname" placeholder="Ton pseudo" value="${esc(store.get('ukipu.pseudo', ''))}">
      </label>
      <p class="acc-note">Hors ligne : tes parties restent sur cet appareil, sans classement.</p>`;
    return;
  }
  if (api.loggedIn) {
    el.innerHTML = `
      <div class="row acc-row">
        <span class="row-time small">Agent</span>
        <span class="row-mid"><span class="row-dest">${esc(api.user.pseudo)}</span><span class="row-type">Tes parties comptent au classement</span></span>
        <span class="acc-btns">
          <button class="pill pill-off" type="button" id="btn-logout">Déconnexion</button>
        </span>
      </div>`;
    $('btn-logout').onclick = async () => { await api.logout(); home.profile = null; showHome('reseau'); };
    return;
  }
  el.innerHTML = `
    <form class="acc-form" id="acc-form" autocomplete="on">
      <p class="acc-title">Connecte-toi pour entrer au classement et rouler contre tes potes.</p>
      <div class="acc-fields">
        <input id="acc-pseudo" type="text" maxlength="16" autocomplete="username" placeholder="Pseudo" value="${esc(store.get('ukipu.pseudo', ''))}">
        <input id="acc-pass" type="password" autocomplete="current-password" placeholder="Mot de passe">
      </div>
      <div class="acc-actions">
        <button class="big-btn small" type="submit">Connexion</button>
        <button class="ghost-btn small" type="button" id="btn-register">Créer mon compte</button>
      </div>
      <p class="acc-err" id="acc-err" role="alert"></p>
    </form>`;
  const go = async (mode) => {
    const pseudo = $('acc-pseudo').value.trim();
    const pass = $('acc-pass').value;
    $('acc-err').textContent = '';
    try {
      if (mode === 'register') await api.register(pseudo, pass); else await api.login(pseudo, pass);
      store.set('ukipu.pseudo', api.user.pseudo);
      syncProgress();
      await refreshProfile();
      toast(mode === 'register' ? `Bienvenue ${api.user.pseudo} ! Un colis t'attend au dépôt.` : `Bon retour ${api.user.pseudo}`);
      showHome('reseau');
    } catch (e) {
      $('acc-err').textContent = e.message;
    }
  };
  $('acc-form').onsubmit = (e) => { e.preventDefault(); go('login'); };
  $('btn-register').onclick = () => go('register');
}

const ago = (at) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
};

async function renderFeed() {
  const el = $('feed');
  if (!api.online) { el.hidden = true; return; }
  try {
    const { events } = await api.feed();
    if (!events.length) { el.hidden = true; return; }
    el.innerHTML = `<div class="panel-head"><h2>Fil d'actu</h2></div>${events.slice(0, 6).map((e) => `
      <div class="feed-item ${e.kind}"><span>${esc(e.text)}</span><small>${ago(e.at)}</small></div>`).join('')}`;
    el.hidden = false;
  } catch { el.hidden = true; }
}

// ---------------------------------------------------------------------------
// Lancement d'une mission
// ---------------------------------------------------------------------------

async function startMission(m) {
  if (starting) return;
  starting = true;
  audio.start();
  const ps = $('pseudo');
  if (ps) store.set('ukipu.pseudo', ps.value.trim());
  mission = m;
  if (!schedCache[m.id]) schedCache[m.id] = computeSchedule(m);
  sched = schedCache[m.id];
  ghost = await loadGhost(m);
  starting = false;
  const g = gear(m);
  // le sabotage d'un pote s'ajoute au parcours ; l'horaire reste celui du service normal
  run = createRun(applySabotage(m), { sched, rame: g.rame });
  run.livree = g.livree;
  runGear = g;
  runLog = newLog();
  lever = 0;
  acc = 0;
  hornEdge = false;
  doorReq = false;
  lightsReq = false;
  world.zoom = 1;
  $('mission-title').textContent = m.title;
  const lp = $('line-pict');
  lp.textContent = run.m.route.line.id;
  lp.style.background = run.m.route.line.color;
  lp.style.color = run.m.route.line.ink;
  buildStrip();
  for (const id of ['screen-start', 'screen-brief', 'screen-pause', 'screen-end']) $(id).hidden = true;
  $('pops').innerHTML = '';
  setLever(0);
  running = true;
  paused = false;
  if (m.tutorial) tip('start', 'Pousse le manipulateur (à droite) vers le haut pour démarrer.', true);
  else toast(`${m.title} · ${run.m.stops.length} arrêts`);
}

async function loadGhost(m) {
  const choice = home.ghostChoice ?? { type: 'titulaire' };
  const titulaire = { frames: sched.frames, label: 'Titulaire', rame: m.fixedRame ?? 'Z2N', livree: 'origine' };
  try {
    if (choice.type === 'player' && api.online) {
      const g = await api.ghost(m.id, choice.pseudo);
      return { frames: g.frames, label: g.pseudo, rame: g.rame, livree: g.livree };
    }
    if (choice.type === 'me') {
      const local = store.get(ghostKey(m.id), null);
      if (local) return Array.isArray(local) ? { frames: local, label: 'Ton record' } : { ...local, label: 'Ton record' };
      if (api.loggedIn) {
        const g = await api.ghost(m.id, api.user.pseudo);
        return { frames: g.frames, label: 'Ton record', rame: g.rame, livree: g.livree };
      }
    }
  } catch { /* fantôme indisponible : on roule avec le titulaire */ }
  return titulaire;
}

function buildStrip() {
  const a = run.m.start;
  const b = run.m.end;
  const pos = (x) => `${((x - a) / (b - a)) * 100}%`;
  const dots = run.m.stops.map((s, i) => `<i class="strip-dot" data-i="${i}" style="left:${pos(s.x)}"></i>`).join('');
  const passes = run.m.passes.map((p) => `<i class="strip-dot pass" style="left:${pos(p.x)}"></i>`).join('');
  $('strip').innerHTML = `<i class="strip-fill" id="strip-fill"></i>${passes}${dots}<i class="strip-train" id="strip-train"></i>`;
}

// ---------------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------------

function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  if (run && running && !paused && !run.over) {
    acc += dt * SPEED;
    while (acc >= DT && !run.over) {
      const input = { lever, horn: hornEdge, door: doorReq, lights: lightsReq };
      record(runLog, input);
      step(run, input);
      hornEdge = false;
      doorReq = false;
      lightsReq = false;
      acc -= DT;
    }
    handleEvents();
    audio.update(run);
  }
  if (run) {
    const gx = ghostAt(run.t);
    const ghosts = gx != null ? [{ x: gx, label: ghost.label, rame: ghost.rame, livree: ghost.livree }] : [];
    world.draw(run, ghosts, ts);
    updateHud();
  } else {
    world.draw(idleRun(), [], ts);
  }
  requestAnimationFrame(frame);
}

// Rame à quai à La Défense derrière le tableau des départs
let idle = null;
function idleRun() {
  if (!idle) idle = createRun(MISSIONS[0]);
  return idle;
}

function ghostAt(t) {
  if (!ghost) return null;
  const i = Math.floor(t / 0.1);
  if (i < ghost.frames.length) return ghost.frames[i];
  return null;
}

function ghostDelta() {
  if (!ghost || !run) return null;
  const f = ghost.frames;
  // temps auquel le fantôme a atteint notre position
  let lo = 0;
  let hi = f.length - 1;
  if (f[hi] < run.x) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (f[mid] < run.x) lo = mid + 1; else hi = mid; }
  return run.t - lo * 0.1;
}

// ---------------------------------------------------------------------------
// Événements de la simulation
// ---------------------------------------------------------------------------

function handleEvents() {
  for (const ev of run.events) {
    switch (ev.type) {
      case 'grade': {
        const dist = `${ev.d > 0 ? '+' : ''}${fr1.format(ev.d)} m`;
        pop(ev.label, `${dist} · +${ev.pts}${ev.combo >= 2 ? ` · combo ×${ev.combo}` : ''}`, ev.grade);
        if (ev.grade === 'parfait') { audio.perfect(); world.shake = 4; } else if (ev.grade === 'super' || ev.grade === 'bien') audio.good();
        else audio.bad();
        if (ev.combo >= 2) bumpCombo();
        break;
      }
      case 'punct':
        setTimeout(() => pop(ev.label, ev.pts ? `+${ev.pts}` : '', ev.pts >= 300 ? 'super small' : ev.pts ? 'bien small' : 'rate small'), 650);
        break;
      case 'doors':
        if (ev.label === 'Ouverture rapide') { setTimeout(() => pop(ev.label, `+${ev.pts}`, 'bien small'), 1300); break; }
        pop(ev.label, ev.pts > 0 ? `+${ev.pts}` : `${ev.pts}`, ev.pts > 100 ? 'super small' : ev.pts >= 0 ? 'bien small' : 'rate small');
        break;
      case 'bonus':
      case 'fled':
      case 'warned':
        pop(ev.label, `+${ev.pts}`, 'super small');
        audio.good();
        break;
      case 'penalty':
      case 'missed':
      case 'hit':
      case 'spad':
      case 'kvb':
        pop(ev.label, `${ev.pts}`, 'rate small');
        audio.alarm();
        world.shake = ev.type === 'hit' ? 14 : 8;
        break;
      case 'reverse':
        toast(ev.label);
        audio.bad();
        break;
      case 'atStop':
        audio.click();
        tip('open', 'Train à quai : ouvre les portes (bouton Portes, ou Entrée au clavier). Tu peux encore avancer doucement avant d\'ouvrir.');
        break;
      case 'doorsOpen':
        audio.chime();
        if (!ev.last) tip('doors', 'Les voyageurs montent. Ferme les portes (même bouton, ou Entrée) dès que la barre est pleine.');
        break;
      case 'shortPlatform':
        pop('Quai court', 'la 2e rame reste hors quai · montée plus lente', 'rate small');
        break;
      case 'lights':
        audio.click();
        break;
      case 'lightsNeeded':
        tip('lights', 'Il fait noir : allume les pleins phares (bouton Phares, ou L). Repasse en code en entrant en gare.');
        audio.bad();
        break;
      case 'doorsClosing':
        audio.doorBeep();
        break;
      case 'boarded':
        audio.click();
        break;
      case 'runner':
        toast('Un retardataire court sur le quai ! Attends-le ?');
        break;
      case 'slip':
        toast(ev.brake ? 'Enrayage : les roues glissent, freine plus doucement' : 'Patinage : accélère plus doucement');
        break;
      case 'signalClear':
        audio.click();
        break;
      case 'tip':
        if (ev.id === 'creep') toast('Trop court : avance doucement jusqu\'au repère');
        break;
      case 'terminus':
        audio.chime();
        break;
      case 'over':
        running = false;
        setTimeout(showEnd, 1100);
        break;
    }
  }
  run.events.length = 0;
}

function pop(title, sub, cls) {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function toast(text, isTip = false) {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast${isTip ? ' tip' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isTip ? 4200 : 2600);
}

function tip(id, text) {
  if (tips[id]) return;
  tips[id] = true;
  store.set('ukipu.drive.tips', tips);
  toast(text, true);
}

function bumpCombo() {
  const el = $('combo');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---------------------------------------------------------------------------
// Bandeau et pupitre
// ---------------------------------------------------------------------------

function updateHud() {
  const r = run;
  $('score').textContent = fr0.format(Math.max(0, Math.round(r.score)));
  const cb = $('combo');
  cb.hidden = r.combo < 2;
  cb.textContent = `COMBO ×${r.combo}`;
  $('clock').textContent = fmtClock(clockAt(r));

  // bande de progression
  const a = r.m.start;
  const b = r.m.end;
  const f = Math.max(0, Math.min(1, (r.x - a) / (b - a)));
  $('strip-fill').style.width = `${f * 100}%`;
  $('strip-train').style.left = `${f * 100}%`;
  document.querySelectorAll('.strip-dot[data-i]').forEach((el) => {
    const i = Number(el.dataset.i);
    const g = r.grades[i];
    el.className = `strip-dot${g ? (g.grade === 'rate' ? ' miss' : ' done') : ''}`;
  });

  drawSpeedo(r);

  // prochain arrêt
  const s = nextStop(r);
  const dEl = $('dist');
  const gauge = $('gauge');
  if (r.phase === 'doors' || r.phase === 'arrived' || r.phase === 'over') {
    const dr = r.doors;
    $('next-k').textContent = dr && dr.last ? 'Terminus' : 'À quai';
    $('next-name').textContent = r.m.stops[Math.min(r.stopI, r.m.stops.length - 1)].name;
    dEl.textContent = dr ? `${Math.floor(dr.boarded)}/${dr.pax}` : '';
    $('sched').innerHTML = dr && dr.last ? 'Tout le monde descend' : 'Montée des voyageurs';
    gauge.hidden = true;
  } else if (s) {
    const d = r.x - s.x;
    $('next-k').textContent = 'Prochain arrêt';
    $('next-name').textContent = s.name;
    dEl.textContent = d < -10 ? `${fr0.format(-d)} m` : `${fr1.format(-d)} m`;
    const gap = projectedGap(r);
    const locked = r.sched && r.t < r.depAt;
    if (locked) $('sched').innerHTML = `Départ dans <b>${Math.ceil(r.depAt - r.t)} s</b>`;
    else {
      const g = Math.round(gap);
      $('sched').innerHTML = `Arrivée ${fmtClock(clockAt(r) - r.t + r.sched.arr[r.stopI])}<br><span class="${g > 2 ? 'late' : g < -2 ? 'early' : ''}">${g > 0 ? '+' : ''}${g} s</span>`;
    }
    if (d > -45 && d < 14) {
      gauge.hidden = false;
      $('gauge-nose').style.left = `${gaugePos(d) * 100}%`;
      if (r.m.tutorial) tip('gauge', 'Vise la zone jaune de la jauge : c\'est le repère d\'arrêt.');
    } else gauge.hidden = true;
    if (r.m.tutorial && r.v > 8 && d < -80) tip('brake', 'Le repère d\'arrêt est en bout de quai. Tire le manipulateur vers le bas pour freiner.');
  }

  // puces d'alerte
  const chips = [];
  let alert = null;
  const lim = limitAt(r, r.x);
  const nl = nextLimit(r);
  if (nl && nl.kmh < lim) chips.push(`<span class="chip limit"><b>${nl.kmh}</b> dans ${fr0.format(nl.d)} m</span>`);
  const sg = nextSignal(r);
  if (sg && sg.s.state === 'red' && sg.d < 520) {
    chips.push(`<span class="chip red"><i style="background:#fff"></i>Signal fermé ${fr0.format(sg.d)} m</span>`);
    if (sg.d < 260) alert = { cls: 'red', text: `● Signal fermé · ${sg.s.why}` };
    if (r.m.tutorial) tip('signal', 'Signal fermé devant : ralentis tôt, il s\'ouvrira peut-être avant que tu n\'arrives.');
  }
  for (const an of r.animals) {
    const d = an.x - r.x;
    if (an.state === 'track' && d > 0 && d < 320) {
      chips.push(`<span class="chip warn">Sanglier ${fr0.format(d)} m · klaxon !</span>`);
      if (d < 200) alert = alert ?? { cls: 'warn', text: 'Sanglier sur la voie · KLAXON !' };
    }
  }
  for (const w of r.works) {
    if (!w.warned && r.x > w.from - 320 && r.x < w.to) {
      chips.push('<span class="chip warn">Agents sur la voie · klaxon</span>');
      if (r.x > w.from - 220) alert = alert ?? { cls: 'warn', text: 'Agents sur la voie · KLAXON !' };
    }
  }
  const adh = adhesionAt(r, r.x);
  if (adh < 0.5) chips.push('<span class="chip warn">Feuilles mortes · adhérence faible</span>');
  else if (r.m.weather === 'snow') chips.push('<span class="chip info">Neige · freinez tôt</span>');
  else if (adh < 1) chips.push('<span class="chip info">Rails mouillés</span>');
  if (r.kvb) alert = { cls: 'red', text: 'KVB · freinage d\'urgence' };
  else if (r.overspeed) alert = { cls: 'red', text: `Survitesse · limite ${lim}` };
  if (r.lightsWarn) chips.unshift('<span class="chip red">Il fait noir · allume les phares (L)</span>');
  else if (r.lights && nearPlatform(r) && r.phase === 'run') chips.unshift('<span class="chip warn">Entrée en gare · passe en code (L)</span>');
  if (r.sched && r.phase === 'run' && r.t < r.depAt) chips.push('<span class="chip info">Départ verrouillé</span>');
  $('chips').innerHTML = chips.slice(0, 3).join('');
  const al = $('alert');
  if (alert) { al.hidden = false; al.className = `alert ${alert.cls}`; al.textContent = alert.text; } else al.hidden = true;
  if (r.m.tutorial && nl && nl.d < 250) tip('limit', 'Panneau de limitation devant : respecte la vitesse, sinon freinage d\'urgence.');

  // fantôme
  const gd = ghostDelta();
  const gEl = $('ghost-delta');
  if (gd != null && r.phase === 'run') {
    gEl.hidden = false;
    gEl.className = `ghost-delta ${gd > 0.05 ? 'behind' : 'ahead'}`;
    gEl.innerHTML = `${ghost.label} <b>${gd > 0 ? '+' : '−'}${fr1.format(Math.abs(gd))} s</b>`;
  } else gEl.hidden = true;

  // portes
  const db = $('btn-doors');
  const dr = r.doors;
  const lb = $('btn-lights');
  lb.classList.toggle('on', r.lights);
  lb.classList.toggle('need', r.phase === 'run' && lightsWanted(r) !== r.lights && (r.lights || r.v > 1));
  $('lights-lbl').textContent = r.lights ? 'Phares' : 'Code';
  if (r.phase === 'run' && r.waitDoors != null) {
    db.disabled = false;
    db.classList.add('ready');
    db.classList.remove('boarding');
    $('doors-lbl').textContent = 'Ouvrir les portes';
    $('doors-fill').style.width = '0';
  } else if (r.phase === 'doors' && dr && !dr.last) {
    const full = dr.fullAt != null;
    db.disabled = dr.state !== 'open';
    db.classList.toggle('ready', dr.state === 'open' && full);
    db.classList.toggle('boarding', dr.state === 'open' && !full);
    $('doors-lbl').textContent = dr.state === 'opening' ? 'Ouverture…' : dr.state === 'closing' ? 'Fermeture…' : 'Fermer les portes';
    $('doors-fill').style.width = `${(dr.boarded / dr.pax) * 100}%`;
  } else {
    db.disabled = true;
    db.classList.remove('ready', 'boarding');
    $('doors-lbl').textContent = 'Portes';
    $('doors-fill').style.width = '0';
  }
  if (r.m.tutorial && r.phase === 'run' && r.v < 0.1 && r.lever <= 0 && r.stopI > 0 && r.x < (nextStop(r)?.x ?? 0) - (nextStop(r)?.plat ?? 150)) {
    tip('depart', 'Portes fermées : remets de la traction pour repartir.');
  }
}

// Position de la tête du train sur la jauge (échelle non linéaire autour du repère)
function gaugePos(d) {
  const pts = [[0, 0], [0.5, 0.0333], [1.5, 0.1533], [4, 0.3133], [10, 0.5]];
  const a = Math.min(Math.abs(d), 10);
  let f = 0.5;
  for (let i = 1; i < pts.length; i++) {
    if (a <= pts[i][0]) {
      const [d0, f0] = pts[i - 1];
      const [d1, f1] = pts[i];
      f = f0 + ((f1 - f0) * (a - d0)) / (d1 - d0);
      break;
    }
  }
  if (Math.abs(d) > 10) f = 0.5 + Math.min(0.04, (Math.abs(d) - 10) * 0.002);
  return 0.5 + Math.sign(d) * Math.min(0.5, f);
}

function drawSpeedo(r) {
  const cv = $('speedo');
  const css = cv.clientWidth || 112;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (cv.width !== Math.round(css * dpr)) { cv.width = Math.round(css * dpr); cv.height = Math.round(css * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = css;
  const c = s / 2;
  const R = s * 0.44;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#0b0e1e';
  ctx.beginPath(); ctx.arc(c, c, s * 0.49, 0, Math.PI * 2); ctx.fill();
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  const ang = (kmh) => a0 + (Math.min(130, kmh) / 130) * span;
  const lim = limitAt(r, r.x);
  // arc vert jusqu'à la limite, rouge au-delà
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = 'rgba(36,180,126,0.55)';
  ctx.beginPath(); ctx.arc(c, c, R, a0, ang(lim)); ctx.stroke();
  ctx.strokeStyle = 'rgba(227,59,69,0.7)';
  ctx.beginPath(); ctx.arc(c, c, R, ang(lim), a0 + span); ctx.stroke();
  // graduations
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `800 ${s * 0.075}px "Nunito Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= 120; v += 10) {
    const a = ang(v);
    const big = v % 20 === 0;
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (R - s * 0.07), c + Math.sin(a) * (R - s * 0.07));
    ctx.lineTo(c + Math.cos(a) * (R - (big ? s * 0.15 : s * 0.11)), c + Math.sin(a) * (R - (big ? s * 0.15 : s * 0.11)));
    ctx.stroke();
    if (big && v % 40 === 0 && v > 0) ctx.fillText(String(v), c + Math.cos(a) * (R - s * 0.23), c + Math.sin(a) * (R - s * 0.23));
  }
  // aiguille
  const kmh = r.v * 3.6;
  const a = ang(kmh);
  ctx.strokeStyle = kmh > lim + 3 ? '#ff5560' : '#ffd200';
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c - Math.cos(a) * s * 0.06, c - Math.sin(a) * s * 0.06);
  ctx.lineTo(c + Math.cos(a) * (R - s * 0.04), c + Math.sin(a) * (R - s * 0.04));
  ctx.stroke();
  ctx.fillStyle = '#1a1f33';
  ctx.beginPath(); ctx.arc(c, c, s * 0.05, 0, Math.PI * 2); ctx.fill();
  // lecture numérique
  ctx.fillStyle = '#ffae00';
  ctx.font = `900 ${s * 0.2}px Doto, "Courier New", monospace`;
  ctx.fillText(String(Math.round(kmh)), c, c + s * 0.24);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `800 ${s * 0.065}px "Nunito Sans", sans-serif`;
  ctx.fillText('km/h', c, c + s * 0.37);
  // panneau de limitation
  const lx = c + s * 0.3;
  const ly = c - s * 0.31;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(lx, ly, s * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e33b45';
  ctx.lineWidth = s * 0.025;
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = `900 ${s * 0.085}px "Nunito Sans", sans-serif`;
  ctx.fillText(String(lim), lx, ly + 1);
}

// ---------------------------------------------------------------------------
// Manipulateur et boutons
// ---------------------------------------------------------------------------

function setLever(v) {
  const prev = lever;
  lever = Math.round(Math.max(-1, Math.min(1, Math.abs(v) < 0.07 ? 0 : v)) * 100) / 100;
  if ((prev === 0) !== (lever === 0) || (prev > -0.92) !== (lever > -0.92)) { audio.click(); navigator.vibrate?.(8); }
  const el = $('lever');
  const knob = $('lever-knob');
  const h = el.clientHeight;
  const top = 14 + 20 + ((1 - lever) / 2) * (h - 28 - 40);
  knob.style.top = `${top}px`;
  knob.className = `lv-knob${lever > 0 ? ' t' : lever <= -0.92 ? ' fu' : lever < 0 ? ' f' : ''}`;
  $('lever-val').textContent = lever > 0 ? `T ${Math.round(lever * 100)}` : lever <= -0.92 ? 'FU' : lever < 0 ? `F ${Math.round((-lever / 0.92) * 100)}` : '0';
  el.setAttribute('aria-valuenow', String(Math.round(lever * 100)));
}

function bindLever() {
  const el = $('lever');
  let dragging = false;
  const fromY = (clientY) => {
    const r = el.getBoundingClientRect();
    const f = (clientY - r.top - 34) / (r.height - 68);
    return 1 - 2 * Math.max(0, Math.min(1, f));
  };
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    setLever(fromY(e.clientY));
    if (run?.m.tutorial && lever > 0.2) tips.start = true;
  });
  el.addEventListener('pointermove', (e) => { if (dragging) setLever(fromY(e.clientY)); });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  new ResizeObserver(() => setLever(lever)).observe(el);
}

function bindButtons() {
  const horn = $('btn-horn');
  const hornOn = (e) => { e.preventDefault(); hornEdge = true; hornHeld = true; horn.classList.add('on'); audio.horn(true); };
  const hornOff = () => { if (!hornHeld) return; hornHeld = false; horn.classList.remove('on'); audio.horn(false); };
  horn.addEventListener('pointerdown', hornOn);
  horn.addEventListener('pointerup', hornOff);
  horn.addEventListener('pointerleave', hornOff);
  horn.addEventListener('pointercancel', hornOff);
  $('btn-doors').addEventListener('pointerdown', (e) => { e.preventDefault(); doorReq = true; });
  $('btn-lights').addEventListener('pointerdown', (e) => { e.preventDefault(); lightsReq = true; });

  window.addEventListener('keydown', (e) => {
    if (!run || !running || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'z' || k === 'w') { setLever((lever === 0 ? 0 : lever) + 0.1); e.preventDefault(); }
    else if (k === 'arrowdown' || k === 's') { setLever(lever - 0.1); e.preventDefault(); }
    else if (k === '0' || k === 'n') setLever(0);
    else if (k === ' ' || k === 'h') { if (!e.repeat) hornOn(e); }
    else if (k === 'enter' || k === 'd') { e.preventDefault(); if (!e.repeat) doorReq = true; }
    else if (k === 'l' || k === 'f') { if (!e.repeat) lightsReq = true; }
    else if (k === 'escape' || k === 'p') setPaused(true);
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key.toLowerCase() === 'h') hornOff(); });

  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-restart').addEventListener('click', () => startMission(mission));
  $('btn-quit').addEventListener('click', () => { run = null; showHome('departs'); });
  $('btn-sound').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    store.set('ukipu.drive.muted', audio.muted);
    $('sound-lbl').textContent = `Son : ${audio.muted ? 'coupé' : 'activé'}`;
  });
  $('sound-lbl').textContent = `Son : ${audio.muted ? 'coupé' : 'activé'}`;
  $('btn-again').addEventListener('click', () => startMission(mission));
  $('btn-board').addEventListener('click', () => { run = null; showHome('departs'); });
  $('btn-next').addEventListener('click', () => {
    const nx = nextMission();
    if (nx) showBrief(nx); else showHome('departs');
  });
  $('btn-copy').addEventListener('click', copyResult);
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
}

function setPaused(v) {
  if (!run || !running || run.over) return;
  paused = v;
  $('screen-pause').hidden = !v;
  if (v) { audio.horn(false); audio.update({ v: 0, lever: 0, phase: 'run' }); }
}

// ---------------------------------------------------------------------------
// Fin de mission : le billet
// ---------------------------------------------------------------------------

function showEnd() {
  const res = run.result;
  const prog = progress();
  const prev = prog[mission.id];
  const isBest = !prev || res.score > prev.score;
  if (isBest) {
    prog[mission.id] = { score: res.score, stars: Math.max(res.stars, prev?.stars ?? 0), at: Date.now() };
    store.set(ghostKey(mission.id), { frames: run.frames, rame: run.serie.id, livree: run.livree });
  } else if (res.stars > prev.stars) prog[mission.id].stars = res.stars;
  store.set(progKey(), prog);

  const pseudo = api.user?.pseudo || store.get('ukipu.pseudo', '') || 'Un conducteur';
  const title = res.stars === 3 ? 'Conduite de maître' : res.stars === 2 ? 'Belle conduite' : 'Arrivé à bon port';
  const gradeLbl = { parfait: 'PARFAIT', super: 'SUPER', bien: 'BIEN', ok: 'OK', loin: 'LOIN', rate: 'RATÉ' };
  const line = (k, v) => `<div class="tk-line"><span>${k}</span><span class="dots"></span><b>${v}</b></div>`;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const vsPrev = prev ? `${res.score >= prev.score ? '+' : ''}${fr0.format(res.score - prev.score)} pts vs record` : 'Premier record';
  $('ticket').innerHTML = `
    <div class="tk-head"><span>Bulletin de conduite · ${lineOf(mission).name}</span></div>
    <h2 class="tk-title">${title}</h2>
    <p class="tk-sub">${mission.title} · ${lineOf(mission).stations[mission.from].name} → ${lineOf(mission).stations[mission.to].name}</p>
    <div class="tk-big"><b>${fr0.format(res.score)}</b><span>points${isBest ? ' · record !' : ''}</span></div>
    <div class="tk-stops">${res.grades.map((g) => `
      <div class="tk-stop"><span>${g.name}</span><span class="tk-grade ${g.grade}">${gradeLbl[g.grade]}${g.d != null ? ` ${fr1.format(Math.abs(g.d))} m` : ''}</span>
      <span class="tk-gap">${g.gap == null ? '' : `${g.gap > 0 ? '+' : ''}${Math.round(g.gap)} s`}</span></div>`).join('')}</div>
    <div class="tk-lines">
      ${line('Précision des arrêts', fr0.format(res.parts.precision))}
      ${line('Ponctualité', fr0.format(res.parts.punct))}
      ${line('Portes', fr0.format(res.parts.doors))}
      ${line('Confort', `${res.comfort} %`)}
      ${line('Meilleur combo', `×${res.bestCombo}`)}
      ${line('Pénalités', fr0.format(Math.round(res.parts.penalty)))}
      ${line('Comparaison', vsPrev)}
    </div>
    <div class="tk-online" id="tk-online">${api.loggedIn ? 'Envoi au classement…' : api.online ? 'Connecte-toi pour entrer au classement.' : 'Hors ligne : partie gardée sur cet appareil.'}</div>
    <div class="tk-feed"><b>${esc(pseudo)}</b> a conduit « ${mission.title} » : ${fr0.format(res.score)} pts.</div>
    <div class="stamp">Composté<span class="stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</span>${today}</div>`;
  $('copy-fallback').hidden = true;
  $('btn-next').disabled = !nextMission();
  $('screen-end').hidden = false;
  if (api.loggedIn) sendRun(mission, runLog, runGear);
}

async function sendRun(m, log, g) {
  const el = $('tk-online');
  try {
    const r = await api.submitRun(m.id, { n: log.n, l: log.l, h: log.h, c: log.c, f: log.f }, g);
    let html;
    if (r.crown && r.dethroned) html = `👑 <b>Tu prends la tête</b> et tu détrônes <b>${esc(r.dethroned)}</b> !`;
    else if (r.crown) html = r.players > 1 ? '👑 <b>Tu gardes la tête</b> du classement.' : '👑 <b>Premier au classement</b> de cette mission.';
    else html = `Classement : <b>${r.rank}<sup>e</sup></b> sur ${r.players}${r.best ? ' · nouveau record perso' : ''}`;
    if (r.score !== run?.result?.score) html += `<small>Score vérifié par le serveur : ${fr0.format(r.score)} pts</small>`;
    if (r.sabotage) {
      const s = r.sabotage;
      html += s.foiled
        ? `<div class="tk-sabo ok">🛡️ Sabotage de <b>${esc(s.by)}</b> déjoué ! +${s.bonus} 🎟</div>`
        : `<div class="tk-sabo">😈 Le sabotage de <b>${esc(s.by)}</b> (${SABOTAGES[s.kind].name.toLowerCase()}) t'a eu. Tout le groupe va le savoir.</div>`;
    }
    if (r.reward) {
      html += `<div class="tk-reward">+${fr0.format(r.reward.tickets)} 🎟${r.reward.boxes.map((k) => ` · 🎁 ${k === 'rare' ? 'colis rare' : 'colis'}`).join('')}</div>`;
      if (r.reward.boxes.length) html += `<button class="pill pill-good tk-open" type="button" id="tk-open" data-kind="${r.reward.boxes[0]}">Ouvrir le colis</button>`;
    }
    el.innerHTML = html;
    el.classList.add(r.crown ? 'crown' : 'ok');
    const ob = $('tk-open');
    if (ob) ob.onclick = () => openBoxFlow(ob.dataset.kind);
    await api.refresh();
    syncProgress();
    refreshProfile();
    if (r.crown) { audio.perfect(); }
  } catch (e) {
    el.textContent = `Envoi impossible : ${e.message}`;
    el.classList.add('err');
  }
}

async function copyResult() {
  const res = run.result;
  const text = `Ukipu · ${mission.title}\n${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)} · ${fr0.format(res.score)} pts · combo ×${res.bestCombo}\n${res.grades.map((g) => ({ parfait: '🟨', super: '🟩', bien: '🟦', ok: '⬜', loin: '⬜', rate: '🟥' })[g.grade]).join('')}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié, à coller dans le groupe');
  } catch {
    const ta = $('copy-fallback');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}

// ---------------------------------------------------------------------------

function boot() {
  world = new World($('world'));
  new ResizeObserver(() => world.resize()).observe($('world-wrap'));
  bindLever();
  bindButtons();
  initHome({ startMission, toast, progress, store, ghostKey, audio, renderAccount, renderFeed });
  showHome('reseau');
  requestAnimationFrame(frame);
  api.init().then(async () => {
    syncProgress();
    await refreshProfile();
    if (!$('screen-start').hidden) showHome();
  });
}

boot();
window.__ukipu = { get run() { return run; }, setLever, ai: () => aiInput(run), door: () => { doorReq = true; }, lights: () => { lightsReq = true; }, horn: () => { hornEdge = true; }, start: (id) => startMission(allMissions().find((m) => m.id === id)) };
