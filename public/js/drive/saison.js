// Saison mensuelle et Pass Navigo, partagés par le client et le serveur.
// Une saison = un mois calendaire. 20 paliers : une piste gratuite pour tous, une piste Pass (2,99 € le mois).
// Règle d'or : le Pass achète du style et du confort, jamais de points ni de rames.

export const TIERS = 20;
export const XP_PER_TIER = 60;
export const PASS_PRICE_CENTS = 299;
export const PASS_PERKS = { capHours: 3, chantiers: 1 }; // caisses à 8 h au lieu de 5, 3 chantiers au lieu de 2

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Saison : AAAAMM (heure de Paris approximée par UTC+1)
export function seasonKey(date = new Date()) {
  const d = new Date(date.getTime() + 3600000);
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
}
export const seasonMonth = (key) => key % 100;
export const seasonName = (key) => `${MONTHS[seasonMonth(key) - 1]} ${Math.floor(key / 100)}`;
export function seasonEnd(key) {
  const y = Math.floor(key / 100);
  const m = key % 100;
  return Date.UTC(y, m, 1) - 3600000; // 1er du mois suivant, minuit à Paris
}
export const daysLeft = (key, now = Date.now()) => Math.max(0, Math.ceil((seasonEnd(key) - now) / 86400000));

// Points de saison d'un service
export function xpFor(mission, res) {
  return 10 + 5 * res.stars + (mission.daily || mission.weekly || mission.rush ? 15 : 0);
}
export const tierOf = (xp) => Math.min(TIERS, Math.floor(xp / XP_PER_TIER));

// Thème de chaque mois : livrée exclusive, klaxon, effet de fantôme, emote
export const THEMES = {
  1: { livree: { name: 'Givre', body: '#eef6ff', band: '#7fc8ff', doors: '#3b7fc4', glow: true }, horn: [349, 466], hornName: 'Carillon givré', fx: '#9fdcff', emote: '❄️' },
  2: { livree: { name: 'Cœur de la U', body: '#ffe6ef', band: '#ff3e7f', doors: '#b0124b', glow: true }, horn: [330, 415], hornName: 'Sérénade', fx: '#ff6fa3', emote: '💘' },
  3: { livree: { name: 'Giboulées', body: '#e8edf2', band: '#5a7fa8', doors: '#2e4f73' }, horn: [294, 392], hornName: 'Coup de tonnerre', fx: '#b4d0ff', emote: '🌧️' },
  4: { livree: { name: 'Cerisiers', body: '#fff4f8', band: '#f7a6c3', doors: '#8a4a63' }, horn: [392, 523], hornName: 'Coucou', fx: '#ffc6dd', emote: '🌸' },
  5: { livree: { name: 'Muguet', body: '#f4fbf2', band: '#3fa65a', doors: '#24683a' }, horn: [370, 494], hornName: 'Clochette', fx: '#8cf0a8', emote: '🍀' },
  6: { livree: { name: 'Fête de la musique', body: '#1d1d2b', band: '#ffcc00', doors: '#ff4fa1', glow: true }, horn: [262, 330], hornName: 'Guitare saturée', fx: '#ffd84d', emote: '🎸' },
  7: { livree: { name: 'Tricolore', body: '#ffffff', band: '#0055a4', doors: '#ef4135' }, horn: [349, 440], hornName: 'Fanfare', fx: '#7fb2ff', emote: '🎆' },
  8: { livree: { name: 'Canicule', body: '#fff3df', band: '#ff7a1a', doors: '#b8460a', glow: true }, horn: [311, 392], hornName: 'Ventilateur', fx: '#ffad5c', emote: '🥵' },
  9: { livree: { name: 'Rentrée', body: '#f1f1ec', band: '#3d4ea8', doors: '#c4245f' }, horn: [330, 440], hornName: 'Sonnerie de lycée', fx: '#9aa8ff', emote: '📚' },
  10: { livree: { name: 'Citrouille', body: '#1f1a14', band: '#ff7a00', doors: '#7a2bbf', glow: true }, horn: [233, 277], hornName: 'Hurlement', fx: '#ff8c1a', emote: '🎃' },
  11: { livree: { name: 'Brouillard de novembre', body: '#d7dbe1', band: '#6d7a8c', doors: '#3b4554', glow: true }, horn: [277, 349], hornName: 'Corne de brume', fx: '#c9d6e8', emote: '🌫️' },
  12: { livree: { name: 'Illuminations', body: '#16213a', band: '#ffcf3f', doors: '#d6283b', glow: true }, horn: [392, 494], hornName: 'Grelots', fx: '#ffe27a', emote: '🎄' },
};
export const themeOf = (key) => THEMES[seasonMonth(key)];
export const seasonLivreeId = (month) => `saison${month}`;

