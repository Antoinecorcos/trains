// Plan du réseau façon plan Transilien/RER, dessiné sur Canvas :
// tracés schématiques (0°, 45°, 90°), gares régulièrement espacées, lignes côte à côte sur les troncs
// communs, correspondances en pastilles, textes de taille constante qui ne se chevauchent pas.
// Couche « jeu » : Seine stylisée, forêts, monuments lumineux, lignes qui brillent, trains animés.
import { LINES } from './route.js';

// Coordonnées schématiques (unités de grille), dans l'ordre des gares de chaque ligne
const SCHEMA = {
  U: [[15, 3], [15, 4], [15, 5], [15, 6], [14, 7], [13, 8], [11, 10], [10, 11], [9, 12], [8, 13], [7, 14]],
  L: [[20, 4], [19, 3], [18, 2], [17, 2], [16, 2], [15, 3], [15, 4], [15, 5], [15, 6], [14, 7], [13, 8], [12, 8], [11, 8], [10, 8]],
  N: [[20, 9], [19, 10], [18, 11], [17, 12], [16, 12], [15, 12], [14, 12], [13, 12], [11, 10], [10, 11], [9, 12], [8, 13], [7, 14], [6, 15], [6, 16], [6, 17], [6, 18]],
  C: [[11, 10], [12, 11], [13, 12], [14, 12], [15, 13], [16, 13], [17, 13], [18, 13], [19, 12], [20, 11], [21, 10], [22, 10], [23, 10], [24, 10]],
  A: [[15, 3], [14, 3], [13, 3], [12, 3], [11, 3], [10, 3], [9, 3], [8, 3]],
};
// Décalage latéral (px) pour que les lignes passent côte à côte sur les tronçons partagés
const SIDE = { U: 1, L: -1, N: -1, C: -1, A: 0 };
const ORDER = ['A', 'C', 'N', 'L', 'U'];
const PICT_AT = { U: [8.4, 14.9], L: [21.1, 5.1], N: [6, 19.1], C: [25.1, 9.2], A: [6.9, 3] };
const LINE_W = 7;
const GAP = 8;

const SEINE = [[26, 11.3], [24.5, 10.7], [22.5, 10.75], [21, 11.3], [19.8, 12.5], [18.6, 13.75], [16.6, 14.0], [15.6, 13.3], [15.8, 11.4], [15.65, 9.5], [15.75, 7.3], [15.75, 5.5], [16.3, 3.9], [17.6, 3.1], [18.7, 2.4], [19.6, 1.3], [18.6, 0.5], [16.4, 0.7], [14.2, 1.4], [12.4, 2.3], [11.5, 3.2], [10.7, 4.1], [9.7, 3.9], [8.5, 3.1], [8.1, 1.6], [8.6, 0]];
const FORESTS = [[16.3, 14.8, 1.6, 0.9], [13.3, 9.7, 1.2, 0.8], [8.6, 1.7, 1.8, 0.9], [10.6, 5.4, 1.6, 1.1], [4.6, 17.4, 1.8, 1.6], [17.2, 6.3, 0.9, 1.1], [12.3, 13.6, 1.4, 0.8], [7.6, 10.9, 1.3, 0.9]];
const LANDMARKS = [
  { x: 20.85, y: 12.15, kind: 'eiffel' }, { x: 15.9, y: 2.15, kind: 'arche' }, { x: 10.3, y: 9.15, kind: 'chateau' },
  { x: 7.85, y: 2.15, kind: 'chateau' }, { x: 5.1, y: 18.55, kind: 'chateau' }, { x: 24.6, y: 11.1, kind: 'cathedrale' },
];
const TOWNS = [['PARIS', 22, 6.6, 26], ['Versailles', 9.8, 9.55, 13], ['Saint-Quentin-en-Yvelines', 7.4, 11.75, 12], ['Rambouillet', 4.2, 18.5, 12], ['Nanterre', 12.8, 2.0, 12], ['Saint-Germain', 7.6, 3.85, 12], ['Boulogne', 17.5, 9.2, 12], ['Meudon', 15.6, 15.3, 11]];

const FONT = '"Nunito Sans", "Avenir Next", Avenir, "Segoe UI", sans-serif';
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

