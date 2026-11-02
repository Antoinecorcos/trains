// Ukipu — mode conduite : écrans, pupitre, boucle de jeu.
import { MISSIONS, dailyMission, STATIONS, PLATFORM } from './route.js';
import {
  DT, createRun, step, computeSchedule, aiInput, limitAt, nextLimit, nextStop, nextSignal, clockAt, projectedGap, adhesionAt,
} from './sim.js';
import { World } from './world.js';
import { Audio } from './audio.js';

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
let closeReq = false;
let toastTimer = 0;
const schedCache = {};
const tips = store.get('ukipu.drive.tips', {});

const allMissions = () => [...MISSIONS, dailyMission()];
const progress = () => store.get('ukipu.drive.progress.v2', {});
const totalStars = () => Object.entries(progress()).filter(([id]) => !id.startsWith('daily')).reduce((s, [, p]) => s + (p.stars || 0), 0);
const unlocked = (m) => totalStars() >= m.need || (m.daily && Object.keys(progress()).some((id) => !id.startsWith('daily')));
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

function showBoard() {
  running = false;
  for (const id of ['screen-brief', 'screen-pause', 'screen-end']) $(id).hidden = true;
  const prog = progress();
  $('missions').innerHTML = allMissions().map((m) => {
    const p = prog[m.id];
    const open = unlocked(m);
    const stars = p ? p.stars : 0;
    const kind = m.daily ? 'Défi du jour' : m.stops ? 'Semi-direct' : 'Omnibus';
    const right = !open
      ? `<span class="pill pill-off">${m.daily ? 'Après 1 mission' : `${m.need} ★ requises`}</span>`
      : p ? `<span class="row-stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></span><span class="row-type">${fr0.format(p.score)} pts</span>`
        : `<span class="pill ${m.daily ? 'pill-led' : 'pill-ok'}">${m.daily ? 'Aujourd\'hui' : 'Nouveau'}</span>`;
    return `
      <button class="row${open ? '' : ' row-locked'}${m.daily ? ' row-daily' : ''}" type="button" data-mission="${m.id}" ${open ? '' : 'aria-disabled="true"'}>
        <span class="row-time">${fmtClock(m.clock[0] * 3600 + m.clock[1] * 60, false)}</span>
        <span class="row-mid">
          <span class="row-type">${kind} · ${m.stops ? m.stops.length : m.to - m.from} arrêts</span>
          <span class="row-dest">${m.title}</span>
          <span class="row-via">${STATIONS[m.from].name} › ${STATIONS[m.to].name}</span>
        </span>
        <span class="row-end">${right}</span>
      </button>`;
  }).join('');
  const t = totalStars();
  $('stars-total').textContent = t ? `${t} ★ gagnées sur la ligne U` : 'Commence par « Premiers pas ».';
  $('screen-start').hidden = false;
}

