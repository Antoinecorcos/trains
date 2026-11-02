// Rendu du schéma de ligne (« thermomètre ») sur Canvas 2D, avec ciel qui se lève pendant le service.
import { LINE_U, INCIDENTS, NEIGHBOURS } from './data.js';
import { trainDelay, activeIncidents, SERVICE_START, SERVICE_END } from './sim.js';

const C = {
  white: '#ffffff', soft: '#c3cbff', yellow: '#ffd200', ok: '#2f6ff2', late: '#f37b2b', cancel: '#e33b45',
  good: '#24b47e', u: '#c4245f', uDark: '#7d1239', deep: '#0d1663',
};
const FONT = '"Nunito Sans", "Avenir Next", Avenir, "Segoe UI", sans-serif';
const N = LINE_U.stations.length;

// Ciel : nuit → aube → matin (couleurs haut / bas)
const SKY = [
  [0.0, '#060a2c', '#141a55'],
  [0.18, '#0b1242', '#3a2a6e'],
  [0.32, '#152464', '#b2507a'],
  [0.45, '#1d3a8c', '#e59a63'],
  [0.62, '#24489e', '#7fa3d8'],
  [1.0, '#2a54ad', '#8fb4e4'],
];

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (h1, h2, t) => {
  const a = hex(h1);
  const b = hex(h2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
};

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.hits = [];
    this.selected = null;
    this.floaters = [];
    this.stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97.3) % 1, y: ((i * 61.7) % 1) * 0.7, p: (i * 13.1) % 6 }));
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.vertical = this.h > this.w * 0.9;
    this.s = this.vertical ? Math.min(1.25, Math.max(0.9, this.h / 640)) : Math.min(1.6, Math.max(1, Math.min(this.w / 1000, this.h / 480)));
    const S = this.s;
    const L = { gap: 17 * S, lw: 9 * S };
    if (this.vertical) {
      L.top = 36 * S; L.bottom = this.h - 34 * S;
      L.cx = Math.max(118, Math.min(this.w * 0.36, 180));
      L.labelX = L.cx + L.gap + 34 * S;
    } else {
      L.left = 80 * S; L.right = this.w - 120 * S;
      L.cy = this.h * 0.56;
    }
    this.L = L;
    this.skyline = null;
  }

  pt(k, dir = 0) {
    const L = this.L;
    const off = dir === 1 ? -L.gap : dir === -1 ? L.gap : 0;
    if (this.vertical) return { x: L.cx + off, y: L.top + (k * (L.bottom - L.top)) / (N - 1) };
    return { x: L.left + (k * (L.right - L.left)) / (N - 1), y: L.cy + off };
  }

  trainPos(tr) {
    if (tr.state === 'run') {
      const a = this.pt(tr.at, tr.dir);
      const b = this.pt(tr.at + tr.dir, tr.dir);
      const p = 0.08 + tr.prog * 0.84;
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
    }
    return this.pt(tr.at, tr.dir);
  }

  float(k, text, color, dir = 0) {
    const p = this.pt(k, dir);
    this.floaters.push({ x: p.x, y: p.y, text, color, born: performance.now() });
  }

  // ------------------------------------------------------------------
  draw(g, now) {
    const { ctx } = this;
    this.hits = [];
    const f = Math.min(1, Math.max(0, (g.t - SERVICE_START) / (SERVICE_END - SERVICE_START)));
    this.drawSky(f, now);
    const incs = activeIncidents(g);
    this.drawLine(g, incs);
    this.drawNeighbours();
    for (let k = 0; k < N; k++) this.drawStation(g, k, incs, now);
    const garage = { 0: 0, [N - 1]: 0 };
    for (const tr of g.trains) {
      if (tr.state === 'depot') continue;
      if (tr.state === 'layover') { garage[tr.at]++; continue; }
      this.drawTrain(g, tr, now);
    }
    this.drawGarage(0, garage[0]);
    this.drawGarage(N - 1, garage[N - 1]);
    for (const inc of incs) this.drawIncident(g, inc, now);
    this.drawFloaters(now);
    ctx.textBaseline = 'alphabetic';
  }

  drawSky(f, now) {
    const { ctx, w, h } = this;
    let i = 1;
    while (i < SKY.length - 1 && f > SKY[i][0]) i++;
    const [f0, t0, b0] = SKY[i - 1];
    const [f1, t1, b1] = SKY[i];
    const t = Math.min(1, Math.max(0, (f - f0) / (f1 - f0)));
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, mix(t0, t1, t));
    gr.addColorStop(1, mix(b0, b1, t));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);

    // Étoiles qui s'effacent avec le jour
    const starA = Math.max(0, 1 - f / 0.3);
    if (starA > 0) {
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(now / 700 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.5 * tw) * starA})`;
        ctx.fillRect(s.x * w, s.y * h, 1.6, 1.6);
      }
    }
    // Lueur du soleil levant
    const sun = Math.max(0, 1 - Math.abs(f - 0.42) / 0.3);
    if (sun > 0) {
      const sg = ctx.createRadialGradient(w * 0.7, h * 1.05, 0, w * 0.7, h * 1.05, Math.max(w, h) * 0.8);
      sg.addColorStop(0, `rgba(255,190,110,${0.45 * sun})`);
      sg.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawSkyline(f);
  }

  drawSkyline(f) {
    const { ctx, w, h } = this;
    if (!this.skyline) {
      const bld = [];
      let x = 0;
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      while (x < w) {
        const bw = 14 + rnd() * 34;
        const tower = rnd() < 0.12;
        const bh = tower ? 70 + rnd() * 90 : 18 + rnd() * 46;
        bld.push({ x, w: bw, h: bh, lights: Array.from({ length: Math.floor(bh / 9) * 2 }, () => rnd()) });
        x += bw + 2 + rnd() * 4;
      }
      this.skyline = bld;
    }
    const base = h;
    const light = Math.max(0, 1 - f / 0.55);
    ctx.fillStyle = mix('#050824', '#1a2c73', Math.min(1, f * 1.3));
    for (const b of this.skyline) {
      ctx.globalAlpha = 0.85;
      ctx.fillRect(b.x, base - b.h, b.w, b.h);
      if (light > 0) {
        ctx.globalAlpha = light * 0.8;
        ctx.save();
        ctx.fillStyle = '#ffcf6b';
        let i = 0;
        for (let yy = base - b.h + 6; yy < base - 4; yy += 9) {
          for (let xx = b.x + 3; xx < b.x + b.w - 4; xx += 8) {
            if (b.lights[i++ % b.lights.length] > 0.72) ctx.fillRect(xx, yy, 3, 3);
          }
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawLine(g, incs) {
    const { ctx, L } = this;
    const a = this.pt(0);
    const b = this.pt(N - 1);
    // ombre portée
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = L.lw + 8;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = C.u;
    ctx.lineWidth = L.lw;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    // Rails des deux sens
    for (const dir of [1, -1]) {
      const p0 = this.pt(0, dir);
      const p1 = this.pt(N - 1, dir);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }

    // États des tronçons
    for (const i of incs) {
      const segs = i.segs ?? (i.s != null ? [i.s] : []);
      if (!segs.length || i.type === 'malaise' || i.type === 'panne') continue;
      let col = C.late;
      let dash = [6 * this.s, 5 * this.s];
      if (i.type === 'personnes' && !i.alt) { col = C.cancel; dash = []; }
      if (i.type === 'ligneL') col = NEIGHBOURS.L;
      if (i.type === 'ligneN') col = NEIGHBOURS.N;
      if (i.type === 'signal' && i.alt) { col = C.white; dash = [2 * this.s, 6 * this.s]; }
      for (const s of segs) {
        const p0 = this.pt(s);
        const p1 = this.pt(s + 1);
        ctx.strokeStyle = col;
        ctx.lineWidth = L.lw * 0.55;
        ctx.setLineDash(dash);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  drawNeighbours() {
    const { ctx, L, s } = this;
    const tag = (letters, segs) => {
      const a = this.pt(segs[0]);
      const b = this.pt(segs[segs.length - 1] + 1);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const sz = 16 * s;
      letters.forEach((l, i) => {
        let x;
        let y;
        if (this.vertical) { x = L.cx - L.gap - 46 * s - i * (sz + 4); y = m.y; }
        else { x = m.x + (i - (letters.length - 1) / 2) * (sz + 4); y = L.cy + L.gap + 46 * s; }
        ctx.fillStyle = NEIGHBOURS[l];
        this.round(x - sz / 2, y - sz / 2, sz, sz, 3 * s);
        ctx.fill();
        ctx.fillStyle = l === 'C' ? '#1d1d1d' : C.white;
        ctx.font = `900 ${11 * s}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l, x, y + 0.5);
      });
      // accolade discrète
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (this.vertical) {
        const x = L.cx - L.gap - 30 * s;
        ctx.moveTo(x + 4, a.y + 8); ctx.lineTo(x, a.y + 8); ctx.lineTo(x, b.y - 8); ctx.lineTo(x + 4, b.y - 8);
      } else {
        const y = L.cy + L.gap + 30 * s;
        ctx.moveTo(a.x + 8, y - 4); ctx.lineTo(a.x + 8, y); ctx.lineTo(b.x - 8, y); ctx.lineTo(b.x - 8, y - 4);
      }
      ctx.stroke();
    };
    tag(['L'], LINE_U.sharedL);
    tag(['N', 'C'], LINE_U.sharedNC);
  }

  drawStation(g, k, incs, now) {
    const { ctx, L, s } = this;
    const st = LINE_U.stations[k];
    const c = this.pt(k);
    const blocked = incs.some((i) => i.type === 'colis' && i.k === k && !i.through);
    const node = incs.some((i) => i.type === 'derangement' && i.k === k);

    // Affluence : trois crans, de chaque côté
    for (const dir of [1, -1]) {
      if ((dir === 1 && k === N - 1) || (dir === -1 && k === 0)) continue;
      const w = g.waiting[k][dir === 1 ? 0 : 1];
      const lvl = w > 650 ? 3 : w > 280 ? 2 : w > 60 ? 1 : 0;
      const col = lvl === 3 ? C.cancel : lvl === 2 ? C.late : C.good;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < lvl ? col : 'rgba(255,255,255,0.12)';
        const bw = 4 * s;
        const bh = (5 + i * 3) * s;
        if (this.vertical) {
          const x = dir === 1 ? L.cx - L.gap - 16 * s - i * (bw + 2) : L.cx + L.gap + 12 * s + i * (bw + 2);
          ctx.fillRect(x, c.y + 5 * s - bh, bw, bh);
        } else {
          const y = dir === 1 ? L.cy - L.gap - 16 * s : L.cy + L.gap + 12 * s;
          ctx.fillRect(c.x - 7 * s + i * (bw + 2), dir === 1 ? y - bh + 4 * s : y, bw, bh);
        }
      }
      if (lvl === 3 && Math.sin(now / 200 + k) > 0.2) {
        ctx.fillStyle = 'rgba(227,59,69,0.25)';
        const p = this.pt(k, dir);
        ctx.beginPath(); ctx.arc(p.x, p.y, 15 * s, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Plot de gare
    const r = (st.terminus ? 10 : 7) * s;
    ctx.fillStyle = blocked ? C.cancel : C.white;
    ctx.strokeStyle = node ? C.yellow : st.terminus ? C.white : C.uDark;
    ctx.lineWidth = (node ? 4 : 3) * s;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (st.terminus) {
      ctx.fillStyle = C.u;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    if (node) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = `rgba(255,210,0,${0.3 + 0.5 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, (26 + pulse * 5) * s, 0, Math.PI * 2); ctx.stroke();
    }

    // Nom
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = C.white;
    ctx.font = `${st.terminus ? 900 : 700} ${(st.terminus ? 16 : 14) * s}px ${FONT}`;
    ctx.textBaseline = 'middle';
    if (this.vertical) {
      ctx.textAlign = 'left';
      ctx.fillText(st.short, L.labelX, c.y);
    } else {
      ctx.translate(c.x + 2, L.cy - L.gap - 40 * s);
      ctx.rotate(-Math.PI / 5);
      ctx.textAlign = 'left';
      ctx.fillText(this.w > 1000 ? st.name : st.short, 0, 0);
    }
    ctx.restore();
  }

  drawGarage(k, n) {
    if (!n) return;
    const { ctx, L, s } = this;
    const c = this.pt(k);
    let x = c.x;
    let y = c.y;
    if (this.vertical) y += (k === 0 ? -24 : 26) * s;
    else y += L.gap + 62 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    this.round(x - 26 * s, y - 9 * s, 52 * s, 18 * s, 9 * s);
    ctx.fill();
    ctx.fillStyle = C.soft;
    ctx.font = `800 ${10 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${n} au garage`, x, y + 0.5);
    void L;
  }

  drawTrain(g, tr, now) {
    const { ctx, s } = this;
    const p = this.trainPos(tr);
    const delay = trainDelay(g, tr);
    const mins = Math.floor(delay / 60);
    const len = 30 * s;
    const wid = 13 * s;
    const sel = this.selected && this.selected.kind === 'train' && this.selected.id === tr.id;
    const ang = this.vertical ? (tr.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (tr.dir === 1 ? 0 : Math.PI);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.globalAlpha = tr.hlp ? 0.45 : 1;
    // phare
    if (!tr.hlp) {
      const hg = ctx.createRadialGradient(len / 2, 0, 0, len / 2, 0, 26 * s);
      hg.addColorStop(0, 'rgba(255,236,170,0.55)');
      hg.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(len / 2, 0, 26 * s, -0.7, 0.7); ctx.lineTo(len / 2, 0); ctx.fill();
    }
    // caisse
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(-len / 2 + 4 * s, -wid / 2);
    ctx.lineTo(len / 2 - 6 * s, -wid / 2);
    ctx.quadraticCurveTo(len / 2, -wid / 2, len / 2, 0);
    ctx.quadraticCurveTo(len / 2, wid / 2, len / 2 - 6 * s, wid / 2);
    ctx.lineTo(-len / 2 + 4 * s, wid / 2);
    ctx.quadraticCurveTo(-len / 2, wid / 2, -len / 2, wid / 2 - 4 * s);
    ctx.lineTo(-len / 2, -wid / 2 + 4 * s);
    ctx.quadraticCurveTo(-len / 2, -wid / 2, -len / 2 + 4 * s, -wid / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // bande de livrée + remplissage
    const lf = Math.min(1, tr.load / tr.capacity);
    ctx.fillStyle = tr.serie === 'Z 50000' ? '#3a3f4a' : C.u;
    ctx.fillRect(-len / 2 + 3 * s, -1.5 * s, len - 9 * s, 3 * s);
    ctx.fillStyle = lf > 0.9 ? C.cancel : lf > 0.6 ? C.late : C.good;
    ctx.fillRect(-len / 2 + 3 * s, wid / 2 - 3.2 * s, (len - 9 * s) * lf, 2 * s);
    // contour d'état
    if (delay >= 120 || sel) {
      ctx.strokeStyle = sel ? C.yellow : delay >= 300 ? C.cancel : C.late;
      ctx.lineWidth = (sel ? 3 : 2.4) * s;
      this.round(-len / 2 - 2 * s, -wid / 2 - 2 * s, len + 4 * s, wid + 4 * s, 6 * s);
      ctx.stroke();
    }
    ctx.restore();

    // Feu rouge : train retenu
    if (tr.lock) {
      const o = this.outward(tr, 24 * s);
      const pulse = 0.6 + 0.4 * Math.sin(now / 160);
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(p.x + o.x, p.y + o.y, 8 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,60,60,${pulse})`;
      ctx.beginPath(); ctx.arc(p.x + o.x, p.y + o.y, 5 * s, 0, Math.PI * 2); ctx.fill();
    }

    // Pastille de retard / VIP
    const badgeAt = this.vertical ? { x: p.x + (tr.dir === 1 ? -1 : 1) * 30 * s, y: p.y } : { x: p.x, y: p.y + (tr.dir === 1 ? -1 : 1) * 22 * s };
    if (mins >= 2 && !tr.hlp) {
      const txt = `+${mins}`;
      ctx.font = `900 ${11 * s}px ${FONT}`;
      const tw = ctx.measureText(txt).width + 10 * s;
      ctx.fillStyle = delay >= 300 ? C.cancel : C.late;
      this.round(badgeAt.x - tw / 2, badgeAt.y - 8 * s, tw, 16 * s, 8 * s);
      ctx.fill();
      ctx.fillStyle = C.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, badgeAt.x, badgeAt.y + 0.5);
    }
    if (tr.vip) {
      const o = this.vertical ? { x: 0, y: -18 * s * tr.dir } : { x: -20 * s * tr.dir, y: 0 };
      ctx.fillStyle = C.yellow;
      ctx.font = `900 ${16 * s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', p.x + o.x, p.y + o.y);
    }

    // Feu du poste manuel
    if (tr.waitingAuth) {
      const o = this.outward(tr, 34 * s);
      const x = p.x + o.x;
      const y = p.y + o.y;
      const pulse = 0.5 + 0.5 * Math.sin(now / 150);
      ctx.fillStyle = `rgba(255,210,0,${0.25 + 0.3 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(x, y, 15 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.cancel;
      ctx.beginPath(); ctx.arc(x, y, 9 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.white;
      ctx.font = `900 ${9 * s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GO', x, y + 0.5);
      this.hits.push({ kind: 'auth', id: tr.id, x, y, r: 26 * s });
    }
    this.hits.push({ kind: 'train', id: tr.id, x: p.x, y: p.y, r: 24 * s, dir: tr.dir });
  }

  // Décalage vers l'extérieur de la ligne, côté du sens du train
  outward(tr, d) {
    if (this.vertical) return { x: tr.dir === 1 ? -d : d, y: 0 };
    return { x: 0, y: tr.dir === 1 ? -d : d };
  }

  incidentPos(g, inc) {
    if (inc.trainId != null) {
      const tr = g.trains.find((t) => t.id === inc.trainId);
      if (tr && tr.state !== 'depot' && tr.state !== 'layover') {
        const p = this.trainPos(tr);
        const o = this.outward(tr, 54 * this.s);
        return { x: p.x + o.x, y: p.y + o.y };
      }
      return null;
    }
    if (inc.k != null) return this.pt(inc.k);
    if (inc.s != null) {
      const a = this.pt(inc.s);
      const b = this.pt(inc.s + 1);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    return null;
  }

  drawIncident(g, inc, now) {
    const { ctx, s } = this;
    if (inc.type === 'derangement') return; // représenté par les feux sur les trains
    const p = this.incidentPos(g, inc);
    if (!p) return;
    const def = INCIDENTS[inc.type];
    const handled = !!inc.crewId || inc.alt;
    const sz = 26 * s;
    if (!handled) {
      const ph = (now / 1000) % 1;
      ctx.strokeStyle = `rgba(243,123,43,${0.8 * (1 - ph)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.7 + ph * 18 * s, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = handled ? C.ok : def.spec || def.alt ? C.late : '#6b74b8';
    this.round(p.x - sz / 2, p.y - sz / 2, sz, sz, 7 * s);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.white;
    ctx.font = `900 ${15 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, p.x, p.y + 1);
    // progression
    const frac = 1 - inc.left / inc.total;
    ctx.strokeStyle = handled ? C.white : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 0.72, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    if (this.selected && this.selected.kind === 'incident' && this.selected.id === inc.id) {
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.95, 0, Math.PI * 2); ctx.stroke();
    }
    this.hits.push({ kind: 'incident', id: inc.id, x: p.x, y: p.y, r: 28 * s });
  }

  drawFloaters(now) {
    const { ctx, s } = this;
    this.floaters = this.floaters.filter((f) => now - f.born < 2200);
    for (const f of this.floaters) {
      const age = (now - f.born) / 2200;
      const y = f.y - 20 * s - age * 40 * s;
      ctx.globalAlpha = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25;
      ctx.font = `900 ${12 * s}px ${FONT}`;
      const tw = ctx.measureText(f.text).width + 16 * s;
      const x = Math.min(this.w - tw / 2 - 6, Math.max(tw / 2 + 6, f.x));
      ctx.fillStyle = f.color;
      this.round(x - tw / 2, y - 11 * s, tw, 22 * s, 11 * s);
      ctx.fill();
      ctx.fillStyle = f.color === C.white ? C.deep : C.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, x, y + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  hit(x, y) {
    let best = null;
    let bd = Infinity;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      const score = d - (h.kind === 'auth' ? 14 : h.kind === 'incident' ? 8 : 0);
      if (d <= h.r && score < bd) { bd = score; best = h; }
    }
    return best;
  }

  round(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

export const COLORS = C;
