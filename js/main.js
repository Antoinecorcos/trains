// Ukipu V0 — boucle de jeu, interface et écrans.
import { LINE_U, INCIDENTS, SCENARIO } from './data.js';
import {
  createGame, warmup, step, apply, SIM_PER_REAL, fmtClock, progress, regularity,
  trainDelay, trainStatus, trainActions, crewEta, crewState,
} from './sim.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);
const fr1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fr0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const ST = LINE_U.stations;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

let g;
let renderer;
let running = false;
let paused = false;
let last = performance.now();
let acc = 0;
let sheet = null; // { kind, id }
let sheetSig = '';
let selectedCrew = null;
let hintedIncident = store.get('ukipu.hint.incident', false);
let toastTimer = 0;
// Paramètre de test : ?vitesse=4 accélère la partie.
const SPEED = (() => { try { return Math.min(20, Math.max(1, Number(new URLSearchParams(location.search).get('vitesse')) || 1)); } catch { return 1; } })();

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

function newGame() {
  g = createGame((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  warmup(g);
  acc = 0;
  closeSheet();
  selectedCrew = null;
  buildCrew();
  setBanner('Prise de service. Trafic normal sur l\'ensemble de la ligne U.', false);
  $('chatter').textContent = '';
}

function startService() {
  const p = $('pseudo').value.trim();
  store.set('ukipu.pseudo', p);
  $('screen-start').hidden = true;
  $('screen-end').hidden = true;
  running = true;
  paused = false;
}

function boot() {
  renderer = new Renderer($('tco'));
  new ResizeObserver(() => renderer.resize()).observe($('stage'));
  $('pseudo').value = store.get('ukipu.pseudo', '');
  showBest();
  newGame();
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
  });
  $('btn-again').addEventListener('click', () => { newGame(); startService(); });
  $('btn-copy').addEventListener('click', copyResult);
  $('btn-reserve').addEventListener('click', () => openSheet({ kind: 'reserve' }));
  $('btn-annonce').addEventListener('click', () => {
    if (apply(g, { type: 'annonce' }).ok) toast('Information voyageurs diffusée : la grogne monte deux fois moins vite pendant 5 min.');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !g.over) setPaused(true); });

  const cv = $('tco');
  cv.addEventListener('pointerup', (e) => {
    const r = cv.getBoundingClientRect();
    onStageTap(e.clientX - r.left, e.clientY - r.top);
  });

  bindPress($('sheet'), onSheetAction);
  bindPress($('crew'), (el) => onCrewTap(el.dataset.crew));
}

// Les boutons reconstruits pendant la partie réagissent au relâchement du doigt.
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
  renderer.selected = sheet && (sheet.kind === 'train' || sheet.kind === 'incident') ? sheet : null;
  renderer.draw(g, ts);
  updateHud();
  refreshSheet();
  requestAnimationFrame(frame);
}

function handleEvents() {
  for (const ev of g.events) {
    if (ev.type === 'feed') {
      if (ev.kind === 'voyageur') $('chatter').textContent = ev.text;
      else setBanner(ev.text, ev.kind === 'annonce');
    } else if (ev.type === 'incident') {
      if (ev.inc.type === 'derangement') openSheet({ kind: 'node' });
      else if (!hintedIncident && running) {
        toast('Nouvel incident : touchez le losange jaune pour envoyer un agent.');
        hintedIncident = true;
        store.set('ukipu.hint.incident', true);
      }
    } else if (ev.type === 'resolved') {
      if (sheet && sheet.kind === 'incident' && sheet.id === ev.inc.id) closeSheet();
      if (sheet && sheet.kind === 'node' && ev.inc.type === 'derangement') closeSheet();
    } else if (ev.type === 'over') {
      running = false;
      closeSheet();
      setTimeout(showEnd, 700);
    }
  }
  g.events.length = 0;
}

// ---------------------------------------------------------------------------
// Bandeau, toasts
// ---------------------------------------------------------------------------

