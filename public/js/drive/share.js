// Cartes image à partager dans le groupe (format 4:5, lisible sur WhatsApp, Insta, Messenger).
// Dessinées sur un Canvas puis envoyées par le partage natif du téléphone, ou téléchargées sur PC.
import { LINES } from './route.js';

const W = 1080;
const H = 1350;
const FONT = '"Nunito Sans", "Avenir Next", Avenir, "Segoe UI", sans-serif';
const LED = '"Doto", "Courier New", monospace';
const SQUARE = { parfait: '#ffd200', super: '#24b47e', bien: '#2f6ff2', ok: '#c3cbff', loin: '#8e98d8', rate: '#e33b45' };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pict(ctx, id, x, y, s) {
  const l = LINES[id];
  ctx.fillStyle = l.color;
  rr(ctx, x, y, s, s, s * 0.2);
  ctx.fill();
  ctx.fillStyle = l.ink;
  ctx.font = `900 ${s * 0.68}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(id, x + s / 2, y + s / 2 + s * 0.04);
}

// Texte sur plusieurs lignes, centré
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}

// Fond commun : tableau d'affichage bleu, bandeau jaune Ukipu, pied de page avec l'adresse
function frame(ctx, tag, accent = '#ffd200') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b2c9f');
  g.addColorStop(1, '#070c33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // rayures discrètes
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 120);
  pict(ctx, 'U', 48, 24, 72);
  ctx.fillStyle = '#0d1663';
  ctx.font = `900 56px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ukipu', 140, 62);
  ctx.font = `900 30px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(tag.toUpperCase(), W - 48, 62);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `800 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${location.host || 'ukipu'} · la U qui pue, mais à l'heure`, W / 2, H - 50);
}

// ---------------------------------------------------------------------------

export function runCard(d) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  frame(ctx, 'Bulletin de conduite');
  pict(ctx, d.line, W / 2 - 60, 180, 120);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 74px ${FONT}`;
  let y = wrap(ctx, d.title, W / 2, 400, W - 140, 82);
  ctx.fillStyle = '#c3cbff';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(d.route, W / 2, y + 10);
  // score sur afficheur LED
  y += 70;
  ctx.fillStyle = '#050505';
  rr(ctx, 140, y, W - 280, 190, 24);
  ctx.fill();
  ctx.fillStyle = '#ffae00';
  ctx.shadowColor = 'rgba(255,174,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.font = `900 130px ${LED}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(d.score, W / 2, y + 100);
  ctx.shadowBlur = 0;
  y += 250;
  ctx.font = `120px ${FONT}`;
  ctx.fillStyle = '#ffd200';
  ctx.fillText('★'.repeat(d.stars) + '☆'.repeat(3 - d.stars), W / 2, y);
  // arrêts en carrés de couleur
  y += 110;
  const n = d.grades.length;
  const sz = Math.min(70, (W - 200) / n - 10);
  let x = W / 2 - (n * (sz + 10) - 10) / 2;
  for (const g of d.grades) {
    ctx.fillStyle = SQUARE[g] ?? '#8e98d8';
    rr(ctx, x, y - sz / 2, sz, sz, 10);
    ctx.fill();
    x += sz + 10;
  }
  y += 100;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 40px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  if (d.headline) y = wrap(ctx, d.headline, W / 2, y, W - 160, 50);
  ctx.fillStyle = '#c3cbff';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(`${d.pseudo}${d.frame ? ' 🎫' : ''} · ${d.date}`, W / 2, Math.max(y + 20, H - 130));
  if (d.frame) {
    // cadre doré (Pass Navigo)
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fff1a8');
    g.addColorStop(0.5, '#d9a21b');
    g.addColorStop(1, '#fff1a8');
    ctx.strokeStyle = g;
    ctx.lineWidth = 22;
    rr(ctx, 11, 131, W - 22, H - 142, 28);
    ctx.stroke();
  }
  return cv;
}

// Trophées de la semaine : U d'Or (honte) ou couronne de régulateur (gloire)
export function trophyCard(d) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const shame = d.kind === 'udor';
  frame(ctx, shame ? 'U d\'Or de la semaine' : 'Régulateur de la semaine', shame ? '#ffb000' : '#ffd200');
  // rayons de lumière
  ctx.save();
  ctx.translate(W / 2, 470);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.fillStyle = i % 2 ? 'rgba(255,210,0,0.07)' : 'rgba(255,210,0,0.13)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-60, -700);
    ctx.lineTo(60, -700);
    ctx.fill();
  }
  ctx.restore();
  ctx.font = `260px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(shame ? '🏆' : '🎖️', W / 2, 470);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 100px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(d.pseudo, W / 2, 800);
  ctx.fillStyle = '#ffd200';
  ctx.font = `900 46px ${FONT}`;
  let y = wrap(ctx, d.line1, W / 2, 890, W - 160, 56);
  ctx.fillStyle = '#c3cbff';
  ctx.font = `700 36px ${FONT}`;
  y = wrap(ctx, d.line2, W / 2, y + 30, W - 180, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 italic 38px ${FONT}`;
  wrap(ctx, shame ? '« Le pire service de la semaine. Le titre reste affiché jusqu\'à ce que quelqu\'un fasse pire. »' : '« Défi hebdo à armes égales : même tracé, même Z 2N, pur talent. »', W / 2, Math.max(y + 60, 1110), W - 180, 48);
  return cv;
}

// Bulletin du lundi : afficheur LED
export function bulletinCard(lines) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  frame(ctx, 'Info trafic');
  ctx.fillStyle = '#050505';
  rr(ctx, 60, 170, W - 120, H - 300, 26);
  ctx.fill();
  ctx.fillStyle = '#ffae00';
  ctx.shadowColor = 'rgba(255,174,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 40px ${LED}`;
  let y = 250;
  for (const l of lines) {
    const words = l.split(' ');
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > W - 220 && cur) { ctx.fillText(cur, 100, y); y += 50; cur = w; } else cur = t;
    }
    ctx.fillText(cur, 100, y);
    y += 74;
    if (y > H - 170) break;
  }
  ctx.shadowBlur = 0;
  return cv;
}

// Envoie l'image : partage natif (iPhone, Android) ou téléchargement (PC)
export async function shareCanvas(cv, name, text) {
  if (document.fonts?.ready) await document.fonts.ready;
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  const file = new File([blob], `${name}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

// Invitation : lien du jeu avec un petit mot
export async function invite(pseudo) {
  const url = location.origin;
  const text = `${pseudo ? `${pseudo} t'invite sur Ukipu` : 'Viens sur Ukipu'} : conduis la ligne U (la plus pourrie d'Île-de-France), vole nos couronnes et évite la U d'Or. ${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Ukipu', text, url }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
