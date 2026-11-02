// Vue de côté : ciel, décors en parallaxe selon le quartier, voie, caténaire, quais, Z 2N.
import { STATIONS, PLATFORM, regionAt } from './route.js';

const FONT = '"Nunito Sans", "Avenir Next", Avenir, "Segoe UI", sans-serif';
const CAR = 26; // longueur d'une voiture (m)
const CARS = 4;
const U = '#c4245f';

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (h1, h2, t) => {
  const a = hex(h1);
  const b = hex(h2);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], Math.max(0, Math.min(1, t)))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
// Pseudo-aléatoire stable par objet (pour que le décor ne bouge pas d'une image à l'autre)
const hash = (n, salt = 0) => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
  return ((x >>> 0) % 100000) / 100000;
};

const CLOTHES = ['#2f4a8a', '#a33b3b', '#2c2c34', '#6b5b95', '#3d7a5e', '#c98a2b', '#5c6a7a', '#8a3d6b', '#1f6f8b', '#d4d0c8'];

export class World {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1;
    this.shake = 0;
    this.rain = Array.from({ length: 140 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), l: 0.5 + hash(i, 3) }));
    this.leaves = Array.from({ length: 40 }, (_, i) => ({ x: hash(i, 4), y: hash(i, 5), s: hash(i, 6) }));
    this.sparks = [];
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.portrait = window.innerHeight > window.innerWidth;
    this.baseK = this.portrait ? Math.max(9, Math.min(17, this.w / 24)) : Math.max(7, Math.min(13, Math.min(this.w / 70, this.h / 26)));
  }

  // ------------------------------------------------------------------
  draw(run, ghosts, now) {
    const { ctx, w, h } = this;
    const m = run.m;
    // Zoom dynamique : on recule avec la vitesse, on se rapproche à l'arrêt
    const zt = 1 - 0.36 * Math.min(1, run.v / 24);
    this.zoom += (zt - this.zoom) * 0.04;
    const k = this.baseK * this.zoom;
    this.k = k;
    const noseScreen = w * lerp(0.7, 0.55, Math.min(1, run.v / 24));
    this.camX = run.x - noseScreen / k;
    this.railY = h * (this.portrait ? 0.62 : 0.72);
    const light = m.light;
    const rain = m.weather === 'rain';
    this.light = light;

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.9;
      if (this.shake < 0.3) this.shake = 0;
    }
    ctx.save();
    ctx.translate(sx, sy);

    this.drawSky(light, rain);
    this.drawFar(light, rain);
    this.drawMid(light, rain);
    this.drawGround(run, light);
    this.drawCatenaryPoles(true);
    this.drawPlatforms(run, now, 'back');
    this.drawTrack(run);
    this.drawTrackside(run, now);
    for (const g of ghosts) this.drawTrain(g.x, g.v ?? 0, run, now, { ghost: true, label: g.label });
    this.drawTrain(run.x, run.v, run, now, {});
    this.drawPlatforms(run, now, 'front');
    this.drawCatenaryWire();
    this.drawForeground(run);
    this.drawWeather(run, rain, now);
    this.drawSparks(run);

    // Teinte d'ambiance (aube, nuit)
    if (light < 0.75) {
      ctx.fillStyle = `rgba(28,36,96,${(0.75 - light) * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (rain) {
      ctx.fillStyle = 'rgba(70,80,100,0.16)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  X(wx) { return (wx - this.camX) * this.k; }

  // Couche en parallaxe : appelle item(n, sx) pour chaque élément visible espacé de `spacing` m
  layer(par, spacingPx, salt, item) {
    const k = this.k;
    const spacing = spacingPx / this.baseK;
    const start = this.camX * par;
    const end = start + this.w / k;
    for (let n = Math.floor(start / spacing) - 1; n <= Math.ceil(end / spacing) + 1; n++) {
      const px = (n * spacing - start) * k;
      item(n, px, hash(n, salt), (n * spacing) / par);
    }
  }

  // Objets de bord de voie espacés en mètres réels
  layerM(spacing, item) {
    const k = this.k;
    for (let n = Math.floor(this.camX / spacing) - 1; n <= Math.ceil((this.camX + this.w / k) / spacing) + 1; n++) {
      item(n, (n * spacing - this.camX) * k);
    }
  }

  drawSky(light, rain) {
    const { ctx, w, h } = this;
    let top = mix('#1b2160', '#4f86d0', light);
    let bot = mix('#f0a070', '#cfe2f4', Math.max(0, (light - 0.35) / 0.65));
    if (light < 0.35) bot = mix('#3a2f6e', '#f0a070', light / 0.35);
    if (rain) { top = mix(top, '#5d6576', 0.65); bot = mix(bot, '#9aa2b0', 0.6); }
    const g = ctx.createLinearGradient(0, 0, 0, this.railY);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (!rain) {
      // soleil bas sur l'horizon
      const sunY = lerp(this.railY * 0.95, this.railY * 0.25, light);
      const sg = ctx.createRadialGradient(w * 0.8, sunY, 0, w * 0.8, sunY, h * 0.6);
      sg.addColorStop(0, `rgba(255,${Math.round(lerp(170, 245, light))},140,${0.55 - light * 0.25})`);
      sg.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(255,${Math.round(lerp(190, 250, light))},${Math.round(lerp(150, 225, light))},0.95)`;
      ctx.beginPath(); ctx.arc(w * 0.8, sunY, h * 0.045, 0, Math.PI * 2); ctx.fill();
      // nuages
      ctx.fillStyle = `rgba(255,255,255,${0.12 + light * 0.18})`;
      this.layer(0.02, 260, 7, (n, x, r) => {
        if (r < 0.45) return;
        const y = h * (0.08 + hash(n, 8) * 0.22);
        const s = 18 + hash(n, 9) * 30;
        ctx.beginPath();
        ctx.ellipse(x, y, s * 2.2, s * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(x + s, y - s * 0.3, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  drawFar(light, rain) {
    const { ctx } = this;
    const base = this.railY - this.k * 1.0;
    const u = this.railY / 100;
    const sky = mix('#f0a070', '#cfe2f4', light);
    const col = rain ? '#6c7488' : mix(sky, '#27306a', 0.5);
    const lit = `rgba(255,236,170,${Math.max(0, 0.7 - light) * 0.5})`;
    this.layer(0.05, 38, 11, (n, x, r, wx) => {
      const reg = regionAt(wx);
      ctx.fillStyle = col;
      if (reg === 'defense') {
        const ht = (28 + r * 46) * u;
        const wd = (7 + hash(n, 12) * 7) * u;
        ctx.fillRect(x, base - ht, wd, ht);
        if (hash(n, 13) > 0.55) {
          ctx.beginPath();
          ctx.moveTo(x + wd, base - ht * 0.7);
          ctx.lineTo(x + wd + 4 * u, base - ht * 0.62);
          ctx.lineTo(x + wd + 4 * u, base);
          ctx.lineTo(x + wd, base);
          ctx.fill();
        }
        ctx.fillStyle = lit;
        for (let yy = base - ht + 4; yy < base - 4; yy += 5) ctx.fillRect(x + 2, yy, wd - 4, 1.2);
      } else if (reg === 'forest') {
        ctx.beginPath();
        ctx.ellipse(x, base, (16 + r * 10) * u, (9 + r * 9) * u, 0, Math.PI, 0);
        ctx.fill();
      } else if (reg === 'versailles') {
        const wd = (10 + r * 8) * u;
        const ht = (7 + r * 4) * u;
        ctx.fillRect(x, base - ht, wd, ht);
        ctx.beginPath();
        ctx.moveTo(x - 1, base - ht);
        ctx.lineTo(x + 2 * u, base - ht - 3.5 * u);
        ctx.lineTo(x + wd - 2 * u, base - ht - 3.5 * u);
        ctx.lineTo(x + wd + 1, base - ht);
        ctx.fill();
        if (hash(n, 14) > 0.8) ctx.fillRect(x + wd * 0.45, base - ht - 14 * u, 1.6 * u, 11 * u);
      } else if (reg === 'newtown') {
        const ht = (10 + r * 18) * u;
        ctx.fillRect(x, base - ht, (8 + r * 6) * u, ht);
        ctx.fillStyle = lit;
        ctx.fillRect(x + 2, base - ht + 3, (8 + r * 6) * u - 4, 2);
      } else if (reg === 'fields' || reg === 'plain') {
        if (r > 0.5) {
          ctx.beginPath();
          ctx.ellipse(x, base, (6 + r * 6) * u, (3 + r * 4) * u, 0, Math.PI, 0);
          ctx.fill();
        } else if (r < 0.12) {
          ctx.fillRect(x, base - 16 * u, 0.6 * u, 16 * u);
          ctx.fillRect(x - 3 * u, base - 15 * u, 6 * u, 0.5 * u);
        }
      } else {
        const ht = (9 + r * 12) * u;
        ctx.fillRect(x, base - ht, (8 + r * 5) * u, ht);
      }
    });
  }

  drawMid(light, rain) {
    const { ctx } = this;
    const base = this.railY - this.k * 0.6;
    const u = this.railY / 100;
    const sky = mix('#f0a070', '#cfe2f4', light);
    const dark = rain ? '#4b5266' : mix(sky, '#1b2350', 0.75);
    const green = rain ? '#3f5a4c' : mix('#1f3a2c', '#3f7a52', light);
    const greenHi = rain ? '#4d6a5a' : mix('#2a4a36', '#5a9a62', light);
    this.layer(0.3, 30, 21, (n, x, r, wx) => {
      const reg = regionAt(wx);
      const tree = reg === 'forest' || (reg === 'plain' && r > 0.45) || (reg === 'fields' && r > 0.7) || (reg === 'versailles' && r > 0.75);
      if (tree) {
        const s = (5 + r * 6) * u;
        ctx.fillStyle = '#2b2620';
        ctx.fillRect(x - 0.4 * u, base - s * 1.1, 0.9 * u, s * 1.1);
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(x, base - s * 1.45, s * 0.75, 0, Math.PI * 2);
        ctx.arc(x - s * 0.5, base - s * 1.05, s * 0.55, 0, Math.PI * 2);
        ctx.arc(x + s * 0.5, base - s * 1.1, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = greenHi;
        ctx.beginPath(); ctx.arc(x - s * 0.2, base - s * 1.65, s * 0.35, 0, Math.PI * 2); ctx.fill();
        return;
      }
      if (reg === 'fields') return;
      ctx.fillStyle = dark;
      const ht = (reg === 'defense' ? 16 : reg === 'newtown' ? 12 : 7) * u + r * (reg === 'defense' ? 22 : 10) * u;
      const wd = (8 + hash(n, 22) * 8) * u;
      ctx.fillRect(x, base - ht, wd, ht);
      if (reg === 'urban' || reg === 'plain' || reg === 'versailles') {
        ctx.beginPath();
        ctx.moveTo(x - 1, base - ht);
        ctx.lineTo(x + wd * 0.5, base - ht - 4 * u);
        ctx.lineTo(x + wd + 1, base - ht);
        ctx.fill();
      }
      // fenêtres
      const on = Math.max(0, 0.75 - light) * 1.2;
      for (let yy = base - ht + 2 * u; yy < base - 2 * u; yy += 3.2 * u) {
        for (let xx = x + 1.5 * u; xx < x + wd - 2 * u; xx += 2.8 * u) {
          const hv = hash(n * 131 + Math.round((yy - base) / u) * 7 + Math.round((xx - x) / u), 23);
          ctx.fillStyle = hv > 0.6 && on > 0 ? `rgba(255,214,130,${on})` : 'rgba(255,255,255,0.06)';
          ctx.fillRect(xx, yy, 1.2 * u, 1.6 * u);
        }
      }
    });
  }

  drawGround(run, light) {
    const { ctx, w, h } = this;
    const y = this.railY;
    const reg = regionAt(run.x);
    const grass = reg === 'defense' || reg === 'urban' ? '#55606c' : mix('#3c5a3a', '#6f9a5a', light);
    // remblai derrière la voie
    ctx.fillStyle = mix(grass, '#000000', 0.15);
    ctx.fillRect(0, y - this.k * 0.6, w, this.k * 0.6);
    // ballast
    ctx.fillStyle = '#6d6560';
    ctx.fillRect(0, y, w, this.k * 0.9);
    ctx.fillStyle = '#5a534e';
    ctx.fillRect(0, y + this.k * 0.9, w, this.k * 0.35);
    // talus devant
    ctx.fillStyle = grass;
    ctx.fillRect(0, y + this.k * 1.25, w, h - y);
  }

  drawTrack(run) {
    const { ctx, k } = this;
    const y = this.railY;
    // feuilles mortes sur la voie
    for (const z of run.m.leaves) {
      const a = this.X(z.from);
      const b = this.X(z.to);
      if (b < 0 || a > this.w) continue;
      ctx.fillStyle = 'rgba(176,96,32,0.55)';
      ctx.fillRect(a, y - 2, b - a, k * 0.5);
      for (let wx = Math.ceil(z.from); wx < z.to; wx += 1.3) {
        const x = this.X(wx);
        if (x < -5 || x > this.w + 5) continue;
        ctx.fillStyle = hash(wx * 10, 31) > 0.5 ? '#c4702a' : '#8e4a1c';
        ctx.fillRect(x, y - 1 + hash(wx * 10, 32) * k * 0.4, 3, 2);
      }
    }
    // traverses
    ctx.fillStyle = '#3e3733';
    const sp = 0.7;
    const start = Math.floor(this.camX / sp) * sp;
    for (let wx = start; wx < this.camX + this.w / k + sp; wx += sp) {
      ctx.fillRect(this.X(wx), y + 1, Math.max(2, k * 0.28), k * 0.32);
    }
    // rail
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(0, y - 2, this.w, 3);
    ctx.fillStyle = '#d8dde3';
    ctx.fillRect(0, y - 2, this.w, 1);
  }

  drawCatenaryPoles() {
    const { ctx, k } = this;
    const y = this.railY;
    this.layerM(48, (n, x) => {
      ctx.fillStyle = '#5c636d';
      ctx.fillRect(x, y - k * 7.6, Math.max(2, k * 0.25), k * 7.6);
      ctx.fillRect(x - k * 0.2, y - k * 7.2, k * 3.2, Math.max(1.5, k * 0.15));
      ctx.fillStyle = '#7b828c';
      ctx.fillRect(x + k * 2.6, y - k * 7.3, 2, k * 0.9);
    });
    this.poleN = true;
  }

  drawCatenaryWire() {
    const { ctx, k } = this;
    const y = this.railY;
    ctx.strokeStyle = 'rgba(40,44,52,0.85)';
    ctx.lineWidth = 1.2;
    // fil porteur avec flèche entre les poteaux
    ctx.beginPath();
    this.layerM(48, (n, x) => {
      const x2 = x + 48 * k;
      ctx.moveTo(x + k * 2.6, y - k * 7.3);
      ctx.quadraticCurveTo(x + k * 2.6 + 24 * k, y - k * 6.3, x2 + k * 2.6, y - k * 7.3);
    });
    ctx.stroke();
    // fil de contact
    ctx.beginPath();
    ctx.moveTo(0, y - k * 6.1);
    ctx.lineTo(this.w, y - k * 6.1);
    ctx.stroke();
  }

  drawTrackside(run, now) {
    const { ctx, k } = this;
    const y = this.railY;
    // Panneaux de limitation (TIV) et de reprise
    for (const z of run.m.limits) {
      this.board(this.X(z.from - 30), String(z.kmh), '#ffffff', '#111111');
      this.board(this.X(z.to + 10), 'R', '#ffffff', '#111111');
    }
    // Signaux
    for (const s of run.signals) {
      this.signal(this.X(s.x), s.state === 'red' ? 'red' : 'green');
      this.signal(this.X(s.warn), s.state === 'red' ? 'yellow' : 'green', true);
    }
    // Chantiers
    for (const wz of run.works) {
      for (let wx = wz.from; wx < wz.to; wx += 9) {
        const x = this.X(wx);
        if (x < -30 || x > this.w + 30) continue;
        const i = Math.round(wx);
        this.worker(x + k * 2, y + k * 0.9, wz.warned, now, i);
      }
      const x0 = this.X(wz.from - 60);
      if (x0 > -40 && x0 < this.w + 40) this.board(x0, '⚠', '#ffd200', '#111111');
    }
    // Animaux
    for (const an of run.animals) {
      let x = this.X(an.x);
      let yy = y - 1;
      let alpha = 1;
      if (an.state === 'fled') {
        const t = run.t - an.fleeT;
        x += t * 10 * k;
        yy += t * 4 * k;
        alpha = Math.max(0, 1 - t / 1.5);
      }
      if (an.state === 'hit') continue;
      if (alpha <= 0 || x < -40 || x > this.w + 40) continue;
      ctx.globalAlpha = alpha;
      this.boar(x, yy, now, an.state === 'fled');
      ctx.globalAlpha = 1;
    }
  }

  board(x, text, bg, fg) {
    if (x < -30 || x > this.w + 30) return;
    const { ctx, k } = this;
    const y = this.railY;
    ctx.fillStyle = '#4c525a';
    ctx.fillRect(x, y - k * 3.2, 2, k * 3.2);
    const s = Math.max(14, k * 1.5);
    ctx.fillStyle = bg;
    ctx.fillRect(x - s / 2 + 1, y - k * 3.2 - s, s, s);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - s / 2 + 1, y - k * 3.2 - s, s, s);
    ctx.fillStyle = fg;
    ctx.font = `900 ${s * 0.55}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 1, y - k * 3.2 - s / 2 + 1);
  }

  signal(x, state, warn = false) {
    if (x < -30 || x > this.w + 30) return;
    const { ctx, k } = this;
    const y = this.railY;
    const top = y - k * 5.2;
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(x, top, Math.max(2, k * 0.2), k * 5.2);
    const pw = Math.max(9, k * 1.1);
    const ph = pw * 1.9;
    ctx.fillStyle = '#111317';
    ctx.fillRect(x - pw / 2 + 1, top - ph, pw, ph);
    const col = state === 'red' ? '#ff3b3b' : state === 'yellow' ? '#ffc21a' : '#2ee07a';
    const cy = state === 'red' ? top - ph * 0.72 : top - ph * 0.28;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + 1, cy, pw * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (warn) {
      ctx.fillStyle = '#ffd200';
      ctx.fillRect(x - pw / 2 + 1, top - 3, pw, 3);
    }
  }

  worker(x, y, warned, now, i) {
    const { ctx, k } = this;
    const s = k;
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(x - s * 0.3, y - s * 1.5, s * 0.6, s * 0.8);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(x - s * 0.3, y - s * 1.2, s * 0.6, s * 0.12);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(x - s * 0.25, y - s * 0.7, s * 0.2, s * 0.7);
    ctx.fillRect(x + s * 0.05, y - s * 0.7, s * 0.2, s * 0.7);
    ctx.fillStyle = '#d9a37a';
    ctx.beginPath(); ctx.arc(x, y - s * 1.75, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd200';
    ctx.beginPath(); ctx.arc(x, y - s * 1.85, s * 0.24, Math.PI, 0); ctx.fill();
    if (warned) {
      const wave = Math.sin(now / 120 + i) * 0.5;
      ctx.strokeStyle = '#ff7a1a';
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.25, y - s * 1.4);
      ctx.lineTo(x + s * (0.55 + wave * 0.2), y - s * 2.2);
      ctx.stroke();
    }
  }

  boar(x, y, now, running) {
    const { ctx, k } = this;
    const s = k * 0.9;
    const leg = running ? Math.sin(now / 50) * s * 0.25 : 0;
    ctx.fillStyle = '#3b2a20';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.75, s * 0.95, s * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - s * 0.95, y - s * 0.68, s * 0.42, s * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - s * 0.6 + leg, y - s * 0.4, s * 0.16, s * 0.42);
    ctx.fillRect(x + s * 0.45 - leg, y - s * 0.4, s * 0.16, s * 0.42);
    ctx.fillStyle = '#e8dccb';
    ctx.fillRect(x - s * 1.32, y - s * 0.62, s * 0.18, s * 0.06);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x - s * 1.05, y - s * 0.8, s * 0.06, 0, Math.PI * 2); ctx.fill();
  }

  // ------------------------------------------------------------------
  // Quais : partie arrière (abris, panneaux) et avant (dalle, voyageurs)
  drawPlatforms(run, now, part) {
    const { ctx, k } = this;
    const y = this.railY;
    for (let si = 0; si < STATIONS.length; si++) {
      const st = STATIONS[si];
      const a = this.X(st.x - PLATFORM);
      const b = this.X(st.x + 8);
      if (b < -50 || a > this.w + 50) continue;
      const stopIdx = run.m.stops.findIndex((s) => s.k === si);
      const isStop = stopIdx >= 0;
      if (part === 'back') {
        // abri vitré et panneaux de gare derrière la voie
        ctx.fillStyle = 'rgba(160,190,220,0.35)';
        for (let wx = st.x - PLATFORM + 30; wx < st.x - 20; wx += 55) {
          const x = this.X(wx);
          ctx.fillRect(x, y - k * 3.6, k * 9, k * 2.6);
          ctx.fillStyle = '#4b535e';
          ctx.fillRect(x - 2, y - k * 3.8, k * 9 + 4, k * 0.3);
          ctx.fillStyle = 'rgba(160,190,220,0.35)';
        }
        continue;
      }
      // dalle de quai devant la voie
      const top = y + k * 0.15;
      ctx.fillStyle = '#8f949a';
      ctx.fillRect(a, top, b - a, k * 1.4);
      ctx.fillStyle = '#b8bcc2';
      ctx.fillRect(a, top, b - a, k * 0.32);
      ctx.fillStyle = '#ffd200';
      ctx.fillRect(a, top + k * 0.32, b - a, Math.max(2, k * 0.12));
      ctx.fillStyle = '#6c7177';
      ctx.fillRect(a, top + k * 1.4, b - a, k * 0.25);
      // panneaux de nom de gare sur le quai
      for (const wx of [st.x - PLATFORM + 14, st.x - PLATFORM * 0.5]) this.stationSign(this.X(wx), top - k * 3.1, st.name);
      // repère d'arrêt (en bout de quai)
      const mx = this.X(st.x);
      if (isStop) {
        ctx.fillStyle = '#2b2f36';
        ctx.fillRect(mx - 1, top - k * 2.6, 2, k * 2.6);
        const s = Math.max(12, k * 1.2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(mx - s / 2, top - k * 2.6 - s, s, s);
        ctx.fillStyle = U;
        ctx.beginPath();
        ctx.moveTo(mx - s * 0.32, top - k * 2.6 - s * 0.72);
        ctx.lineTo(mx + s * 0.32, top - k * 2.6 - s * 0.72);
        ctx.lineTo(mx, top - k * 2.6 - s * 0.18);
        ctx.fill();
        ctx.fillStyle = '#ffd200';
        ctx.fillRect(mx - 1, top, 3, k * 0.32);
      }
      // voyageurs
      if (isStop) this.people(run, stopIdx, st, top, now);
    }
  }

  stationSign(x, y, name) {
    if (x < -150 || x > this.w + 20) return;
    const { ctx, k } = this;
    ctx.font = `800 ${Math.max(9, k * 0.95)}px ${FONT}`;
    const tw = ctx.measureText(name).width + k * 1.4;
    ctx.fillStyle = '#4c525a';
    ctx.fillRect(x + tw * 0.2, y + k * 1.5, 2, k * 1.6);
    ctx.fillRect(x + tw * 0.8, y + k * 1.5, 2, k * 1.6);
    ctx.fillStyle = '#1b2c9f';
    ctx.fillRect(x, y, tw, k * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + k * 0.7, y + k * 0.78);
  }

  people(run, stopIdx, st, top, now) {
    const { ctx, k } = this;
    const stop = run.m.stops[stopIdx];
    const n = Math.min(26, Math.round(stop.pax / 2));
    let boardedN = 0;
    let doorsOpen = false;
    if (run.stopI === stopIdx && run.doors && run.phase !== 'run') {
      boardedN = (run.doors.boarded / stop.pax) * n;
      doorsOpen = run.doors.state === 'open' || run.doors.state === 'opening';
    } else if (run.stopI > stopIdx) return;
    for (let i = 0; i < n; i++) {
      const r1 = hash(i, st.x);
      const r2 = hash(i, st.x + 1);
      let wx = st.x - 8 - r1 * (PLATFORM - 20);
      let alpha = 1;
      if (doorsOpen && i < boardedN + 1.5) {
        // marche vers la porte la plus proche puis disparaît
        const door = nearestDoor(run.x, wx);
        const f = Math.min(1, Math.max(0, boardedN + 1.5 - i) / 1.5);
        wx = lerp(wx, door, f);
        alpha = 1 - Math.max(0, (f - 0.6) / 0.4);
        if (i < boardedN - 0.2) continue;
      } else if (i < boardedN) continue;
      const x = this.X(wx);
      if (x < -10 || x > this.w + 10) continue;
      const hgt = (1.55 + r2 * 0.35) * k;
      const yb = top + k * (0.5 + r2 * 0.7);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = CLOTHES[Math.floor(r1 * CLOTHES.length)];
      this.rr(x - k * 0.26, yb - hgt * 0.78, k * 0.52, hgt * 0.55, k * 0.18);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(x - k * 0.2, yb - hgt * 0.26, k * 0.16, hgt * 0.26);
      ctx.fillRect(x + k * 0.04, yb - hgt * 0.26, k * 0.16, hgt * 0.26);
      ctx.fillStyle = ['#e0b18f', '#8d5a3b', '#c88e68', '#f0cfb2'][Math.floor(r2 * 4)];
      ctx.beginPath(); ctx.arc(x, yb - hgt * 0.88, k * 0.2, 0, Math.PI * 2); ctx.fill();
      if (r2 > 0.7) { ctx.fillStyle = '#3d3226'; ctx.fillRect(x + k * 0.22, yb - hgt * 0.5, k * 0.28, k * 0.36); }
    }
    ctx.globalAlpha = 1;
    // le retardataire qui court
    const rn = run.doors && run.stopI === stopIdx ? run.doors.runner : null;
    if (rn && rn.state === 'running') {
      const f = Math.min(1, (run.t - rn.appearAt) / (rn.arriveAt - rn.appearAt));
      const door = nearestDoor(run.x, run.x - 60);
      const wx = lerp(run.x - PLATFORM - 10, door, f);
      const x = this.X(wx);
      const yb = top + k * 0.9;
      const leg = Math.sin(now / 60) * k * 0.35;
      ctx.fillStyle = '#e33b45';
      this.rr(x - k * 0.28, yb - k * 1.5, k * 0.56, k * 0.9, k * 0.2);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - k * 0.1 + leg, yb - k * 0.62, k * 0.18, k * 0.62);
      ctx.fillRect(x - k * 0.1 - leg, yb - k * 0.62, k * 0.18, k * 0.62);
      ctx.fillStyle = '#e0b18f';
      ctx.beginPath(); ctx.arc(x + k * 0.1, yb - k * 1.72, k * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd200';
      ctx.font = `900 ${k * 1.1}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', x + k * 0.1, yb - k * 2.4);
    }
  }

  // ------------------------------------------------------------------
  // La rame : 4 voitures à deux niveaux, nez à droite
  drawTrain(nose, v, run, now, opts) {
    const { ctx, k } = this;
    const y = this.railY;
    const ghost = opts.ghost;
    if (this.X(nose) < -10 || this.X(nose - CAR * CARS) > this.w + 10) return;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.22;
    const night = this.light < 0.6;
    const doorsF = !ghost && run.doors && run.phase !== 'run' ? doorFraction(run) : 0;
    for (let c = 0; c < CARS; c++) {
      const x1 = this.X(nose - c * CAR);
      const x0 = this.X(nose - (c + 1) * CAR) + k * 0.6;
      if (x1 < -5 || x0 > this.w + 5) continue;
      const bodyTop = y - k * 4.35;
      const bodyBot = y - k * 0.95;
      const front = c === 0;
      // caisse
      ctx.fillStyle = ghost ? '#bcd0ff' : '#eef1f5';
      ctx.beginPath();
      ctx.moveTo(x0, bodyBot);
      ctx.lineTo(x0, bodyTop + k * 0.3);
      ctx.quadraticCurveTo(x0, bodyTop, x0 + k * 0.4, bodyTop);
      if (front) {
        ctx.lineTo(x1 - k * 2.2, bodyTop);
        ctx.quadraticCurveTo(x1 - k * 0.2, bodyTop + k * 0.4, x1, bodyTop + k * 2.0);
        ctx.lineTo(x1, bodyBot);
      } else {
        ctx.lineTo(x1 - k * 0.4, bodyTop);
        ctx.quadraticCurveTo(x1, bodyTop, x1, bodyTop + k * 0.3);
        ctx.lineTo(x1, bodyBot);
      }
      ctx.closePath();
      ctx.fill();
      if (ghost) { ctx.globalAlpha = 0.7; ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 0.22; continue; }
      // jupe et toit
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(x0, bodyBot - k * 0.45, x1 - x0, k * 0.45);
      ctx.fillStyle = '#c9ced6';
      ctx.fillRect(x0 + k * 0.4, bodyTop - k * 0.18, x1 - x0 - k * (front ? 2.6 : 0.8), k * 0.2);
      // bande de ligne
      ctx.fillStyle = U;
      ctx.fillRect(x0, y - k * 2.45, x1 - x0 - (front ? k * 0.1 : 0), k * 0.32);
      // baies vitrées (deux niveaux)
      const glass = night ? '#ffe6a6' : '#26324a';
      const doors = [nose - c * CAR - 6.5, nose - c * CAR - 19.5];
      for (const level of [0, 1]) {
        const wy = level ? bodyTop + k * 0.55 : y - k * 2.0;
        const wh = k * 0.95;
        for (let wx = nose - (c + 1) * CAR + 1.4; wx < nose - c * CAR - (front ? 3.4 : 1); wx += 2.15) {
          if (doors.some((d) => Math.abs(wx + 0.8 - d) < 1.7)) continue;
          const sx = this.X(wx);
          ctx.fillStyle = glass;
          this.rr(sx, wy, k * 1.6, wh, k * 0.25);
          if (!night) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(sx + k * 0.2, wy + k * 0.1, k * 0.5, wh * 0.4);
          }
        }
      }
      // portes
      for (const d of doors) {
        const dx = this.X(d);
        const dw = k * 1.9;
        const open = doorsF * dw * 0.48;
        ctx.fillStyle = '#1b1f27';
        ctx.fillRect(dx - dw / 2, bodyTop + k * 0.5, dw, bodyBot - bodyTop - k * 0.5);
        if (open > 1) {
          ctx.fillStyle = night ? 'rgba(255,220,150,0.9)' : 'rgba(255,236,190,0.55)';
          ctx.fillRect(dx - open, bodyTop + k * 0.6, open * 2, bodyBot - bodyTop - k * 0.7);
        }
        ctx.fillStyle = '#8a1440';
        ctx.fillRect(dx - dw / 2 - open, bodyTop + k * 0.5, dw / 2, bodyBot - bodyTop - k * 0.5);
        ctx.fillRect(dx + open, bodyTop + k * 0.5, dw / 2, bodyBot - bodyTop - k * 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(dx - dw / 2 - open + k * 0.2, bodyTop + k * 0.9, dw / 2 - k * 0.4, k * 0.9);
        ctx.fillRect(dx + open + k * 0.2, bodyTop + k * 0.9, dw / 2 - k * 0.4, k * 0.9);
      }
      // bogies et roues
      for (const bx of [nose - c * CAR - 3.2, nose - (c + 1) * CAR + 3.8]) {
        const cx = this.X(bx);
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(cx - k * 1.6, y - k * 1.0, k * 3.2, k * 0.5);
        for (const off of [-1.05, 1.05]) {
          const wx = cx + off * k;
          ctx.fillStyle = '#16181c';
          ctx.beginPath(); ctx.arc(wx, y - k * 0.45, k * 0.45, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#8b9099';
          ctx.lineWidth = 1;
          const ang = (nose / 0.45) % (Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(wx, y - k * 0.45);
          ctx.lineTo(wx + Math.cos(ang) * k * 0.38, y - k * 0.45 + Math.sin(ang) * k * 0.38);
          ctx.stroke();
        }
      }
      // pantographe
      if (c === 1) {
        const px = this.X(nose - c * CAR - 13);
        ctx.strokeStyle = '#2f343b';
        ctx.lineWidth = Math.max(1.5, k * 0.12);
        ctx.beginPath();
        ctx.moveTo(px - k * 1.4, bodyTop - k * 0.15);
        ctx.lineTo(px + k * 0.3, y - k * 5.4);
        ctx.lineTo(px - k * 0.6, y - k * 6.05);
        ctx.moveTo(px - k * 1.3, y - k * 6.08);
        ctx.lineTo(px + k * 0.5, y - k * 6.08);
        ctx.stroke();
      }
      // cabine avant
      if (front) {
        ctx.fillStyle = '#1d2533';
        ctx.beginPath();
        ctx.moveTo(x1 - k * 2.0, bodyTop + k * 0.35);
        ctx.quadraticCurveTo(x1 - k * 0.5, bodyTop + k * 0.55, x1 - k * 0.15, bodyTop + k * 1.9);
        ctx.lineTo(x1 - k * 2.0, bodyTop + k * 1.9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd200';
        ctx.fillRect(x1 - k * 0.5, bodyBot - k * 1.1, k * 0.5, k * 0.6);
        // phares
        const hl = { x: x1 - k * 0.15, y: bodyBot - k * 1.5 };
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(hl.x, hl.y, k * 0.18, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(hl.x, hl.y, 0, hl.x, hl.y, k * (night ? 12 : 4));
        g.addColorStop(0, `rgba(255,244,200,${night ? 0.55 : 0.35})`);
        g.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(hl.x, hl.y);
        ctx.arc(hl.x, hl.y, k * (night ? 12 : 4), -0.35, 0.35);
        ctx.fill();
      }
    }
    ctx.restore();
    if (ghost && opts.label) {
      const x = this.X(nose);
      if (x > 0 && x < this.w) {
        ctx.font = `800 ${Math.max(10, k)}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'right';
        ctx.fillText(opts.label, x - 4, y - k * 4.8);
      }
    }
    void v;
  }

  drawForeground(run) {
    const { ctx, k, w, h } = this;
    const y = this.railY + k * 1.7;
    const reg = regionAt(run.x);
    const urban = reg === 'defense' || reg === 'urban' || reg === 'newtown';
    // bande de terrain devant : chemin de service et clôture
    ctx.fillStyle = urban ? '#4a5058' : '#7a6a52';
    ctx.fillRect(0, y + k * 0.4, w, k * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y + k * 1.3, w, k * 0.2);
    this.layer(1.25, 22 * this.baseK / 10, 52, (n, x) => {
      ctx.fillStyle = urban ? '#30353c' : '#5a4630';
      ctx.fillRect(x, y + k * 1.5, Math.max(2, k * 0.14), k * 1.4);
    });
    ctx.fillStyle = urban ? '#30353c' : '#5a4630';
    ctx.fillRect(0, y + k * 1.75, w, Math.max(1, k * 0.07));
    ctx.fillRect(0, y + k * 2.3, w, Math.max(1, k * 0.07));
    // haies et buissons au premier plan
    this.layer(1.6, 90, 51, (n, x, r) => {
      if (r < 0.3) return;
      const s = k * (1.2 + r * 1.6);
      ctx.fillStyle = r > 0.7 ? '#24402a' : '#2f5233';
      ctx.beginPath();
      ctx.ellipse(x, h + s * 0.3, s * 2.2, s * 1.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.ellipse(x - s * 0.5, h - s * 0.6, s * 0.8, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawWeather(run, rain, now) {
    const { ctx, w, h } = this;
    if (rain) {
      ctx.strokeStyle = 'rgba(210,225,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const drift = run.v * 0.6;
      for (const d of this.rain) {
        const x = ((d.x * w - now * 0.15 * (1 + drift * 0.05)) % w + w) % w;
        const y = ((d.y * h + now * 0.9) % h);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3 - drift, y + 12 * d.l);
      }
      ctx.stroke();
    }
    const inLeaves = run.m.leaves.some((z) => run.x > z.from - 60 && run.x < z.to + 30);
    if (inLeaves) {
      for (const l of this.leaves) {
        const x = ((l.x * w - now * 0.05 - run.x * this.k * 0.6) % w + w) % w;
        const y = ((l.y * h + now * 0.06) % h);
        ctx.fillStyle = l.s > 0.5 ? '#c4702a' : '#a85a20';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now / 400 + l.s * 6);
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.restore();
      }
    }
  }

  drawSparks(run) {
    const { ctx, k } = this;
    const y = this.railY;
    if ((run.slip || run.lever <= -0.92 || run.kvb) && run.v > 1.5) {
      for (let i = 0; i < 3; i++) {
        this.sparks.push({ x: this.X(run.x - 3.2 - Math.random() * 2), y: y - 2, vx: -2 - Math.random() * 4, vy: -1 - Math.random() * 2.5, life: 1 });
      }
    }
    ctx.fillStyle = '#ffd36b';
    for (const s of this.sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.25;
      s.life -= 0.06;
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    this.sparks = this.sparks.filter((s) => s.life > 0);
    void k;
  }

  rr(x, y, w, h, r) {
    const { ctx } = this;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
}

function nearestDoor(nose, wx) {
  let best = nose - 6.5;
  let bd = Infinity;
  for (let c = 0; c < CARS; c++) {
    for (const off of [6.5, 19.5]) {
      const d = nose - c * CAR - off;
      if (Math.abs(d - wx) < bd) { bd = Math.abs(d - wx); best = d; }
    }
  }
  return best;
}

function doorFraction(run) {
  const dr = run.doors;
  if (!dr) return 0;
  const age = run.t - dr.t;
  if (dr.state === 'opening') return Math.min(1, age / 0.6);
  if (dr.state === 'open') return 1;
  if (dr.state === 'closing') return Math.max(0, 1 - age / 0.8);
  return 0;
}
