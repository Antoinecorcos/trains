// Ukipu — boucle de jeu, interface et écrans.
import { LINE_U, INCIDENTS, EVENTS, SCENARIO } from './data.js';
import {
  createGame, warmup, step, apply, SIM_PER_REAL, EVENT_WINDOW, fmtClock, progress, regularity,
  trainDelay, trainStatus, trainActions, incidentOptions, crewState,
} from './sim.js';
import { Renderer, COLORS } from './render.js';

const $ = (id) => document.getElementById(id);
const fr1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const ST = LINE_U.stations;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

// Paramètre de test : ?vitesse=4 accélère la partie.
const SPEED = (() => { try { return Math.min(20, Math.max(1, Number(new URLSearchParams(location.search).get('vitesse')) || 1)); } catch { return 1; } })();

let g;
let renderer;
let running = false;
let paused = false;
let last = performance.now();
let acc = 0;
let card = null; // { kind, id }
let cardSig = '';
let toastTimer = 0;
let tickerText = '';
let drag = null;
const hints = store.get('ukipu.hints', {});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

function newGame() {
  g = createGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  warmup(g);
  acc = 0;
  closeCard();
  $('dilemma').hidden = true;
  buildCrew();
  buildSatBar();
  setTicker('Trafic normal sur l\'ensemble de la ligne U');
  renderer.floaters = [];
}

function startService() {
  store.set('ukipu.pseudo', $('pseudo').value.trim());
  $('screen-start').hidden = true;
  $('screen-end').hidden = true;
  running = true;
  paused = false;
  hint('start', 'Touchez les incidents ⚠ et les trains pour réguler la ligne.');
}

function boot() {
  renderer = new Renderer($('tco'));
  new ResizeObserver(() => renderer.resize()).observe($('stage'));
  $('pseudo').value = store.get('ukipu.pseudo', '');
  showBest();
  newGame();
  flapAll();
  requestAnimationFrame(frame);

  $('btn-start').addEventListener('click', startService);
  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-quit').addEventListener('click', () => {
    $('screen-pause').hidden = true;
    running = false;
    newGame();
    showBest();
    $('screen-start').hidden = false;
    flapAll();
  });
  $('btn-again').addEventListener('click', () => { newGame(); startService(); });
  $('btn-copy').addEventListener('click', copyResult);
  $('btn-reserve').addEventListener('click', () => openCard({ kind: 'reserve' }));
  $('btn-annonce').addEventListener('click', () => {
    if (apply(g, { type: 'annonce' }).ok) toast('Annonce diffusée · la grogne ralentit 5 min', 'good');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !g.over) setPaused(true); });

  const cv = $('tco');
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', () => { drag = null; });

  bindPress($('card'), onCardAction);
  bindPress($('dilemma'), onCardAction);
  bindPress($('crew'), (el) => onCrewTap(el.dataset.crew));
}

function bindPress(root, fn) {
  root.addEventListener('pointerup', (e) => {
    const el = e.target.closest('[data-act], [data-crew]');
    if (el && !el.disabled && root.contains(el)) fn(el);
  });
  root.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // clavier uniquement
    const el = e.target.closest('[data-act], [data-crew]');
    if (el && !el.disabled) fn(el);
  });
}

function setPaused(v) {
  if (!running || g.over) return;
  paused = v;
  $('screen-pause').hidden = !v;
}

function hint(key, text) {
  if (hints[key]) return;
  hints[key] = true;
  store.set('ukipu.hints', hints);
  toast(text);
}

// ---------------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------------

function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  if (running && !paused && !g.over) {
    acc += dt * SIM_PER_REAL * SPEED;
    let n = Math.floor(acc);
    acc -= n;
    while (n-- > 0 && !g.over) step(g);
  }
  handleEvents();
  renderer.selected = card && (card.kind === 'train' || card.kind === 'incident') ? card : null;
  renderer.draw(g, ts);
  updateHud();
  refreshCard();
  updateDilemmaTimer();
  requestAnimationFrame(frame);
}