function setBanner(text, flash) {
  $('banner-text').textContent = text;
  const b = $('banner');
  if (flash) {
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------------------------------------------------------------------------
// HUD et équipe
// ---------------------------------------------------------------------------

function updateHud() {
  $('clock').textContent = fmtClock(g.t);
  const reg = regularity(g);
  const regEl = $('reg');
  regEl.textContent = `${fr1.format(reg)} %`;
  regEl.className = `value mono${reg < 85 ? (reg < 70 ? ' crit' : ' warn') : ''}`;
  const sf = $('sat-fill');
  sf.style.width = `${Math.max(0, g.sat)}%`;
  sf.style.background = g.sat < 30 ? 'var(--crit)' : g.sat < 60 ? 'var(--warn)' : 'var(--ok)';
  $('progress-fill').style.width = `${progress(g) * 100}%`;

  const left = g.reserves.filter((r) => !r.used).length;
  $('reserve-count').textContent = String(left);
  $('btn-reserve').disabled = left === 0;
  const an = $('annonce-state');
  if (g.t < g.annonceUntil) an.textContent = 'En cours';
  else if (g.t < g.annonceReadyAt) an.textContent = `${Math.ceil((g.annonceReadyAt - g.t) / 60)} min`;
  else an.textContent = 'Prête';
  $('btn-annonce').disabled = g.t < g.annonceReadyAt;

  for (const c of g.crew) {
    const el = document.querySelector(`[data-crew="${c.id}"]`);
    if (!el) continue;
    const s = crewState(g, c);
    el.classList.toggle('mission', s === 'mission');
    el.classList.toggle('cooldown', s === 'cooldown');
    el.classList.toggle('selected', selectedCrew === c.id);
    const bar = el.querySelector('.card-bar');
    const role = el.querySelector('.card-role');
    if (s === 'mission') {
      const inc = g.incidents.find((i) => i.id === c.incidentId);
      bar.style.width = inc ? `${(1 - inc.left / inc.total) * 100}%` : '0';
      role.textContent = 'En intervention';
    } else if (s === 'cooldown') {
      bar.style.width = `${(1 - (c.readyAt - g.t) / 480) * 100}%`;
      role.textContent = 'Retour au poste';
    } else {
      bar.style.width = '0';
      role.textContent = c.role;
    }
  }
}

function buildCrew() {
  $('crew').innerHTML = g.crew.map((c) => `
    <button class="card" type="button" data-crew="${c.id}" aria-label="${c.name}, ${c.role}">
      <span class="card-glyph">${c.glyph}</span>
      <span class="card-name">${c.name}</span>
      <span class="card-role">${c.role}</span>
      <span class="card-bar"></span>
    </button>`).join('');
}

function onCrewTap(id) {
  if (!running || g.over) return;
  const c = g.crew.find((x) => x.id === id);
  if (!c) return;
  if (sheet && sheet.kind === 'incident') {
    dispatch(sheet.id, id);
    return;
  }
  const s = crewState(g, c);
  if (s !== 'ready') {
    toast(s === 'mission' ? `${c.name} est déjà en intervention.` : `${c.name} revient au poste.`);
    return;
  }
  selectedCrew = selectedCrew === id ? null : id;
  if (selectedCrew) toast(`${c.name} (${c.role.toLowerCase()}) : touchez un incident pour l'y envoyer.`);
}

function dispatch(incidentId, crewId) {
  const c = g.crew.find((x) => x.id === crewId);
  const inc = g.incidents.find((i) => i.id === incidentId);
  const res = apply(g, { type: 'dispatch', incidentId, crewId });
  if (res.ok) {
    const spec = INCIDENTS[inc.type].spec === crewId;
    toast(`${c.name} part sur place${spec ? ' — c\'est sa spécialité' : ''}. Fin estimée ${fmtClock(g.t + inc.left)}.`);
    closeSheet();
  } else if (inc && !INCIDENTS[inc.type].spec) {
    toast('Incident extérieur : aucun agent ne peut intervenir.');
  } else if (inc && inc.crewId) {
    toast('Un agent est déjà sur place.');
  } else if (c) {
    toast(`${c.name} n'est pas disponible.`);
  }
  selectedCrew = null;
}

// ---------------------------------------------------------------------------
// Sélection sur le TCO
// ---------------------------------------------------------------------------

function onStageTap(x, y) {
  if (!running || g.over || paused) return;
  const h = renderer.hit(x, y);
  if (!h) {
    selectedCrew = null;
    if (sheet && sheet.kind !== 'node') closeSheet();
    return;
  }
  if (h.kind === 'incident') {
    if (selectedCrew) {
      dispatch(h.id, selectedCrew);
      return;
    }
    openSheet({ kind: 'incident', id: h.id });
  } else {
    selectedCrew = null;
    openSheet({ kind: 'train', id: h.id });
  }
}

function openSheet(s) {
  sheet = s;
  sheetSig = '';
  refreshSheet();
}

function closeSheet() {
  sheet = null;
  sheetSig = '';
  $('sheet').hidden = true;
}

function fxHtml([reg, sat]) {
  const arrows = (n, up) => (up ? '▲' : '▼').repeat(Math.abs(n));
  return `<span class="act-fx">${reg ? `<span class="fx-up">Rég ${arrows(reg, true)}</span>` : ''}${sat ? `<span class="fx-down">Satis ${arrows(sat, false)}</span>` : ''}</span>`;
}

function refreshSheet() {
  if (!sheet) return;
  const el = $('sheet');
  let sig;
  let html;

  if (sheet.kind === 'train') {
    const tr = g.trains.find((t) => t.id === sheet.id);
    if (!tr || !tr.trip || tr.state === 'layover' || tr.state === 'depot') { closeSheet(); return; }
    const d = trainDelay(g, tr);
    const acts = trainActions(g, tr);
    const next = tr.state === 'run' ? tr.at + tr.dir : tr.at;
    const status = trainStatus(g, tr);
    sig = `t${tr.id}|${Math.floor(d / 60)}|${Math.round(tr.load / 50)}|${next}|${status}|${acts.map((a) => a.type + (a.station ?? '')).join(',')}|${tr.trip.dest}`;
    if (sig === sheetSig) return;
    html = `
      <div class="sheet-head">
        <div>
          <p class="sheet-title">Train ${tr.trip.num} → ${ST[tr.trip.dest].short}</p>
          <p class="sheet-sub">${tr.serie} · ${status}${tr.trip.partial ? ' · terminus partiel' : ''}${tr.skip && !tr.hlp ? ' · direct' : ''}${tr.degraded ? ' · marche dégradée' : ''}</p>
        </div>
        <button class="sheet-close" type="button" data-act="close" aria-label="Fermer">✕</button>
      </div>
      <dl class="facts">
        <div class="fact"><dt>Retard</dt><dd style="color:${d >= 300 ? 'var(--crit)' : d >= 120 ? 'var(--warn)' : 'var(--fg)'}">+${Math.floor(d / 60)} min</dd></div>
        <div class="fact"><dt>Charge</dt><dd>${fr0.format(Math.min(100, (tr.load / 1100) * 100))} %</dd></div>
        <div class="fact"><dt>${tr.state === 'run' ? 'Prochaine' : 'En gare'}</dt><dd style="font-family:var(--f-display);font-size:14px">${ST[next].short}</dd></div>
      </dl>
      <div class="actions">
        ${acts.map((a, i) => `
          <button class="act" type="button" data-act="train" data-i="${i}">
            <span class="act-label">${a.label}</span>
            <span class="act-hint">${a.hint}</span>
            ${fxHtml(a.effect)}
          </button>`).join('') || '<p class="empty">Aucune action possible sur ce train.</p>'}
      </div>`;
    el.dataset.acts = JSON.stringify(acts);
  } else if (sheet.kind === 'incident') {
    const inc = g.incidents.find((i) => i.id === sheet.id && !i.resolved);
    if (!inc) { closeSheet(); return; }
    const def = INCIDENTS[inc.type];
    const states = g.crew.map((c) => crewState(g, c)).join(',');
    sig = `i${inc.id}|${inc.crewId}|${states}|${Math.floor(inc.left / 60)}`;
    if (sig === sheetSig) return;
    const agent = inc.crewId ? g.crew.find((c) => c.id === inc.crewId) : null;
    const crewBtns = def.spec ? g.crew.map((c) => {
      const s = crewState(g, c);
      const eta = crewEta(g, inc, c.id);
      const spec = def.spec === c.id;
      const dis = s !== 'ready' || !!inc.crewId;
      const why = s === 'mission' ? 'En intervention ailleurs' : s === 'cooldown' ? 'Retour au poste' : `Sur place en ~${Math.round(eta / 60)} min`;
      return `
        <button class="act crew-act${spec && !dis ? ' best' : ''}" type="button" data-act="dispatch" data-crew-id="${c.id}" ${dis ? 'disabled' : ''}>
          <span class="act-label">${c.name} · ${c.role}${spec ? ' <span class="tag">Spécialiste</span>' : ''}</span>
          <span class="act-hint">${why}</span>
        </button>`;
    }).join('') : '';
    html = `
      <div class="sheet-head">
        <div>
          <p class="sheet-title">${def.label}</p>
          <p class="sheet-sub">${inc.where}</p>
        </div>
        <button class="sheet-close" type="button" data-act="close" aria-label="Fermer">✕</button>
      </div>
      <p class="sheet-desc">${def.effect}</p>
      <dl class="facts">
        <div class="fact"><dt>Fin estimée</dt><dd>${fmtClock(g.t + inc.left)}</dd></div>
        <div class="fact"><dt>Durée</dt><dd>${Math.ceil(inc.left / 60)} min</dd></div>
        <div class="fact"><dt>Agent</dt><dd style="font-family:var(--f-display);font-size:14px">${agent ? agent.name : '—'}</dd></div>
      </dl>
      <div class="actions">${inc.crewId ? `<p class="empty">${agent.name} est sur place.</p>` : crewBtns || '<p class="empty">Incident extérieur : aucun agent ne peut intervenir. Espacez les trains, ou limitez-les.</p>'}</div>`;
  } else if (sheet.kind === 'reserve') {
    sig = `r|${g.reserves.map((r) => r.used).join(',')}`;
    if (sig === sheetSig) return;
    html = `
      <div class="sheet-head">
        <div>
          <p class="sheet-title">Rames de réserve</p>
          <p class="sheet-sub">Une rame injectée reste en service jusqu'à la fin.</p>
        </div>
        <button class="sheet-close" type="button" data-act="close" aria-label="Fermer">✕</button>
      </div>
      <div class="actions">
        ${g.reserves.map((r) => `
          <button class="act" type="button" data-act="reserve" data-id="${r.id}" ${r.used ? 'disabled' : ''}>
            <span class="act-label">${r.label}</span>
            <span class="act-hint">${r.used ? 'Déjà injectée' : r.hint}</span>
            ${fxHtml([1, 0])}
          </button>`).join('')}
      </div>`;
  } else if (sheet.kind === 'node') {
    const inc = g.incidents.find((i) => i.type === 'derangement' && !i.resolved);
    if (!inc) { closeSheet(); return; }
    const waiting = g.trains.filter((t) => t.waitingAuth);
    const busy = Math.max(0, g.node.busyUntil - g.t);
    const aig = g.crew.find((c) => c.id === 'aiguilleur');
    const aigOk = !inc.crewId && crewState(g, aig) === 'ready';
    sig = `n|${waiting.map((t) => t.id).join(',')}|${Math.ceil(busy / 15)}|${inc.crewId}|${aigOk}|${Math.floor(inc.left / 60)}`;
    if (sig === sheetSig) return;
    el.classList.add('node');
    html = `
      <div class="sheet-head">
        <div>
          <p class="sheet-title">Poste de Versailles-Chantiers</p>
          <p class="sheet-sub">Commande manuelle · fin estimée ${fmtClock(g.t + inc.left)}</p>
        </div>
        <button class="sheet-close" type="button" data-act="close" aria-label="Réduire">–</button>
      </div>
      <p class="sheet-desc">Autorisez les départs un par un. Attendez que l'itinéraire soit libéré avant le suivant, sinon c'est le conflit.</p>
      <div class="node-bar"><div style="width:${(busy / 75) * 100}%"></div></div>
      <p class="label" style="margin:0 0 8px">${busy > 0 ? `Itinéraire occupé · ${busy} s` : 'Itinéraire libre'}</p>
      <div class="actions">
        ${waiting.map((t) => `
          <button class="act" type="button" data-act="authorize" data-id="${t.id}">
            <span class="act-label">Autoriser le ${t.trip.num} → ${ST[t.trip.dest].short}</span>
            <span class="act-hint">Retard +${Math.floor(trainDelay(g, t) / 60)} min</span>
          </button>`).join('') || '<p class="empty">Aucun train en attente de départ.</p>'}
        ${inc.crewId ? '<p class="empty">Karim est au poste, la commande automatique revient bientôt.</p>' : `
          <button class="act crew-act${aigOk ? ' best' : ''}" type="button" data-act="dispatch-node" ${aigOk ? '' : 'disabled'}>
            <span class="act-label">Envoyer ${aig.name} au poste <span class="tag">Spécialiste</span></span>
            <span class="act-hint">${aigOk ? 'Rétablit la commande automatique plus tôt' : 'Indisponible pour le moment'}</span>
          </button>`}
      </div>`;
  }

  if (sheet.kind !== 'node') el.classList.remove('node');
  sheetSig = sig;
  el.innerHTML = html;
  el.hidden = false;
}

function onSheetAction(btn) {
  if (!running || g.over) return;
  const act = btn.dataset.act;
  if (act === 'close') { closeSheet(); return; }
  if (act === 'dispatch') { dispatch(sheet.id, btn.dataset.crewId); return; }
  if (act === 'dispatch-node') {
    const inc = g.incidents.find((i) => i.type === 'derangement' && !i.resolved);
    if (inc) dispatch(inc.id, 'aiguilleur');
    openSheet({ kind: 'node' });
    return;
  }
  if (act === 'reserve') {
    if (apply(g, { type: 'reserve', reserveId: btn.dataset.id }).ok) { toast('Rame de réserve injectée.'); closeSheet(); }
    return;
  }
  if (act === 'authorize') {
    const res = apply(g, { type: 'authorize', trainId: Number(btn.dataset.id) });
    if (res.conflict) toast('Conflit d\'itinéraire ! Arrêt d\'urgence, 3 min perdues.');
    sheetSig = '';
    return;
  }
  if (act === 'train') {
    const acts = JSON.parse($('sheet').dataset.acts || '[]');
    const a = acts[Number(btn.dataset.i)];
    if (!a) return;
    const res = apply(g, { type: a.type, trainId: sheet.id, station: a.station });
    if (res.ok) {
      if (a.type === 'hold') toast('Train retenu 2 min à quai.');
      if (a.type === 'suppress') closeSheet();
      sheetSig = '';
    }
  }
}

// ---------------------------------------------------------------------------
// Fin de service
// ---------------------------------------------------------------------------

function showEnd() {
  const r = g.result;
  const pseudo = store.get('ukipu.pseudo', '') || 'Un régulateur';
  $('end-k').textContent = r.failed ? `Service interrompu à ${fmtClock(r.endedAt)}` : 'Fin de service · 09:30';
  $('end-title').textContent = r.failed ? 'Vous avez perdu le contrôle de la ligne' : r.stars === 3 ? 'Ligne tenue de main de maître' : r.stars === 2 ? 'Service correct' : 'Service assuré, de justesse';
  $('end-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`).join('');

  const key = `ukipu.best.${SCENARIO.id}`;
  const best = store.get(key, null);
  const isBest = !r.failed && (!best || r.regularity > best.regularity);
  if (isBest) store.set(key, { regularity: r.regularity, stars: r.stars, at: Date.now() });

  const stat = (k, v, main) => `<div class="${main ? 'main' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`;
  $('end-stats').innerHTML = [
    stat(`Régularité${isBest ? ' · nouveau record' : ''}`, `${fr1.format(r.regularity)} %`, true),
    stat('Satisfaction', `${r.satisfaction} %`),
    stat('Voyageurs', fr0.format(r.transported)),
    stat('Trains supprimés', String(r.suppressed)),
    stat('Incidents réglés', `${r.resolved} / ${r.incidents}`),
  ].join('');

  let line;
  if (r.failed) line = `⚠️ <b>${esc(pseudo)}</b> a perdu le contrôle de la ligne U à ${fmtClock(r.endedAt)}.`;
  else if (r.stars === 3) line = `👑 <b>${esc(pseudo)}</b> a tenu la ligne U à ${fr1.format(r.regularity)} % de régularité.`;
  else line = `<b>${esc(pseudo)}</b> a terminé son service sur la U avec ${fr1.format(r.regularity)} % de régularité.`;
  $('end-feed').innerHTML = `<span class="label">Ce que verront vos potes dans le fil</span>${line}<br><span style="color:var(--muted);font-size:13px">Pour comparer : la vraie ligne U tourne autour de 90 à 93 % ces derniers mois.</span>`;
  $('copy-fallback').hidden = true;
  $('screen-end').hidden = false;
  showBest();
}

function resultText() {
  const r = g.result;
  const stars = r.failed ? 'Service interrompu' : '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  return `Ukipu · ${SCENARIO.title}\n${stars} · Régularité ${fr1.format(r.regularity)} % · Satisfaction ${r.satisfaction} %\nService n° ${g.seed}`;
}

async function copyResult() {
  const text = resultText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Résultat copié, à coller dans le groupe.');
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
  $('best').textContent = best ? `Record personnel : ${fr1.format(best.regularity)} % · ${'★'.repeat(best.stars)}` : '';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

boot();
window.__ukipu = { get game() { return g; }, get renderer() { return renderer; } };