// Livrées de saison (ajoutées au catalogue des livrées, jamais tirées dans les colis)
export const SEASON_LIVREES = Object.fromEntries(Object.entries(THEMES).map(([m, t]) => [seasonLivreeId(m), { ...t.livree, rarity: 'mythique', season: true }]));

// Cosmétiques : identifiants stockés côté serveur
export const cosmetic = {
  badge: (key) => `badge:${key}`,
  horn: (key) => `horn:${seasonMonth(key)}`,
  fx: (key) => `fx:${seasonMonth(key)}`,
  emote: (key) => `emote:${seasonMonth(key)}`,
  rename: 'rename',
  frame: 'frame',
};
export function cosmeticLabel(item) {
  const [kind, v] = item.split(':');
  const t = THEMES[Number(v)];
  if (kind === 'badge') return `Badge 🎫 ${seasonName(Number(v))}`;
  if (kind === 'horn') return `Klaxon « ${t.hornName} »`;
  if (kind === 'fx') return 'Traînée lumineuse du fantôme';
  if (kind === 'emote') return `Emote ${t.emote} du fantôme`;
  if (kind === 'rename') return 'Nom de ta rame';
  if (kind === 'frame') return 'Cadre doré des images';
  return item;
}

// Les 20 paliers. Chaque récompense : tickets, pièces, colis, cosmétique ou livrée.
const T = (n) => ({ type: 'tickets', n });
const P = (n) => ({ type: 'parts', n });
const B = (kind) => ({ type: 'box', kind });
const C = (item) => ({ type: 'cosmetic', item });

export function track(key) {
  const rows = [
    [[T(100)], [C(cosmetic.badge(key)), C(cosmetic.rename)]],
    [[P(5)], [T(150)]],
    [[P(10)], [C(cosmetic.horn(key))]],
    [[T(100)], [P(10)]],
    [[B('standard')], [B('rare')]],
    [[T(100)], [T(200)]],
    [[P(10)], [P(15)]],
    [[T(150)], [C(cosmetic.fx(key))]],
    [[P(10)], [T(200)]],
    [[B('standard')], [B('navigo')]],
    [[T(150)], [P(20)]],
    [[P(20)], [C(cosmetic.frame)]],
    [[T(150)], [T(250)]],
    [[P(15)], [P(20)]],
    [[B('standard')], [B('rare')]],
    [[T(200)], [T(300)]],
    [[P(15)], [P(25)]],
    [[T(250)], [C(cosmetic.emote(key))]],
    [[P(20)], [T(300)]],
    [[B('rare')], [{ type: 'livree', id: seasonLivreeId(seasonMonth(key)) }, B('navigo')]],
  ];
  return rows.map(([free, pass], i) => ({ tier: i + 1, free, pass }));
}

export const BOX_NAMES = { standard: 'Colis du technicentre', rare: 'Colis rare', legendaire: 'Colis légendaire', navigo: 'Colis Navigo' };

export function rewardLabel(r, livrees = {}) {
  if (r.type === 'tickets') return `${r.n} 🎟`;
  if (r.type === 'parts') return `${r.n} ⚙`;
  if (r.type === 'box') return `🎁 ${BOX_NAMES[r.kind]}`;
  if (r.type === 'livree') return `🎨 Livrée « ${livrees[r.id]?.name ?? SEASON_LIVREES[r.id]?.name} »`;
  if (r.type === 'cosmetic') return cosmeticLabel(r.item);
  return '';
}