// Courbe lissée (Catmull-Rom) pour la Seine
function smooth(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

function offsetPts(pts, d) {
  if (!d) return pts.map((p) => [...p]);
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    // normale moyenne des deux segments adjacents (garde l'écart constant dans les virages à 45°)
    const n1 = i > 0 ? norm(pts[i - 1], p) : norm(p, b);
    const n2 = i < pts.length - 1 ? norm(p, pts[i + 1]) : norm(a, p);
    let nx = n1[0] + n2[0];
    let ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const cos = nx * n1[0] + ny * n1[1] || 1;
    return [p[0] + (nx * d) / cos, p[1] + (ny * d) / cos];
  });
}
function norm(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

export function mountNetMap(host, opts) {
  host.innerHTML = '<canvas class="netmap" aria-label="Plan du réseau"></canvas>';
  const cv = host.querySelector('canvas');
  const ctx = cv.getContext('2d');
  let W = 1;
  let H = 1;
  let dpr = 1;
  const view = { x: 0, y: 0, u: 40 }; // u : pixels par unité de grille
  let selected = opts.selected ?? null;
  let raf = 0;
  const t0 = performance.now();

  // gares uniques (une pastille par nom) et lignes qui y passent
  const stations = new Map();
  for (const id of ORDER) {
    LINES[id].stations.forEach((s, i) => {
      const g = SCHEMA[id][i];
      const key = s.name;
      if (!stations.has(key)) stations.set(key, { name: s.name, g, lines: [], end: false });
      const st = stations.get(key);
      st.lines.push(id);
      if (i === 0 || i === LINES[id].stations.length - 1) st.end = true;
    });
  }
  const major = (st) => st.end || st.lines.length >= 3 || /Paris|Défense|Versailles-Chantiers|Saint-Michel/.test(st.name);

  // trains animés
  const trains = [];
  for (const id of ORDER) {
    if (!opts.lineOpen(id)) continue;
    for (let k = 0; k < 2; k++) trains.push({ id, s: hash(id.charCodeAt(0) * 7 + k) , dir: k ? -1 : 1, v: 0.035 + hash(k + id.charCodeAt(0)) * 0.02 });
  }

  const S = (g) => [view.x + g[0] * view.u, view.y + g[1] * view.u];

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }

  function fit(focus = opts.focus) {
    resize();
    const top = 108;
    const bot = 150;
    let pts = Object.values(SCHEMA).flat();
    if (focus && W < 640) pts = SCHEMA[focus].concat(SCHEMA.A.slice(0, 2), SCHEMA.L.slice(3, 6));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - 1.6;
    const maxX = Math.max(...xs) + 1.6;
    const minY = Math.min(...ys) - 1.2;
    const maxY = Math.max(...ys) + 1.2;
    const hh = Math.max(120, H - top - bot);
    view.u = Math.max(18, Math.min(70, Math.min(W / (maxX - minX), hh / (maxY - minY))));
    view.x = W / 2 - ((minX + maxX) / 2) * view.u;
    view.y = top + hh / 2 - ((minY + maxY) / 2) * view.u;
  }

  // ------------------------------------------------------------------
  function draw(now) {
    const time = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fond : nuit bleue, grille de points
    const bg = ctx.createRadialGradient(W * 0.6, H * 0.35, 0, W * 0.6, H * 0.35, Math.max(W, H));
    bg.addColorStop(0, '#16257f');
    bg.addColorStop(1, '#070c33');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(160,175,255,0.10)';
    const step = view.u;
    const ox = ((view.x % step) + step) % step;
    const oy = ((view.y % step) + step) % step;
    for (let x = ox; x < W; x += step) for (let y = oy; y < H; y += step) ctx.fillRect(x - 1, y - 1, 2, 2);

    // Paris
    const [px0, py0] = S([19.2, 3.2]);
    const [px1, py1] = S([25.4, 11.9]);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    roundRect(ctx, px0, py0, px1 - px0, py1 - py0, view.u * 1.6);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // forêts : bosquets de petits arbres
    for (const [fx, fy, rx, ry] of FORESTS) {
      const [cx, cy] = S([fx, fy]);
      ctx.fillStyle = 'rgba(36,120,80,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * view.u, ry * view.u, 0, 0, Math.PI * 2);
      ctx.fill();
      const n = Math.round(rx * ry * 9);
      for (let i = 0; i < n; i++) {
        const a = hash(i * 31 + fx * 7) * Math.PI * 2;
        const d = Math.sqrt(hash(i * 17 + fy * 13));
        const tx = cx + Math.cos(a) * d * rx * view.u * 0.85;
        const ty = cy + Math.sin(a) * d * ry * view.u * 0.85;
        const s = view.u * (0.13 + hash(i) * 0.08);
        ctx.fillStyle = i % 3 ? '#2f8f62' : '#3aa875';
        ctx.beginPath();
        ctx.moveTo(tx, ty - s * 1.6);
        ctx.lineTo(tx + s, ty + s * 0.5);
        ctx.lineTo(tx - s, ty + s * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // la Seine
    const seine = SEINE.map(S);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2459c4';
    ctx.lineWidth = Math.max(8, view.u * 0.42);
    ctx.beginPath(); smooth(ctx, seine); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,200,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([view.u * 0.5, view.u * 0.7]);
    ctx.lineDashOffset = -time * view.u * 0.4;
    ctx.beginPath(); smooth(ctx, seine); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // villes
    for (const [name, gx, gy, size] of TOWNS) {
      const [x, y] = S([gx, gy]);
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.fillStyle = name === 'PARIS' ? 'rgba(255,255,255,0.16)' : 'rgba(195,203,255,0.32)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.toUpperCase(), x, y);
    }

    // monuments
    for (const lm of LANDMARKS) drawLandmark(ctx, lm.kind, ...S([lm.x, lm.y]), Math.max(0.8, Math.min(1.6, view.u / 40)), time);

    // lignes
    const paths = {};
    for (const id of ORDER) paths[id] = offsetPts(SCHEMA[id].map(S), SIDE[id] * GAP * 0.5 * (id === 'A' ? 0 : 1));
    for (const id of ORDER) {
      const open = opts.lineOpen(id);
      const dim = selected && selected !== id;
      const p = paths[id];
      ctx.save();
      ctx.globalAlpha = dim ? 0.28 : 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (open) {
        ctx.shadowColor = LINES[id].color;
        ctx.shadowBlur = selected === id ? 22 : 10;
      }
      ctx.strokeStyle = LINES[id].color;
      ctx.lineWidth = selected === id ? LINE_W + 3 : LINE_W;
      if (!open) { ctx.globalAlpha *= 0.45; ctx.lineWidth = LINE_W - 2; ctx.setLineDash([3, 9]); }
      ctx.beginPath();
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
    }

    // trains
    for (const t of trains) {
      if (selected && selected !== t.id) continue;
      t.s += t.dir * t.v * 0.016;
      if (t.s > 1) { t.s = 1; t.dir = -1; }
      if (t.s < 0) { t.s = 0; t.dir = 1; }
      const [x, y, ang] = along(paths[t.id], t.s);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (t.dir < 0 ? Math.PI : 0));
      ctx.shadowColor = '#fff7c2';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -10, -4.5, 20, 9, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = LINES[t.id].color;
      ctx.fillRect(-8, -1, 13, 2);
      ctx.fillStyle = '#ffd200';
      ctx.beginPath(); ctx.arc(8, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // gares : pastilles de correspondance et points
    const hits = [];
    const labels = [];
    for (const st of stations.values()) {
      const ps = st.lines.map((id) => paths[id][LINES[id].stations.findIndex((s) => s.name === st.name)]);
      const dim = selected && !st.lines.includes(selected);
      ctx.globalAlpha = dim ? 0.3 : 1;
      const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length;
      const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
      if (ps.length > 1) {
        // pastille blanche qui englobe les lignes parallèles
        let ax = Infinity; let ay = Infinity; let bx = -Infinity; let by = -Infinity;
        for (const [x, y] of ps) { ax = Math.min(ax, x); ay = Math.min(ay, y); bx = Math.max(bx, x); by = Math.max(by, y); }
        const r = 6;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0b1350';
        ctx.lineWidth = 3;
        if (bx - ax < 2 && by - ay < 2) { ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        else { capsule(ctx, ax, ay, bx, by, r); ctx.fill(); ctx.stroke(); }
      } else {
        const id = st.lines[0];
        const open = opts.lineOpen(id);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = open ? LINES[id].color : '#59618f';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, st.end ? 6.5 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      hits.push({ type: 'station', name: st.name, x: cx, y: cy, r: 16 });
      if (!dim) labels.push({ st, x: cx, y: cy, major: major(st) });
    }

    // emplacement des pictogrammes (réservé pour que les noms ne passent pas dessous)
    const picts = ORDER.map((id) => { const [x, y] = S(PICT_AT[id]); return { id, x, y, s: selected === id ? 34 : 28 }; });
    const placed = picts.map((q) => [q.x - q.s / 2 - 2, q.y - q.s / 2 - 2, q.s + 4, q.s + 26]);
    placed.push([W - 60, 140, 60, 150]); // boutons de zoom

    // étiquettes : taille fixe, placées sans chevauchement (les plus importantes d'abord)
    const zoomed = view.u >= 44;
    const rank = (lb) => (lb.major ? 2 : 0) + (lb.st.lines.some((id) => opts.lineOpen(id)) ? 1 : 0);
    labels.sort((a, b) => rank(b) - rank(a));
    ctx.textBaseline = 'middle';
    for (const lb of labels) {
      const onOpen = lb.st.lines.some((id) => opts.lineOpen(id) && (!selected || id === selected));
      if (!lb.major && !zoomed && !onOpen && !selected) continue;
      const size = lb.major ? 13 : 11.5;
      ctx.font = `${lb.major ? 900 : 700} ${size}px ${FONT}`;
      const tw = ctx.measureText(lb.st.name).width;
      const th = size + 4;
      const cands = [[12, -th / 2, 'left'], [-12 - tw, -th / 2, 'left'], [-tw / 2, -th - 10, 'left'], [-tw / 2, 10, 'left'], [10, -th - 4, 'left'], [-10 - tw, 6, 'left']];
      let ok = null;
      for (const [dx, dy] of cands) {
        const box = [lb.x + dx - 3, lb.y + dy, tw + 6, th];
        if (box[0] < 4 || box[0] + box[2] > W - 4 || box[1] < 96 || box[1] + box[3] > H - 4) continue;
        if (placed.some((b) => !(box[0] + box[2] < b[0] || b[0] + b[2] < box[0] || box[1] + box[3] < b[1] || b[1] + b[3] < box[1]))) continue;
        ok = box;
        break;
      }
      if (!ok) continue;
      placed.push(ok);
      ctx.fillStyle = 'rgba(7,12,51,0.72)';
      roundRect(ctx, ok[0], ok[1], ok[2], ok[3], 5);
      ctx.fill();
      ctx.fillStyle = lb.major ? '#ffffff' : '#d7dcff';
      ctx.textAlign = 'left';
      ctx.fillText(lb.st.name, ok[0] + 3, ok[1] + th / 2 + 0.5);
    }

    // pictogrammes de ligne près du terminus, avec la couronne
    for (const { id, x: bx, y: by } of picts) {
      const p = paths[id];
      const term = id === 'L' ? p[0] : p[p.length - 1];
      ctx.strokeStyle = LINES[id].color;
      ctx.globalAlpha = opts.lineOpen(id) ? 0.8 : 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(term[0], term[1]); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const open = opts.lineOpen(id);
      const sel = selected === id;
      const s = sel ? 34 : 28;
      const pulse = sel ? 1 + Math.sin(time * 4) * 0.06 : 1;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = open ? LINES[id].color : 'transparent';
      ctx.shadowBlur = open ? 14 : 0;
      ctx.globalAlpha = open ? 1 : 0.5;
      ctx.fillStyle = LINES[id].color;
      roundRect(ctx, -s / 2, -s / 2, s, s, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = LINES[id].ink;
      ctx.font = `900 ${s * 0.62}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(id, 0, 1);
      ctx.globalAlpha = 1;
      if (!open) {
        ctx.fillStyle = '#0d1663';
        ctx.beginPath(); ctx.arc(s / 2, -s / 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.font = `10px ${FONT}`;
        ctx.fillText('🔒', s / 2, -s / 2 + 1);
      }
      ctx.restore();
      hits.push({ type: 'line', id, x: bx, y: by, r: 24 });
      const crown = opts.crowns?.[id]?.crown;
      if (crown) {
        ctx.font = `900 11px ${FONT}`;
        const txt = `👑 ${crown.pseudo}`;
        const tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = '#ffd200';
        roundRect(ctx, bx - tw / 2, by + s / 2 + 5, tw, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#0d1663';
        ctx.textAlign = 'center';
        ctx.fillText(txt, bx, by + s / 2 + 14.5);
      }
    }
    ctx.textBaseline = 'alphabetic';
    state.hits = hits;
    state.paths = paths;
    raf = requestAnimationFrame(draw);
  }
  const state = { hits: [], paths: {} };

  // ------------------------------------------------------------------
  // Interactions : glisser, pincer, molette, toucher
  const ptrs = new Map();
  let down = null;
  let pinch = null;
  const zoomAt = (cx, cy, k) => {
    const nu = Math.max(16, Math.min(110, view.u * k));
    const kk = nu / view.u;
    view.x = cx - (cx - view.x) * kk;
    view.y = cy - (cy - view.y) * kk;
    view.u = nu;
  };
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) { const [x, y] = local(e); down = { x, y, vx: view.x, vy: view.y, moved: false }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), u: view.u }; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.u * (d / pinch.d)) / view.u);
      if (down) down.moved = true;
      return;
    }
    if (!down) return;
    const [x, y] = local(e);
    if (Math.hypot(x - down.x, y - down.y) > 6) down.moved = true;
    if (down.moved) { view.x = down.vx + x - down.x; view.y = down.vy + y - down.y; }
  });
  const end = (e) => {
    const tap = down && !down.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size) return;
    if (tap) {
      const [x, y] = local(e);
      let best = null;
      let bd = Infinity;
      for (const h of state.hits) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < h.r && d < bd) { bd = d; best = h; }
      }
      if (!best) {
        // toucher une ligne entre deux gares
        for (const id of ORDER) {
          const p = state.paths[id];
          for (let i = 1; i < p.length; i++) {
            const d = segDist(x, y, p[i - 1], p[i]);
            if (d < 12 && d < bd) { bd = d; best = { type: 'line', id }; }
          }
        }
      }
      if (best?.type === 'line') { selected = best.id; opts.onLine?.(best.id); }
      else if (best?.type === 'station') opts.onStation?.(best.name, e.clientX, e.clientY);
      else { selected = null; opts.onEmpty?.(); }
    }
    down = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  fit();
  const ro = new ResizeObserver(() => { const w = W; resize(); if (Math.abs(w - W) > 40) fit(); });
  ro.observe(cv);
  raf = requestAnimationFrame(draw);

  return {
    zoom: (k) => zoomAt(W / 2, H / 2, k),
    fit: () => fit(),
    select: (id) => { selected = id; },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

// ----------------------------------------------------------------------
function along(p, f) {
  let tot = 0;
  const segs = [];
  for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push(l); tot += l; }
  let s = f * tot;
  let i = 0;
  while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; }
  const a = p[i];
  const b = p[i + 1];
  const k = segs[i] ? s / segs[i] : 0;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

function segDist(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function capsule(ctx, ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  const ang = Math.atan2(dy, dx);
  const len = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  roundRect(ctx, -r, -r, len + 2 * r, 2 * r, r);
  ctx.restore();
}

function drawLandmark(ctx, kind, x, y, k, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const glow = 0.55 + Math.sin(time * 2 + x) * 0.15;
  ctx.shadowColor = `rgba(255,210,120,${glow})`;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  if (kind === 'eiffel') {
    ctx.moveTo(0, -30); ctx.lineTo(3, -9); ctx.lineTo(10, 7); ctx.lineTo(5, 7); ctx.lineTo(0, -1); ctx.lineTo(-5, 7); ctx.lineTo(-10, 7); ctx.lineTo(-3, -9); ctx.closePath();
    ctx.fill();
    ctx.fillRect(-7, -11, 14, 2);
    ctx.fillRect(-1, -36, 2, 7);
  } else if (kind === 'arche') {
    ctx.moveTo(-11, -14); ctx.lineTo(11, -14); ctx.lineTo(11, 7); ctx.lineTo(5, 7); ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.lineTo(-5, 7); ctx.lineTo(-11, 7); ctx.closePath();
    ctx.fill();
  } else if (kind === 'cathedrale') {
    ctx.moveTo(-10, 7); ctx.lineTo(-10, -7); ctx.lineTo(-6, -7); ctx.lineTo(-6, -16); ctx.lineTo(-2, -16); ctx.lineTo(-2, -7); ctx.lineTo(2, -7); ctx.lineTo(2, -16); ctx.lineTo(6, -16); ctx.lineTo(6, -7); ctx.lineTo(10, -7); ctx.lineTo(10, 7); ctx.closePath();
    ctx.fill();
  } else {
    ctx.moveTo(-15, 7); ctx.lineTo(-15, -3); ctx.lineTo(-11, -3); ctx.lineTo(-11, -10); ctx.lineTo(-8, -14); ctx.lineTo(-5, -10); ctx.lineTo(-5, -3); ctx.lineTo(5, -3); ctx.lineTo(5, -10); ctx.lineTo(8, -14); ctx.lineTo(11, -10); ctx.lineTo(11, -3); ctx.lineTo(15, -3); ctx.lineTo(15, 7); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
