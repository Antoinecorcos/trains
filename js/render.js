// Rendu du TCO (tableau de contrôle optique) sur Canvas 2D.
import { LINE_U, INCIDENTS } from './data.js';
import { trainDelay, activeIncidents } from './sim.js';

const C = {
  bg: '#0d1219', grid: '#141c27', track: '#3a2230', trackLit: '#d63a74', station: '#e6ebf2',
  label: '#c5cfdc', muted: '#6c7a8e', info: '#ffcf33', ok: '#4cc38a', warn: '#f0a530', crit: '#ef5050',
  train: '#dfe6ee', panel: '#141b25', shared: '#4b5a6e',
};
const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const N = LINE_U.stations.length;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.hits = [];
    this.selected = null;
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
    // Échelle : un peu plus grand sur les grands écrans
    this.s = this.vertical ? Math.min(1.25, Math.max(1, this.h / 760)) : Math.min(1.7, Math.max(1, Math.min(this.w / 1000, this.h / 520)));
    const S = this.s;
    const L = {};
    if (this.vertical) {
      L.top = 34; L.bottom = this.h - 30;
      L.cx = Math.max(96, Math.min(this.w * 0.34, 170));
      L.gap = 9;
      L.barMax = Math.min(L.cx - 30, 70);
      L.barMax2 = 40;
      L.labelX = L.cx + 22 + L.barMax2 + 10;
    } else {
      L.left = 64 * S; L.right = this.w - 64 * S;
      L.cy = this.h * 0.54;
      L.gap = 10 * S;
      L.barMax = Math.min(80 * S, this.h * 0.2);
      L.barMax2 = L.barMax;
    }
    this.L = L;
  }

  // Point de la gare k sur la voie du sens dir (0 = axe central)
  pt(k, dir = 0) {
    const L = this.L;
    const off = dir === 1 ? -L.gap : dir === -1 ? L.gap : 0;
    if (this.vertical) {
      return { x: L.cx + off, y: L.top + (k * (L.bottom - L.top)) / (N - 1) };
    }
    return { x: L.left + (k * (L.right - L.left)) / (N - 1), y: L.cy + off };
  }

  trainPos(tr) {
    if (tr.state === 'run') {
      const a = this.pt(tr.at, tr.dir);
      const b = this.pt(tr.at + tr.dir, tr.dir);
      const p = tr.prog * 0.92 + 0.04;
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
    return this.pt(tr.at, tr.dir);
  }

  draw(g, now) {
    const { ctx, w, h, L } = this;
    this.hits = [];
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    // Trame du TCO
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0.5; y < h; y += 24) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const incs = activeIncidents(g);

    // Voies
    for (const dir of [1, -1]) {
      for (let s = 0; s < N - 1; s++) {
        const a = this.pt(s, dir);
        const b = this.pt(s + 1, dir);
        let col = C.trackLit;
        let dash = [];
        for (const i of incs) {
          if (i.s !== s) continue;
          if (i.type === 'personnes') { col = C.crit; dash = [6, 5]; }
          else if (i.type === 'signal') { col = C.warn; dash = [4, 4]; }
          else if (i.type === 'ligneL' && col === C.trackLit) { col = C.warn; dash = [2, 6]; }
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Annotations des voies partagées
    this.sharedTag(LINE_U.sharedL, 'Voies partagées · L');
    this.sharedTag(LINE_U.sharedNC, 'Voies partagées · N · C');

    // Gares
    for (let k = 0; k < N; k++) this.drawStation(g, k, incs, now);

    // Trains
    const garage = { 0: 0, [N - 1]: 0 };
    for (const tr of g.trains) {
      if (tr.state === 'depot') continue;
      if (tr.state === 'layover') { garage[tr.at]++; continue; }
      this.drawTrain(g, tr);
    }
    this.drawGarage(0, garage[0]);
    this.drawGarage(N - 1, garage[N - 1]);

    // Incidents
    for (const inc of incs) this.drawIncident(g, inc, now);
  }

  sharedTag(segs, text) {
    const { ctx, L } = this;
    const a = this.pt(segs[0], 0);
    const b = this.pt(segs[segs.length - 1] + 1, 0);
    ctx.save();
    ctx.strokeStyle = C.shared;
    ctx.fillStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.font = `600 ${10 * this.s}px ${FONT}`;
    if (this.vertical) {
      const x = L.cx - L.barMax - 26;
      ctx.beginPath();
      ctx.moveTo(x + 4, a.y + 6); ctx.lineTo(x, a.y + 6); ctx.lineTo(x, b.y - 6); ctx.lineTo(x + 4, b.y - 6);
      ctx.stroke();
      ctx.translate(x - 5, (a.y + b.y) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(text.toUpperCase(), 0, 0);
    } else {
      const y = L.cy + L.barMax + 42 * this.s;
      ctx.beginPath();
      ctx.moveTo(a.x + 8, y - 4); ctx.lineTo(a.x + 8, y); ctx.lineTo(b.x - 8, y); ctx.lineTo(b.x - 8, y - 4);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(text.toUpperCase(), (a.x + b.x) / 2, y + 13 * this.s);
    }
    ctx.restore();
  }

  drawStation(g, k, incs, now) {
    const { ctx, L } = this;
    const st = LINE_U.stations[k];
    const c = this.pt(k, 0);
    const blocked = incs.some((i) => i.type === 'colis' && i.k === k);
    const node = incs.some((i) => i.type === 'derangement' && i.k === k);

    // Barres d'affluence (voyageurs en attente)
    for (const dir of [1, -1]) {
      const w = g.waiting[k][dir === 1 ? 0 : 1];
      if ((dir === 1 && k === N - 1) || (dir === -1 && k === 0)) continue;
      const max = dir === 1 ? L.barMax : L.barMax2;
      const len = Math.max(2, Math.min(1, w / 900) * max);
      ctx.fillStyle = w > 650 ? C.crit : w > 280 ? C.warn : '#4a5a70';
      if (this.vertical) {
        if (dir === 1) ctx.fillRect(L.cx - 22 - len, c.y - 3, len, 6);
        else ctx.fillRect(L.cx + 22, c.y - 3, len, 6);
      } else {
        const o = L.gap + 12 * this.s;
        if (dir === 1) ctx.fillRect(c.x - 3, L.cy - o - len, 6, len);
        else ctx.fillRect(c.x - 3, L.cy + o, 6, len);
      }
    }

    // Plot de gare
    ctx.fillStyle = blocked ? C.crit : C.panel;
    ctx.strokeStyle = node ? C.warn : C.station;
    ctx.lineWidth = node ? 3 : 2;
    const big = st.terminus;
    if (this.vertical) this.roundRect(c.x - L.gap - 7, c.y - (big ? 8 : 6), 2 * L.gap + 14, big ? 16 : 12, 6);
    else { const q = this.s; this.roundRect(c.x - (big ? 8 : 6) * q, c.y - L.gap - 7 * q, (big ? 16 : 12) * q, 2 * L.gap + 14 * q, 6 * q); }
    ctx.fill();
    ctx.stroke();
    if (node) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = `rgba(240,165,48,${0.25 + 0.5 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 26 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Nom
    ctx.fillStyle = st.terminus ? C.station : C.label;
    ctx.font = `${st.terminus ? 700 : 600} ${(this.vertical ? 15 : 14) * this.s}px ${FONT}`;
    if (this.vertical) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.short, L.labelX, c.y);
    } else {
      ctx.save();
      ctx.translate(c.x + 4, L.cy - L.gap - 26 * this.s - L.barMax);
      ctx.rotate(-Math.PI / 5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.w > 1000 ? st.name : st.short, 0, 0);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawGarage(k, n) {
    if (!n) return;
    const { ctx, L } = this;
    const c = this.pt(k, 0);
    ctx.fillStyle = C.muted;
    ctx.font = `600 ${11 * this.s}px ${FONT}`;
    ctx.textAlign = 'center';
    let x = c.x;
    let y = c.y;
    if (this.vertical) y += k === 0 ? -20 : 24;
    else y += L.gap + 34 * this.s;
    ctx.fillText(`${n} EN GARAGE`, x, y);
  }

  drawTrain(g, tr) {
    const { ctx } = this;
    const p = this.trainPos(tr);
    const delay = trainDelay(g, tr);
    const mins = Math.floor(delay / 60);
    let fill = C.train;
    if (delay >= 300) fill = C.crit;
    else if (delay >= 120) fill = C.warn;
    const len = 24 * this.s;
    const wid = 11 * this.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!this.vertical) ctx.rotate(tr.dir === 1 ? 0 : Math.PI);
    else ctx.rotate(tr.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    // corps : nez dans le sens de marche
    ctx.beginPath();
    ctx.moveTo(-len / 2, -wid / 2);
    ctx.lineTo(len / 2 - 4, -wid / 2);
    ctx.lineTo(len / 2, 0);
    ctx.lineTo(len / 2 - 4, wid / 2);
    ctx.lineTo(-len / 2, wid / 2);
    ctx.closePath();
    if (tr.hlp) {
      ctx.fillStyle = C.bg;
      ctx.fill();
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      // charge
      const lf = Math.min(1, tr.load / 1100);
      ctx.fillStyle = 'rgba(13,18,25,0.55)';
      ctx.fillRect(-len / 2 + 2, -wid / 2 + 2, (len - 8) * lf, wid - 4);
    }
    if (this.selected && this.selected.kind === 'train' && this.selected.id === tr.id) {
      ctx.strokeStyle = C.info;
      ctx.lineWidth = 2;
      ctx.strokeRect(-len / 2 - 4, -wid / 2 - 4, len + 8, wid + 8);
    }
    ctx.restore();

    // Étiquette de retard
    if (mins >= 1 || tr.waitingAuth) {
      ctx.font = `600 ${11 * this.s}px ${MONO}`;
      ctx.fillStyle = delay >= 300 ? C.crit : delay >= 120 ? C.warn : C.label;
      const t = tr.waitingAuth ? '⏸' : `+${mins}'`;
      if (this.vertical) {
        ctx.textAlign = tr.dir === 1 ? 'right' : 'left';
        ctx.fillText(t, p.x + (tr.dir === 1 ? -14 : 14) * this.s, p.y + 4);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(t, p.x, p.y + (tr.dir === 1 ? -12 : 20) * this.s);
      }
    }
    this.hits.push({ kind: 'train', id: tr.id, x: p.x, y: p.y, r: 22 * this.s });
  }

  incidentPos(g, inc) {
    if (inc.trainId != null) {
      const tr = g.trains.find((t) => t.id === inc.trainId);
      if (tr && tr.state !== 'depot' && tr.state !== 'layover') {
        const p = this.trainPos(tr);
        const o = 27 * this.s;
        const off = this.vertical ? { x: tr.dir === 1 ? -o : o, y: 0 } : { x: 0, y: tr.dir === 1 ? -o : o };
        return { x: p.x + off.x, y: p.y + off.y };
      }
      return null;
    }
    if (inc.k != null) {
      const c = this.pt(inc.k, 0);
      return this.vertical ? { x: c.x, y: c.y } : { x: c.x, y: c.y };
    }
    if (inc.s != null) {
      const a = this.pt(inc.s, 0);
      const b = this.pt(inc.s + 1, 0);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    return null;
  }

  drawIncident(g, inc, now) {
    const { ctx } = this;
    const p = this.incidentPos(g, inc);
    if (!p) return;
    const def = INCIDENTS[inc.type];
    const handled = !!inc.crewId;
    const r = 13 * this.s;
    if (!handled && def.spec) {
      const pulse = (now / 900) % 1;
      ctx.strokeStyle = `rgba(255,207,51,${0.7 * (1 - pulse)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4 + pulse * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    // losange
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = handled ? C.panel : def.spec ? C.info : C.warn;
    ctx.strokeStyle = handled ? C.info : C.bg;
    ctx.lineWidth = 2;
    const s = r * 1.35;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.fillStyle = handled ? C.info : C.bg;
    ctx.font = `700 ${13 * this.s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, p.x, p.y + 1);
    ctx.textBaseline = 'alphabetic';
    // anneau de résolution
    const frac = 1 - inc.left / inc.total;
    ctx.strokeStyle = handled ? C.ok : 'rgba(230,235,242,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    if (this.selected && this.selected.kind === 'incident' && this.selected.id === inc.id) {
      ctx.strokeStyle = C.station;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.hits.push({ kind: 'incident', id: inc.id, x: p.x, y: p.y, r: 26 * this.s });
  }

  hit(x, y) {
    let best = null;
    let bd = Infinity;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      // les incidents passent avant les trains à distance égale
      const score = d - (h.kind === 'incident' ? 8 : 0);
      if (d <= h.r && score < bd) { bd = score; best = h; }
    }
    return best;
  }

  roundRect(x, y, w, h, r) {
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