function showBrief(m) {
  const p = progress()[m.id];
  const stops = (m.stops ?? range(m.from + 1, m.to));
  const all = range(m.from + 1, m.to);
  const cond = [];
  const probe = { limits: [], signals: [], leaves: [], animals: [], works: [] };
  const hk = { limit: () => probe.limits.push(1), signal: () => probe.signals.push(1), leaves: () => probe.leaves.push(1), animal: () => probe.animals.push(1), works: () => probe.works.push(1), runner: () => {}, passengers: () => {} };
  m.build(hk);
  if (m.weather === 'rain') cond.push('<span class="pill pill-ok">Pluie · rails glissants</span>');
  if (probe.leaves.length) cond.push('<span class="pill pill-late">Feuilles mortes</span>');
  if (probe.animals.length) cond.push('<span class="pill pill-late">Animal sur la voie</span>');
  if (probe.works.length) cond.push('<span class="pill pill-late">Travaux</span>');
  if (probe.signals.length) cond.push('<span class="pill pill-off">Signal fermé</span>');
  if (probe.limits.length) cond.push('<span class="pill pill-off">Limitations</span>');
  $('brief').innerHTML = `
    <div class="board-head">
      <div>
        <p class="board-sub">${m.daily ? 'Défi du jour' : m.stops ? 'Semi-direct' : 'Omnibus'} · départ ${fmtClock(m.clock[0] * 3600 + m.clock[1] * 60, false)}</p>
        <h2 class="board-title" style="font-size:28px">${m.title}</h2>
      </div>
    </div>
    <div class="brief-body">
      <p class="brief-blurb">${m.blurb}</p>
      <div class="brief-stops">${all.map((k) => `<span class="${stops.includes(k) ? '' : 'pass'}">${STATIONS[k].name}</span>`).join('')}</div>
      <div class="brief-cond">${cond.join('')}</div>
      <div class="brief-best">${p ? `Ton record : ${fr0.format(p.score)} pts · ${'★'.repeat(p.stars)} · fantôme disponible` : 'Pas encore de record : le fantôme du conducteur titulaire roulera avec toi.'}</div>
    </div>
    <div class="brief-actions">
      <button class="big-btn" type="button" id="btn-go">Prendre les commandes</button>
      <button class="ghost-btn" type="button" id="btn-back">Retour aux départs</button>
    </div>`;
  $('screen-start').hidden = true;
  $('screen-brief').hidden = false;
  $('btn-go').onclick = () => startMission(m);
  $('btn-back').onclick = () => { $('screen-brief').hidden = true; showBoard(); };
}

// ---------------------------------------------------------------------------
// Lancement d'une mission
// ---------------------------------------------------------------------------