function handleEvents() {
  for (const ev of g.events) {
    switch (ev.type) {
      case 'feed':
        if (ev.kind === 'voyageur' && ev.k != null) renderer.float(ev.k, `« ${ev.text} »`, COLORS.white);
        else if (ev.kind !== 'voyageur') setTicker(ev.text);
        break;
      case 'incident':
        if (ev.inc.type === 'derangement') {
          toast('Poste de Versailles en panne : touchez GO sur chaque train, un à la fois', 'bad');
        } else hint('incident', 'Incident ! Touchez le carré orange pour choisir la réponse.');
        break;
      case 'resolved':
        if (card && card.kind === 'incident' && card.id === ev.inc.id) closeCard();
        if (ev.inc.type === 'derangement') toast('Poste de Versailles rétabli', 'good');
        break;
      case 'ontime':
        renderer.float(ev.k, 'À l\'heure ✓', COLORS.good);
        bumpStreak();
        if (ev.streak === 3) hint('streak', 'Série de 3 ! Enchaînez les trains à l\'heure pour des bonus.');
        break;
      case 'late':
        renderer.float(ev.k, `Retard +${ev.mins}`, COLORS.late);
        break;
      case 'suppressed':
        renderer.float(ev.k, 'Supprimé', COLORS.cancel);
        break;
      case 'turned':
        renderer.float(ev.k, 'Demi-tour', COLORS.ok);
        break;
      case 'streakLost':
        toast(`Série de ${ev.n} interrompue`, 'bad');
        break;
      case 'dilemma':
        showDilemma(ev.d);
        break;
      case 'dilemmaClosed':
        $('dilemma').hidden = true;
        if (ev.timeout && ev.d.choices.length > 1) toast(`Trop tard : « ${ev.d.choices[ev.d.choices.length - 1].label} »`);
        break;
      case 'win':
        toast(ev.text, 'good');
        break;
      case 'lose':
        toast(ev.text, 'bad');
        break;
      case 'over':
        running = false;
        closeCard();
        $('dilemma').hidden = true;
        setTimeout(showEnd, 900);
        break;
    }
  }
  g.events.length = 0;
}

// ---------------------------------------------------------------------------
// Bandeau d'état, LED, toasts
// ---------------------------------------------------------------------------

function setTicker(text) {
  if (text === tickerText) return;
  tickerText = text;
  const el = $('ticker-text');
  el.classList.remove('scroll');
  el.style.animationDuration = '';
  el.textContent = text;
  requestAnimationFrame(() => {
    const win = el.parentElement.clientWidth;
    if (el.scrollWidth > win) {
      el.classList.add('scroll');
      el.style.animationDuration = `${Math.max(8, (el.scrollWidth + win) / 70)}s`;
    }
  });
}

