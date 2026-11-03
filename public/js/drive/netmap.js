// Carte du réseau en plein écran : relief simplifié de l'ouest francilien, Seine, forêts, monuments,
// lignes en parallèle sur les troncs communs, trains animés, zoom et déplacement au doigt.
import { LINES, INTERCHANGES } from './route.js';

const NS = 'http://www.w3.org/2000/svg';
const KM = 26; // unités SVG par kilomètre
const LAT0 = 48.80;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const P = (lon, lat) => [(lon - 1.78) * 111.32 * COS * KM, (48.965 - lat) * 110.57 * KM];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Décalage latéral des lignes sur les troncs communs (comme sur un vrai plan)
const OFFSET = { U: 0, L: 9, N: -9, C: 0, A: 0 };
const ORDER = ['A', 'C', 'N', 'L', 'U'];

const SEINE = [[2.42, 48.822], [2.37, 48.842], [2.35, 48.853], [2.325, 48.864], [2.30, 48.862], [2.285, 48.852], [2.27, 48.840], [2.255, 48.828], [2.232, 48.826], [2.222, 48.838], [2.223, 48.858], [2.236, 48.876], [2.255, 48.890], [2.278, 48.903], [2.30, 48.912], [2.33, 48.925], [2.345, 48.937], [2.30, 48.947], [2.255, 48.946], [2.215, 48.932], [2.185, 48.905], [2.163, 48.888], [2.14, 48.886], [2.115, 48.895], [2.10, 48.912], [2.11, 48.945], [2.12, 48.97]];
const FORESTS = [
  [2.215, 48.797, 2.6, 1.6], [2.19, 48.832, 1.6, 1.2], [2.205, 48.85, 0.9, 0.8], [1.85, 48.67, 7, 5], [1.92, 48.70, 3.5, 2.4],
  [2.085, 48.925, 4, 2.3], [2.06, 48.865, 3, 1.6], [2.25, 48.864, 1.5, 1.4], [2.135, 48.78, 2.2, 1.2], [2.0, 48.82, 2.5, 1.3],
];
const LANDMARKS = [
  { lon: 2.2945, lat: 48.8584, kind: 'eiffel', name: 'Tour Eiffel' },
  { lon: 2.2361, lat: 48.8926, kind: 'arche', name: 'Grande Arche' },
  { lon: 2.1204, lat: 48.8049, kind: 'chateau', name: 'Château de Versailles' },
  { lon: 2.0955, lat: 48.8985, kind: 'chateau', name: 'Château de Saint-Germain' },
  { lon: 1.8236, lat: 48.6448, kind: 'chateau', name: 'Château de Rambouillet' },
  { lon: 2.3499, lat: 48.853, kind: 'cathedrale', name: 'Notre-Dame' },
];
const TOWNS = [['PARIS', 2.345, 48.872, 34], ['Versailles', 2.128, 48.79, 18], ['Saint-Quentin-en-Yvelines', 2.03, 48.775, 15], ['Rambouillet', 1.83, 48.632, 15], ['Nanterre', 2.205, 48.905, 15], ['Boulogne', 2.24, 48.836, 14], ['Saint-Germain-en-Laye', 2.09, 48.91, 15], ['Meudon', 2.235, 48.803, 13]];

function offsetPolyline(pts, d) {
  if (!d) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / n) * d, p[1] + (dx / n) * d];
  });
}

const linePts = (l) => offsetPolyline(l.stations.map((s) => P(s.lon, s.lat)), OFFSET[l.id] ?? 0);

function landmarkSvg(kind, x, y) {
  const s = 1.4;
  if (kind === 'eiffel') return `<g class="lm" transform="translate(${x},${y}) scale(${s})"><path d="M0-34 L3-10 L9 6 L4 6 L0-2 L-4 6 L-9 6 L-3-10 Z"/><rect x="-6" y="-12" width="12" height="2"/><rect x="-1" y="-40" width="2" height="7"/></g>`;
  if (kind === 'arche') return `<g class="lm" transform="translate(${x},${y}) scale(${s})"><path d="M-10-14 H10 V6 H5 V-9 H-5 V6 H-10 Z"/></g>`;
  if (kind === 'cathedrale') return `<g class="lm" transform="translate(${x},${y}) scale(${s})"><path d="M-9 6 V-8 H-5 V-16 H-2 V-8 H2 V-16 H5 V-8 H9 V6 Z"/></g>`;
  return `<g class="lm" transform="translate(${x},${y}) scale(${s})"><path d="M-14 6 V-4 H-10 V-10 L-8-13 L-6-10 V-4 H6 V-10 L8-13 L10-10 V-4 H14 V6 Z"/></g>`;
}