function startMission(m) {
  audio.start();
  store.set('ukipu.pseudo', $('pseudo').value.trim());
  mission = m;
  if (!schedCache[m.id]) schedCache[m.id] = computeSchedule(m);
  sched = schedCache[m.id];
  run = createRun(m, { sched });
  const pb = progress()[m.id];
  const pbFrames = store.get(`ukipu.drive.ghost.v2.${m.id}`, null);
  ghost = pbFrames ? { frames: pbFrames, label: 'Ton record' } : { frames: sched.frames, label: 'Titulaire' };
  void pb;
  lever = 0;
  acc = 0;
  hornEdge = false;
  closeReq = false;
  world.zoom = 1;
  $('mission-title').textContent = m.title;
  buildStrip();
  for (const id of ['screen-start', 'screen-brief', 'screen-pause', 'screen-end']) $(id).hidden = true;
  $('pops').innerHTML = '';
  setLever(0);
  running = true;
  paused = false;
  if (m.tutorial) tip('start', 'Pousse le manipulateur (à droite) vers le haut pour démarrer.', true);
  else toast(`${m.title} · ${run.m.stops.length} arrêts`);
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
      step(run, { lever, horn: hornEdge, close: closeReq });
      hornEdge = false;
      closeReq = false;
      acc -= DT;
    }
    handleEvents();
    audio.update(run);
  }
  if (run) {
    const gx = ghostAt(run.t);
    const ghosts = gx != null ? [{ x: gx, label: ghost.label }] : [];
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
      case 'doorsOpen':
        audio.chime();
        if (run.m.tutorial && !ev.last) tip('doors', 'Les voyageurs montent. Ferme les portes dès que la barre jaune est pleine.', true);
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
  else if (adh < 1) chips.push('<span class="chip info">Rails mouillés</span>');
  if (r.kvb) alert = { cls: 'red', text: 'KVB · freinage d\'urgence' };
  else if (r.overspeed) alert = { cls: 'red', text: `Survitesse · limite ${lim}` };
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
  if (r.phase === 'doors' && dr && !dr.last) {
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
  if (r.m.tutorial && r.phase === 'run' && r.v < 0.1 && r.lever <= 0 && r.stopI > 0 && r.x < (nextStop(r)?.x ?? 0) - PLATFORM) {
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
  lever = Math.max(-1, Math.min(1, Math.abs(v) < 0.07 ? 0 : v));
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
  $('btn-doors').addEventListener('pointerdown', (e) => { e.preventDefault(); closeReq = true; });

  window.addEventListener('keydown', (e) => {
    if (!run || !running || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'z' || k === 'w') { setLever((lever === 0 ? 0 : lever) + 0.1); e.preventDefault(); }
    else if (k === 'arrowdown' || k === 's') { setLever(lever - 0.1); e.preventDefault(); }
    else if (k === '0' || k === 'n') setLever(0);
    else if (k === ' ' || k === 'h') { if (!e.repeat) hornOn(e); }
    else if (k === 'enter' || k === 'd') closeReq = true;
    else if (k === 'escape' || k === 'p') setPaused(true);
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key.toLowerCase() === 'h') hornOff(); });

  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-restart').addEventListener('click', () => startMission(mission));
  $('btn-quit').addEventListener('click', () => { run = null; showBoard(); });
  $('btn-sound').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    store.set('ukipu.drive.muted', audio.muted);
    $('sound-lbl').textContent = `Son : ${audio.muted ? 'coupé' : 'activé'}`;
  });
  $('sound-lbl').textContent = `Son : ${audio.muted ? 'coupé' : 'activé'}`;
  $('btn-again').addEventListener('click', () => startMission(mission));
  $('btn-board').addEventListener('click', () => { run = null; showBoard(); });
  $('btn-next').addEventListener('click', () => {
    const list = allMissions();
    const i = list.findIndex((m) => m.id === mission.id);
    const nx = list.slice(i + 1).find((m) => unlocked(m));
    if (nx) showBrief(nx); else showBoard();
  });
  $('btn-copy').addEventListener('click', copyResult);
  $('missions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mission]');
    if (!b) return;
    const m = allMissions().find((x) => x.id === b.dataset.mission);
    if (m && unlocked(m)) showBrief(m);
    else toast('Gagne plus d\'étoiles pour débloquer cette mission');
  });
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
    store.set(`ukipu.drive.ghost.v2.${mission.id}`, run.frames);
  } else if (res.stars > prev.stars) prog[mission.id].stars = res.stars;
  store.set('ukipu.drive.progress.v2', prog);

  const pseudo = store.get('ukipu.pseudo', '') || 'Un conducteur';
  const title = res.stars === 3 ? 'Conduite de maître' : res.stars === 2 ? 'Belle conduite' : 'Arrivé à bon port';
  const gradeLbl = { parfait: 'PARFAIT', super: 'SUPER', bien: 'BIEN', ok: 'OK', loin: 'LOIN', rate: 'RATÉ' };
  const line = (k, v) => `<div class="tk-line"><span>${k}</span><span class="dots"></span><b>${v}</b></div>`;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const vsPrev = prev ? `${res.score >= prev.score ? '+' : ''}${fr0.format(res.score - prev.score)} pts vs record` : 'Premier record';
  $('ticket').innerHTML = `
    <div class="tk-head"><span>Bulletin de conduite · Ligne U</span></div>
    <h2 class="tk-title">${title}</h2>
    <p class="tk-sub">${mission.title} · ${STATIONS[mission.from].name} → ${STATIONS[mission.to].name}</p>
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
    <div class="tk-feed">${res.stars === 3 ? '👑 ' : ''}<b>${esc(pseudo)}</b> a conduit « ${mission.title} » : ${fr0.format(res.score)} pts.</div>
    <div class="stamp">Composté<span class="stars">${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}</span>${today}</div>`;
  $('copy-fallback').hidden = true;
  const list = allMissions();
  const i = list.findIndex((m) => m.id === mission.id);
  $('btn-next').disabled = !list.slice(i + 1).some((m) => unlocked(m));
  $('screen-end').hidden = false;
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
  $('pseudo').value = store.get('ukipu.pseudo', '');
  bindLever();
  bindButtons();
  showBoard();
  requestAnimationFrame(frame);
}

boot();
window.__ukipu = { get run() { return run; }, setLever, ai: () => aiInput(run), close: () => { closeReq = true; }, horn: () => { hornEdge = true; }, start: (id) => startMission(allMissions().find((m) => m.id === id)) };