function toast(text, tone = '') {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast ${tone}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

function buildSatBar() {
  $('sat-bar').innerHTML = '<i></i>'.repeat(10);
}

function bumpStreak() {
  const el = $('streak');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function updateHud() {
  $('clock').textContent = fmtClock(g.t);
  const reg = regularity(g);
  const regEl = $('reg');
  regEl.textContent = `${fr1.format(reg)} %`;
  regEl.className = `v${reg < 85 ? (reg < 70 ? ' crit' : ' warn') : ''}`;
  const lit = Math.ceil(Math.max(0, g.sat) / 10);
  const col = g.sat < 30 ? COLORS.cancel : g.sat < 60 ? COLORS.late : COLORS.good;
  $('sat-bar').querySelectorAll('i').forEach((el, i) => { el.style.background = i < lit ? col : ''; });
  $('streak').textContent = g.streak ? `×${g.streak}` : '0';
  $('progress-fill').style.width = `${progress(g) * 100}%`;

  const left = g.reserves.filter((r) => !r.used).length;
  $('reserve-count').textContent = String(left);
  $('btn-reserve').disabled = left === 0;
  const an = $('annonce-state');
  if (g.t < g.annonceUntil) an.textContent = '●';
  else if (g.t < g.annonceReadyAt) an.textContent = `${Math.ceil((g.annonceReadyAt - g.t) / 60)}'`;
  else an.textContent = '';
  $('btn-annonce').disabled = g.t < g.annonceReadyAt;

  for (const c of g.crew) {
    const el = document.querySelector(`[data-crew="${c.id}"]`);
    if (!el) continue;
    const s = crewState(g, c);
    el.classList.toggle('mission', s === 'mission');
    el.classList.toggle('cooldown', s === 'cooldown');
    const ring = el.querySelector('.agent-ring');
    const st = el.querySelector('.agent-state');
    if (s === 'mission') {
      const inc = g.incidents.find((i) => i.id === c.incidentId);
      ring.style.width = inc ? `${(1 - inc.left / inc.total) * 100}%` : '0';
      st.textContent = 'Sur place';
    } else if (s === 'cooldown') {
      ring.style.width = `${(1 - (c.readyAt - g.t) / 420) * 100}%`;
      st.textContent = 'Retour';
    } else {
      ring.style.width = '0';
      st.textContent = c.role;
    }
  }
}

function buildCrew() {
  $('crew').innerHTML = g.crew.map((c) => `
    <button class="agent" type="button" data-crew="${c.id}" aria-label="${c.name}, ${c.role}">
      <span class="avatar">${c.initials}</span>
      <span class="agent-name">${c.name}</span>
      <span class="agent-state">${c.role}</span>
      <span class="agent-ring"></span>
    </button>`).join('');
}

function onCrewTap(id) {
  if (!running || g.over) return;
  const c = g.crew.find((x) => x.id === id);
  const s = crewState(g, c);
  if (s === 'mission') toast(`${c.name} est sur un incident`);
  else if (s === 'cooldown') toast(`${c.name} revient au poste`);
  else toast(`${c.name} est disponible · touchez un incident`);
}

// ---------------------------------------------------------------------------
// Gestes sur le schéma
// ---------------------------------------------------------------------------

function localXY(e) {
  const r = $('tco').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onPointerDown(e) {
  if (!running || g.over || paused) return;
  const p = localXY(e);
  drag = { x: p.x, y: p.y, hit: renderer.hit(p.x, p.y), done: false };
}

function onPointerMove(e) {
  if (!drag || drag.done || !drag.hit || drag.hit.kind !== 'train') return;
  const p = localXY(e);
  const dx = p.x - drag.x;
  const dy = p.y - drag.y;
  const along = renderer.vertical ? dy * drag.hit.dir : dx * drag.hit.dir;
  if (Math.abs(along) < 44) return;
  drag.done = true;
  const tr = g.trains.find((t) => t.id === drag.hit.id);
  if (!tr) return;
  const acts = trainActions(g, tr);
  const a = acts.find((x) => x.type === (along > 0 ? 'omit' : 'partial'));
  if (a && a.enabled) doTrainAction(tr, a);
  else toast(along > 0 ? 'Direct impossible ici' : 'Pas de demi-tour possible devant ce train');
}

function onPointerUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.done || !running || g.over || paused) return;
  const p = localXY(e);
  if (Math.hypot(p.x - d.x, p.y - d.y) > 20) return;
  const h = d.hit;
  if (!h) { closeCard(); return; }
  if (h.kind === 'auth') {
    const res = apply(g, { type: 'authorize', trainId: h.id });
    if (res.conflict) toast('Conflit d\'itinéraire ! Arrêt d\'urgence', 'bad');
    else if (res.ok) toast('Itinéraire tracé · attendez qu\'il se libère', 'good');
    return;
  }
  if (h.kind === 'incident') openCard({ kind: 'incident', id: h.id });
  else {
    openCard({ kind: 'train', id: h.id });
    hint('drag', 'Astuce : glissez un train vers l\'avant pour le passer en direct, vers l\'arrière pour un demi-tour.');
  }
}

// ---------------------------------------------------------------------------
// Carte contextuelle
// ---------------------------------------------------------------------------

function openCard(c) {
  card = c;
  cardSig = '';
  refreshCard();
}

function closeCard() {
  card = null;
  cardSig = '';
  $('card').hidden = true;
}

function statusPill(g, tr) {
  const d = trainDelay(g, tr);
  if (tr.hlp) return '<span class="pill pill-cancel">Supprimé</span>';
  if (tr.lock) return '<span class="pill pill-cancel">Retenu</span>';
  if (tr.trip.partial) return '<span class="pill pill-late">Limité</span>';
  if (d >= 120) return `<span class="pill pill-late">Retardé +${Math.floor(d / 60)}</span>`;
  return '<span class="pill pill-ok">À l\'heure</span>';
}

function carsHtml(tr) {
  const lf = tr.load / tr.capacity;
  const pattern = [0.8, 0.95, 1.1, 1.2, 1.15, 1.0, 0.9, 0.85];
  return `<span class="cars">${pattern.map((m) => {
    const v = lf * m;
    return `<i class="${v > 0.9 ? 'full' : v > 0.6 ? 'mid' : ''}"></i>`;
  }).join('')}</span>`;
}

function refreshCard() {
  if (!card) return;
  const el = $('card');
  let sig;
  let html;

  if (card.kind === 'train') {
    const tr = g.trains.find((t) => t.id === card.id);
    if (!tr || !tr.trip || tr.state === 'layover' || tr.state === 'depot') { closeCard(); return; }
    const d = trainDelay(g, tr);
    const acts = trainActions(g, tr);
    sig = `t${tr.id}|${Math.floor(d / 60)}|${Math.round(tr.load / 80)}|${trainStatus(g, tr)}|${acts.map((a) => `${a.type}${a.enabled}${a.on}`).join()}|${tr.trip.dest}|${tr.vip}`;
    if (sig === cardSig) return;
    const dest = tr.trip.dest;
    html = `
      <div class="cp-row">
        <span class="cp-time">${fmtClock(tr.trip.arr[dest] ?? g.t)}</span>
        <span class="cp-mid">
          <span class="cp-type">U · ${tr.trip.num} · ${tr.serie}${tr.vip ? ' · ★ journaliste' : ''}</span>
          <span class="cp-dest">${ST[dest].short}</span>
        </span>
        <span>${statusPill(g, tr)}</span>
      </div>
      <div class="cp-meta">${carsHtml(tr)}<small>${trainStatus(g, tr)}</small>
        <button class="cp-close" type="button" data-act="close" aria-label="Fermer" style="margin-left:auto">✕</button></div>
      <div class="tools">
        ${acts.map((a, i) => `
          <button class="tool${a.on ? ' on' : ''}${a.type === 'suppress' ? ' danger' : ''}" type="button" data-act="train" data-i="${i}" ${a.enabled ? '' : 'disabled'}>
            <span class="tool-ico">${a.icon}</span>
            <span class="tool-lbl">${a.label}</span>
            ${a.where ? `<span class="tool-sub">${a.where}</span>` : ''}
          </button>`).join('')}
      </div>`;
    el.dataset.acts = JSON.stringify(acts);
  } else if (card.kind === 'incident') {
    const inc = g.incidents.find((i) => i.id === card.id && !i.resolved);
    if (!inc) { closeCard(); return; }
    const def = INCIDENTS[inc.type];
    const opts = incidentOptions(g, inc);
    sig = `i${inc.id}|${inc.crewId}|${inc.alt}|${opts.map((o) => `${o.crewId}${o.ready}`).join()}|${Math.floor(inc.left / 60)}`;
    if (sig === cardSig) return;
    const agent = inc.crewId ? g.crew.find((c) => c.id === inc.crewId) : null;
    let body;
    if (agent) body = `<p class="note">${agent.name} est sur place · fin vers ${fmtClock(g.t + inc.left)}</p>`;
    else if (inc.alt) body = `<p class="note">${def.alt.label} · fin vers ${fmtClock(g.t + inc.left)}</p>`;
    else if (!opts.length) body = '<p class="note">Incident extérieur : retenez ou limitez vos trains.</p>';
    else {
      body = `<div class="answers">${opts.map((o, i) => (o.kind === 'crew' ? `
        <button class="answer${o.best && o.ready ? ' best' : ''}" type="button" data-act="opt" data-i="${i}" ${o.ready ? '' : 'disabled'}>
          <span class="avatar">${o.crew.initials}</span>
          <span class="answer-txt"><b>${o.crew.name}${o.best ? '<span class="answer-tag">Spécialiste</span>' : ''}</b><span>${o.ready ? o.crew.role : 'Indisponible'}</span></span>
          <span class="answer-time">${Math.round(o.eta / 60)}'</span>
        </button>` : `
        <button class="answer" type="button" data-act="opt" data-i="${i}">
          <span class="avatar alt">${o.icon}</span>
          <span class="answer-txt"><b>${o.label}</b><span>${o.hint}</span></span>
          <span></span>
        </button>`)).join('')}</div>`;
    }
    html = `
      <div class="cp-row">
        <span class="cp-time">${fmtClock(g.t + inc.left)}</span>
        <span class="cp-mid">
          <span class="cp-type">${inc.where}</span>
          <span class="cp-dest">${def.label}</span>
        </span>
        <button class="cp-close" type="button" data-act="close" aria-label="Fermer">✕</button>
      </div>${body}`;
    el.dataset.opts = JSON.stringify(opts.map((o) => ({ kind: o.kind, crewId: o.crewId })));
  } else if (card.kind === 'reserve') {
    sig = `r|${g.reserves.map((r) => r.used).join()}`;
    if (sig === cardSig) return;
    html = `
      <div class="cp-row">
        <span class="cp-time">＋</span>
        <span class="cp-mid"><span class="cp-type">Une rame de plus jusqu'à la fin</span><span class="cp-dest">Rames de réserve</span></span>
        <button class="cp-close" type="button" data-act="close" aria-label="Fermer">✕</button>
      </div>
      <div class="answers">${g.reserves.map((r) => `
        <button class="answer" type="button" data-act="reserve" data-id="${r.id}" ${r.used ? 'disabled' : ''}>
          <span class="avatar">Z2N</span>
          <span class="answer-txt"><b>${r.label}</b><span>${r.used ? 'Déjà en ligne' : r.at === 0 ? 'Prend le prochain départ vers La Verrière' : 'Part vers La Défense, hors grille'}</span></span>
          <span></span>
        </button>`).join('')}</div>`;
  }
  cardSig = sig;
  el.innerHTML = html;
  el.hidden = false;
}

function doTrainAction(tr, a) {
  const res = apply(g, { type: a.type, trainId: tr.id, station: a.station });
  if (!res.ok) return;
  const msg = {
    hold: res.lock ? 'Train retenu · touchez Libérer pour le relâcher' : 'Train libéré',
    omit: 'Direct jusqu\'au terminus',
    partial: `Demi-tour à ${a.where}`,
    suppress: 'Train supprimé',
  }[a.type];
  toast(msg, a.type === 'suppress' ? 'bad' : '');
  if (a.type === 'suppress' || a.type === 'partial') closeCard();
  cardSig = '';
}

function onCardAction(btn) {
  if (!running || g.over) return;
  const act = btn.dataset.act;
  if (act === 'close') { closeCard(); return; }
  if (act === 'choose') {
    apply(g, { type: 'choose', choiceId: btn.dataset.id });
    $('dilemma').hidden = true;
    return;
  }
  if (act === 'reserve') {
    if (apply(g, { type: 'reserve', reserveId: btn.dataset.id }).ok) { toast('Rame de réserve en ligne', 'good'); closeCard(); }
    return;
  }
  if (act === 'opt') {
    const opts = JSON.parse($('card').dataset.opts || '[]');
    const o = opts[Number(btn.dataset.i)];
    if (!o) return;
    const res = o.kind === 'crew'
      ? apply(g, { type: 'dispatch', incidentId: card.id, crewId: o.crewId })
      : apply(g, { type: 'alt', incidentId: card.id });
    if (res.ok) {
      toast(o.kind === 'crew' ? (res.spec ? 'Le spécialiste est en route' : 'Agent en route') : 'C\'est parti', res.spec ? 'good' : '');
      closeCard();
    }
    return;
  }
  if (act === 'train') {
    const tr = g.trains.find((t) => t.id === card.id);
    const acts = JSON.parse($('card').dataset.acts || '[]');
    const a = acts[Number(btn.dataset.i)];
    if (tr && a) doTrainAction(tr, a);
  }
}

// ---------------------------------------------------------------------------
// Dilemmes
// ---------------------------------------------------------------------------

const TONE = { good: ['pill-good', 'Bonus'], risk: ['pill-late', 'Pari'], safe: ['pill-off', 'Prudent'] };

function showDilemma(d) {
  const def = EVENTS[d.type];
  $('dilemma').innerHTML = `
    <div class="dl-head"><span class="dl-ico">${def.icon}</span><span class="dl-from">Message · ${def.from}</span></div>
    <h3 class="dl-title">${d.title}</h3>
    <div class="dl-timer"><i id="dl-bar"></i></div>
    <div class="dl-choices">${d.choices.map((c) => `
      <button class="dl-choice" type="button" data-act="choose" data-id="${c.id}">
        <span><b>${c.label}</b>${c.hint ? `<span>${c.hint}</span>` : ''}</span>
        <span class="pill ${TONE[c.tone][0]}">${TONE[c.tone][1]}</span>
      </button>`).join('')}</div>`;
  $('dilemma').hidden = false;
}

function updateDilemmaTimer() {
  const bar = $('dl-bar');
  if (!bar || !g.dilemma || $('dilemma').hidden) return;
  const left = Math.max(0, g.dilemma.deadline - g.t) / EVENT_WINDOW;
  bar.style.transform = `scaleX(${left})`;
}

// ---------------------------------------------------------------------------
// Fin de service : le billet
// ---------------------------------------------------------------------------

function showEnd() {
  const r = g.result;
  const pseudo = store.get('ukipu.pseudo', '') || 'Un régulateur';
  const key = `ukipu.best.${SCENARIO.id}`;
  const best = store.get(key, null);
  const isBest = !r.failed && (!best || r.regularity > best.regularity);
  if (isBest) store.set(key, { regularity: r.regularity, stars: r.stars, at: Date.now() });

  const title = r.failed ? 'Ligne perdue' : r.stars === 3 ? 'Ligne tenue de main de maître' : r.stars === 2 ? 'Service solide' : 'Service assuré, de justesse';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const line = (k, v) => `<div class="tk-line"><span>${k}</span><span class="dots"></span><b>${v}</b></div>`;
  let feed;
  if (r.failed) feed = `⚠️ <b>${esc(pseudo)}</b> a perdu le contrôle de la ligne U à ${fmtClock(r.endedAt)}.`;
  else if (r.stars === 3) feed = `👑 <b>${esc(pseudo)}</b> a tenu la ligne U à ${fr1.format(r.regularity)} %.`;
  else feed = `<b>${esc(pseudo)}</b> a bouclé son service sur la U à ${fr1.format(r.regularity)} %.`;

  $('ticket').innerHTML = `
    <div class="tk-head"><span>Billet de service · Ligne U</span><span class="pict">U</span></div>
    <h2 class="tk-title">${title}</h2>
    <p class="tk-sub">${SCENARIO.title} · ${r.failed ? `interrompu à ${fmtClock(r.endedAt)}` : '06:30 → 09:30'}</p>
    <div class="tk-big"><b>${fr1.format(r.regularity)} %</b><span>régularité${isBest ? ' · record !' : ''}</span></div>
    <div class="tk-lines">
      ${line('Meilleure série', `×${r.bestStreak}`)}
      ${line('Satisfaction', `${r.satisfaction} %`)}
      ${line('Voyageurs', fr0.format(r.transported))}
      ${line('Paris réussis', `${r.dilemmasWon}`)}
      ${line('Trains supprimés', `${r.suppressed}`)}
    </div>
    <div class="tk-feed">${feed}<small>Dans le fil de tes potes · la vraie U tourne autour de 90 à 93 %.</small></div>
    <div class="stamp${r.failed ? ' fail' : ''}">${r.failed ? 'Service<br>interrompu' : `Composté<span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span>`}<br>${today}</div>`;
  $('copy-fallback').hidden = true;
  $('screen-end').hidden = false;
  showBest();
}

function resultText() {
  const r = g.result;
  const stars = r.failed ? 'Service interrompu' : '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  return `Ukipu · ${SCENARIO.title}\n${stars} · Régularité ${fr1.format(r.regularity)} % · Série ×${r.bestStreak}\nService n° ${g.seed}`;
}

async function copyResult() {
  const text = resultText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié, à coller dans le groupe', 'good');
  } catch {
    const ta = $('copy-fallback');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
  }
}

function showBest() {
  const best = store.get(`ukipu.best.${SCENARIO.id}`, null);
  $('best').textContent = best ? `Ton record : ${fr1.format(best.regularity)} % ${'★'.repeat(best.stars)}` : 'Pas encore de record. À toi de jouer.';
}

// Effet de palettes : les textes défilent avant de se fixer, comme un vieux tableau de départs.
function flapAll() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  document.querySelectorAll('[data-flap]').forEach((el, idx) => {
    const target = el.dataset.flapText ?? el.textContent;
    el.dataset.flapText = target;
    let frameN = 0;
    const total = 14 + idx * 4;
    const tick = () => {
      frameN++;
      el.textContent = [...target].map((ch, i) => {
        if (ch === ' ' || ch === ':' || frameN > total - (target.length - i) * 0.5) return ch;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      if (frameN < total + target.length) setTimeout(tick, 45);
      else el.textContent = target;
    };
    tick();
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

boot();
window.__ukipu = { get game() { return g; }, get renderer() { return renderer; } };