export function mountNetMap(host, opts) {
  const pts = Object.fromEntries(Object.values(LINES).map((l) => [l.id, linePts(l)]));
  let svgStr = `<svg class="netmap" xmlns="${NS}" aria-label="Carte du réseau">
    <defs>
      <pattern id="paris-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 0H18M0 0V18" stroke="rgba(255,255,255,0.05)" stroke-width="2"/></pattern>
      <radialGradient id="vignette" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(3,6,30,0.55)"/></radialGradient>
    </defs>
    <g id="nm-world">
    <rect x="-2000" y="-2000" width="6000" height="6000" class="nm-land"/>`;
  for (const [lon, lat, rx, ry] of FORESTS) {
    const [x, y] = P(lon, lat);
    svgStr += `<ellipse cx="${x}" cy="${y}" rx="${rx * KM}" ry="${ry * KM}" class="nm-forest"/>`;
  }
  const [px, py] = P(2.346, 48.858);
  svgStr += `<ellipse cx="${px}" cy="${py}" rx="${5.6 * KM}" ry="${4.1 * KM}" class="nm-paris"/><ellipse cx="${px}" cy="${py}" rx="${5.6 * KM}" ry="${4.1 * KM}" fill="url(#paris-grid)"/>`;
  svgStr += `<polyline points="${SEINE.map(([a, b]) => P(a, b).join(',')).join(' ')}" class="nm-seine"/>`;
  svgStr += `<polyline points="${SEINE.map(([a, b]) => P(a, b).join(',')).join(' ')}" class="nm-seine-hi"/>`;
  for (const [name, lon, lat, size] of TOWNS) {
    const [x, y] = P(lon, lat);
    svgStr += `<text x="${x}" y="${y}" class="nm-town" font-size="${size}">${esc(name)}</text>`;
  }
  for (const lm of LANDMARKS) svgStr += landmarkSvg(lm.kind, ...P(lm.lon, lm.lat));
  // lignes : liseré, couleur, zone de clic
  for (const id of ORDER) {
    const l = LINES[id];
    const open = opts.lineOpen(id);
    const d = pts[id].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    svgStr += `<polyline points="${d}" class="nm-case"/>`;
    svgStr += `<polyline points="${d}" class="nm-line${open ? '' : ' off'}" style="stroke:${open ? l.color : '#56608f'}"/>`;
    svgStr += `<polyline points="${d}" class="nm-hit" data-line="${id}"/>`;
  }
  // gares
  const seen = new Set();
  for (const id of ORDER) {
    LINES[id].stations.forEach((s, i) => {
      if (seen.has(s.name)) return;
      seen.add(s.name);
      const [x, y] = pts[id][i];
      const n = INTERCHANGES[s.name]?.length ?? 1;
      const end = i === 0 || i === LINES[id].stations.length - 1;
      svgStr += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n >= 3 ? 13 : n === 2 ? 10 : 7}" class="nm-st${n > 1 ? ' hub' : ''}" data-station="${esc(s.name)}"/>`;
      const right = x < 1080;
      svgStr += `<text x="${(x + (right ? 16 : -16)).toFixed(1)}" y="${(y + 6).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}" class="nm-label${n >= 3 || end ? ' major' : ''}">${esc(s.name)}</text>`;
    });
  }
  // pastilles de ligne aux terminus
  for (const id of ORDER) {
    const l = LINES[id];
    const open = opts.lineOpen(id);
    const p = pts[id];
    const endIdx = { U: p.length - 1, L: 0, N: p.length - 1, C: p.length - 1, A: p.length - 1 }[id];
    for (const [i, j] of [[endIdx, endIdx === 0 ? 1 : p.length - 2]]) {
      const [x, y] = p[i];
      const dx = x - p[j][0];
      const dy = y - p[j][1];
      const n = Math.hypot(dx, dy) || 1;
      const bx = x + (dx / n) * 34;
      const by = y + (dy / n) * 34;
      svgStr += `<g class="nm-pin" data-line="${id}"><rect x="${bx - 20}" y="${by - 20}" width="40" height="40" rx="9" fill="${open ? l.color : '#3b4377'}" stroke="#fff" stroke-width="3"/><text x="${bx}" y="${by + 10}" class="nm-pin-t" fill="${open ? l.ink : '#aab2e6'}">${open ? id : '🔒'}</text></g>`;
    }
    const crown = opts.crowns?.[id]?.crown;
    if (crown) {
      const mid = p[Math.floor(p.length * 0.5)];
      svgStr += `<g class="nm-crown"><rect x="${mid[0] - 60}" y="${mid[1] - 52}" width="120" height="28" rx="14"/><text x="${mid[0]}" y="${mid[1] - 32}">👑 ${esc(crown.pseudo)}</text></g>`;
    }
  }
  svgStr += '<g id="nm-trains"></g></g><rect width="100%" height="100%" fill="url(#vignette)" pointer-events="none"/></svg>';
  host.innerHTML = svgStr;
  const svg = host.querySelector('svg');
  const world = svg.querySelector('#nm-world');
  const trainsG = svg.querySelector('#nm-trains');

  // ----- trains animés sur les lignes ouvertes -----
  const trains = [];
  for (const id of ORDER) {
    if (!opts.lineOpen(id)) continue;
    const p = pts[id];
    const seg = [];
    let tot = 0;
    for (let i = 1; i < p.length; i++) { const len = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); seg.push(len); tot += len; }
    for (let k = 0; k < 2; k++) {
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = `<rect x="-13" y="-6" width="26" height="12" rx="5" fill="#fff" stroke="${LINES[id].color}" stroke-width="3"/><circle cx="9" cy="0" r="2.4" fill="#ffd200"/>`;
      trainsG.appendChild(g);
      trains.push({ g, p, seg, tot, s: (k * 0.5 + Math.random() * 0.3) * tot, dir: k ? -1 : 1, speed: 55 + Math.random() * 25 });
    }
  }
  let raf = 0;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const t of trains) {
      t.s += t.dir * t.speed * dt;
      if (t.s > t.tot) { t.s = t.tot; t.dir = -1; }
      if (t.s < 0) { t.s = 0; t.dir = 1; }
      let s = t.s;
      let i = 0;
      while (i < t.seg.length - 1 && s > t.seg[i]) { s -= t.seg[i]; i++; }
      const a = t.p[i];
      const b = t.p[i + 1];
      const f = t.seg[i] ? s / t.seg[i] : 0;
      const x = a[0] + (b[0] - a[0]) * f;
      const y = a[1] + (b[1] - a[1]) * f;
      const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + (t.dir < 0 ? 180 : 0);
      t.g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // ----- vue : déplacement et zoom -----
  const all = Object.values(pts).flat();
  const minX = Math.min(...all.map((p) => p[0])) - 60;
  const maxX = Math.max(...all.map((p) => p[0])) + 60;
  const minY = Math.min(...all.map((p) => p[1])) - 60;
  const maxY = Math.max(...all.map((p) => p[1])) + 60;
  const view = { x: 0, y: 0, s: 1 };
  // zone utile : on laisse de la place au bandeau du haut et à la légende du bas
  const TOP = 104;
  const BOT = 72;
  const fit = () => {
    const r = svg.getBoundingClientRect();
    const h = Math.max(100, r.height - TOP - BOT);
    const s = Math.min((r.width - 24) / (maxX - minX), h / (maxY - minY));
    view.s = s;
    view.x = r.width / 2 - ((minX + maxX) / 2) * s;
    view.y = TOP + h / 2 - ((minY + maxY) / 2) * s;
    // sur téléphone, on cadre d'abord sur la ligne U
    if (r.width < 600 && opts.focus) {
      const fp = pts[opts.focus];
      const fx = fp.map((p) => p[0]);
      const fy = fp.map((p) => p[1]);
      const fs = Math.min(r.width / (Math.max(...fx) - Math.min(...fx) + 220), h / (Math.max(...fy) - Math.min(...fy) + 160));
      view.s = fs;
      view.x = r.width / 2 - ((Math.min(...fx) + Math.max(...fx)) / 2) * fs;
      view.y = TOP + h / 2 - ((Math.min(...fy) + Math.max(...fy)) / 2) * fs;
    }
    apply();
  };
  const apply = () => {
    world.setAttribute('transform', `translate(${view.x.toFixed(1)},${view.y.toFixed(1)}) scale(${view.s.toFixed(4)})`);
    svg.classList.toggle('zoomed', view.s > 1.05);
    svg.classList.toggle('far', view.s < 0.45);
  };
  const zoomAt = (cx, cy, k) => {
    const ns = Math.max(0.12, Math.min(2.5, view.s * k));
    const kk = ns / view.s;
    view.x = cx - (cx - view.x) * kk;
    view.y = cy - (cy - view.y) * kk;
    view.s = ns;
    apply();
  };
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(svg);

  const ptrs = new Map();
  let down = null;
  let pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const r = svg.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (pinch.s * (d / pinch.d)) / view.s);
      if (down) down.moved = true;
      return;
    }
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) down.moved = true;
    if (down.moved) { view.x = down.vx + dx; view.y = down.vy + dy; apply(); }
  });
  const end = (e) => {
    const wasTap = down && !down.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      if (wasTap) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const line = el?.closest('[data-line]')?.dataset.line;
        const st = el?.closest('[data-station]')?.dataset.station;
        if (st) opts.onStation?.(st, e.clientX, e.clientY);
        else if (line) opts.onLine?.(line);
        else opts.onEmpty?.();
      }
      down = null;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  return {
    zoom: (k) => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, k); },
    fit,
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
