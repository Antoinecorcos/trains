// Réseau du mode conduite : lignes, gares, missions, aléas, matériel roulant et livrées.
// Les positions sont en mètres « de jeu » : les distances réelles sont réduites (×0,19) pour qu'une
// mission dure environ 4 à 6 minutes. Les coordonnées des gares sont approximatives (plan schématique).

import { mulberry32 } from '../rng.js';

const SCALE = 0.19;
export const PLATFORM = 150; // quai court (m), le repère d'arrêt est en bout de quai
export const PLATFORM_LONG = 225; // quai long : accueille un train long (deux rames)
export const TRAIN_LEN = 104; // une rame de 4 voitures (unité simple, US)
export const MISSED_AFTER = 90; // au-delà de ce dépassement du repère, la gare est brûlée

// Composition : unité simple (US, une rame) ou unité multiple (UM, deux rames attelées) aux heures de pointe
export function compoOf(m) {
  if (m.compo) return m.compo;
  const h = m.clock[0] + m.clock[1] / 60;
  return (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5) ? 'UM' : 'US';
}

// ---------------------------------------------------------------------------
// Lignes
// ---------------------------------------------------------------------------
// region : décor autour de la gare. km : distance depuis le début de ligne (calculée si absente).

const S = (name, lon, lat, region, extra = {}) => ({ name, lon, lat, region, ...extra });

const DEF = S('La Défense', 2.2386, 48.8920, 'defense');
const PUT = S('Puteaux', 2.2343, 48.8838, 'urban', { quai: 'court' });
const SUR = S('Suresnes-Mont-Valérien', 2.2210, 48.8712, 'urban');
const STC = S('Saint-Cloud', 2.2178, 48.8457, 'forest');
const SEV = S("Sèvres-Ville-d'Avray", 2.1962, 48.8247, 'forest');
const CHA = S('Chaville-Rive-Droite', 2.1886, 48.8080, 'forest', { quai: 'court' });
const VCH = S('Versailles-Chantiers', 2.1350, 48.7951, 'versailles');
const CYR = S('Saint-Cyr', 2.0727, 48.7993, 'plain');
const SQY = S('Saint-Quentin-en-Yvelines', 2.0438, 48.7874, 'newtown');
const TRA = S('Trappes', 2.0056, 48.7756, 'newtown');
const LVE = S('La Verrière', 1.9434, 48.7556, 'fields');
const CHV = S('Chaville-Vélizy', 2.1835, 48.7996, 'forest');
const VRG = S('Viroflay-Rive-Gauche', 2.1700, 48.7974, 'forest');

export const LINES = {
  U: {
    id: 'U', name: 'Ligne U', kind: 'Transilien', color: '#C4245F', ink: '#ffffff', limit: 100, rame: 'Z2N',
    stations: [
      { ...DEF, km: 0 }, { ...PUT, km: 1.3 }, { ...SUR, km: 3.1 }, { ...STC, km: 4.8 }, { ...SEV, km: 7.1 },
      { ...CHA, km: 8.9 }, { ...VCH, km: 13.4 }, { ...CYR, km: 16.2 }, { ...SQY, km: 20.5 }, { ...TRA, km: 22.8 }, { ...LVE, km: 27.2 },
    ],
  },
  L: {
    id: 'L', name: 'Ligne L', kind: 'Transilien', color: '#7B83C2', ink: '#ffffff', limit: 100, rame: 'Z50000',
    stations: [
      S('Paris-Saint-Lazare', 2.3253, 48.8763, 'paris'), S('Clichy-Levallois', 2.3004, 48.8971, 'urban', { quai: 'court' }),
      S('Asnières-sur-Seine', 2.2843, 48.9055, 'urban'), S('Bécon-les-Bruyères', 2.2688, 48.9054, 'urban'),
      S('Courbevoie', 2.2570, 48.8981, 'urban'), DEF, PUT, SUR, STC, SEV, CHA,
      S('Viroflay-Rive-Droite', 2.1723, 48.8021, 'forest'), S('Montreuil', 2.1450, 48.8060, 'versailles', { quai: 'court' }),
      S('Versailles-Rive-Droite', 2.1350, 48.8093, 'versailles'),
    ],
    bridges: [{ a: 1, b: 2, f: 0.55, len: 170 }],
  },
  N: {
    id: 'N', name: 'Ligne N', kind: 'Transilien', color: '#1FA38C', ink: '#ffffff', limit: 120, rame: 'Regio2N',
    stations: [
      S('Paris-Montparnasse', 2.3200, 48.8412, 'paris'), S('Vanves-Malakoff', 2.2879, 48.8205, 'urban', { quai: 'court' }),
      S('Clamart', 2.2655, 48.8136, 'urban'), S('Meudon', 2.2441, 48.8145, 'urban'), S('Bellevue', 2.2246, 48.8183, 'forest', { quai: 'court' }),
      S('Sèvres-Rive-Gauche', 2.2106, 48.8214, 'forest'), CHV, VRG, VCH, CYR, SQY, TRA, LVE,
      S('Coignières', 1.9203, 48.7521, 'fields'), S('Les Essarts-le-Roi', 1.8951, 48.7163, 'forest', { quai: 'court' }),
      S('Le Perray', 1.8556, 48.6940, 'fields', { quai: 'court' }), S('Rambouillet', 1.8324, 48.6447, 'chateau'),
    ],
  },
  C: {
    id: 'C', name: 'RER C', kind: 'RER', color: '#E8C21C', ink: '#1d1d1d', limit: 90, rame: 'Z20500',
    stations: [
      VCH, S('Porchefontaine', 2.1530, 48.7975, 'versailles', { quai: 'court' }), VRG, CHV,
      S('Meudon-Val-Fleury', 2.2410, 48.8090, 'urban'), S('Issy', 2.2590, 48.8232, 'urban'),
      S('Issy-Val-de-Seine', 2.2630, 48.8303, 'river'), S('Pont du Garigliano', 2.2700, 48.8392, 'river'),
      S('Javel', 2.2780, 48.8460, 'river', { quai: 'court' }), S('Champ de Mars-Tour Eiffel', 2.2898, 48.8558, 'eiffel'),
      S("Pont de l'Alma", 2.3010, 48.8625, 'paris'), S('Invalides', 2.3140, 48.8621, 'paris'),
      S("Musée d'Orsay", 2.3255, 48.8600, 'paris'), S('Saint-Michel Notre-Dame', 2.3454, 48.8534, 'paris'),
      S("Gare d'Austerlitz", 2.3650, 48.8424, 'paris'), S('Bibliothèque François Mitterrand', 2.3765, 48.8298, 'newtown'),
      S('Ivry-sur-Seine', 2.3900, 48.8148, 'urban'), S('Vitry-sur-Seine', 2.4030, 48.7999, 'urban'),
      S('Les Ardoines', 2.4113, 48.7838, 'river'), S('Choisy-le-Roi', 2.4085, 48.7636, 'river'),
      S('Villeneuve-le-Roi', 2.4250, 48.7357, 'urban'), S('Ablon', 2.4205, 48.7254, 'river', { quai: 'court' }),
      S('Athis-Mons', 2.4060, 48.7130, 'urban'), S('Juvisy', 2.3830, 48.6893, 'urban'),
    ],
    tunnels: [{ a: 3, b: 4, f0: 0.25, f1: 0.8 }, { a: 9, b: 10, f0: 0.45, f1: 1 }, { a: 10, b: 13, f0: 0, f1: 1 }, { a: 13, b: 14, f0: 0, f1: 1 }, { a: 14, b: 15, f0: 0, f1: 0.5 }],
  },
  A: {
    // Branche A1 (Saint-Germain-en-Laye) → tronc parisien → branche A2 (Boissy-Saint-Léger)
    id: 'A', name: 'RER A', kind: 'RER', color: '#E3051C', ink: '#ffffff', limit: 100, rame: 'MI09',
    stations: [
      S('Saint-Germain-en-Laye', 2.0940, 48.8980, 'chateau'), S('Le Vésinet-Le Pecq', 2.1150, 48.8970, 'river'),
      S('Le Vésinet-Centre', 2.1310, 48.8920, 'forest'), S('Chatou-Croissy', 2.1560, 48.8860, 'river'),
      S('Rueil-Malmaison', 2.1720, 48.8790, 'urban'), S('Nanterre-Ville', 2.1970, 48.8950, 'urban'),
      S('Nanterre-Préfecture', 2.2140, 48.8960, 'newtown'), DEF,
      S('Charles de Gaulle-Étoile', 2.2950, 48.8738, 'paris'), S('Auber', 2.3300, 48.8722, 'paris'),
      S('Châtelet-Les Halles', 2.3470, 48.8617, 'paris'), S('Gare de Lyon', 2.3740, 48.8443, 'paris'),
      S('Nation', 2.3958, 48.8483, 'paris'), S('Vincennes', 2.4334, 48.8473, 'chateau'),
      S('Fontenay-sous-Bois', 2.4630, 48.8445, 'urban'), S('Nogent-sur-Marne', 2.4730, 48.8346, 'river'),
      S('Joinville-le-Pont', 2.4640, 48.8212, 'river'), S('Saint-Maur-Créteil', 2.4720, 48.8066, 'urban'),
      S('Le Parc de Saint-Maur', 2.4920, 48.8053, 'urban'), S('Champigny', 2.5145, 48.8105, 'urban'),
      S('La Varenne-Chennevières', 2.5157, 48.7945, 'river'), S('Sucy-Bonneuil', 2.5080, 48.7705, 'newtown'),
      S('Boissy-Saint-Léger', 2.5110, 48.7510, 'forest'),
    ],
    tunnels: [
      { a: 1, b: 0, f0: 0.55, f1: 1 }, { a: 7, b: 6, f0: 0, f1: 0.85 }, // Saint-Germain, La Défense
      { a: 7, b: 13, f0: 0, f1: 1 }, // tout le tronc central, de La Défense à Vincennes
      { a: 16, b: 17, f0: 0.55, f1: 1 }, { a: 17, b: 18, f0: 0, f1: 0.45 }, // Saint-Maur
    ],
    bridges: [
      { a: 4, b: 3, f: 0.55, len: 190 }, { a: 1, b: 0, f: 0.25, len: 150 }, // la Seine à Chatou et au Pecq
      { a: 15, b: 16, f: 0.5, len: 210 }, { a: 20, b: 21, f: 0.3, len: 240 }, // la Marne à Joinville et à La Varenne
    ],
  },
};

// Distances calculées depuis les coordonnées (avec un léger détour) quand elles ne sont pas fixées
const hav = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
for (const line of Object.values(LINES)) {
  // un long tunnel est découpé gare par gare : une mission qui n'en parcourt qu'une partie le garde
  line.tunnels = (line.tunnels ?? []).flatMap((t) => {
    if (Math.abs(t.b - t.a) <= 1) return [t];
    const dir = t.b > t.a ? 1 : -1;
    const out = [];
    for (let k = t.a; k !== t.b; k += dir) out.push({ a: k, b: k + dir, f0: k === t.a ? t.f0 : 0, f1: k + dir === t.b ? t.f1 : 1 });
    return out;
  });
  let km = 0;
  line.stations = line.stations.map((s, i) => {
    if (i > 0 && line.stations[i].km == null) km += Math.max(0.9, hav(line.stations[i - 1], s) * 1.15);
    else if (s.km != null) km = s.km;
    return { ...s, km: Math.round(km * 100) / 100 };
  });
}

// Correspondances : gares desservies par plusieurs lignes (pour la carte)
export const INTERCHANGES = (() => {
  const by = {};
  for (const line of Object.values(LINES)) for (const s of line.stations) (by[s.name] ??= new Set()).add(line.id);
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]]));
})();

// Déblocage des lignes : il faut des étoiles sur une ligne en correspondance
export const LINE_UNLOCK = {
  U: null,
  L: { line: 'U', stars: 4 },
  N: { line: 'U', stars: 7 },
  C: { line: 'N', stars: 3 },
  A: { line: 'L', stars: 3 },
};

// ---------------------------------------------------------------------------
// Matériel roulant et livrées
// ---------------------------------------------------------------------------
// accel / brake en m/s², vmax en km/h, board : voyageurs montant par seconde, grip : adhérence.

export const RARITIES = {
  commun: { label: 'Commun', color: '#9aa6c8', weight: 60 },
  rare: { label: 'Rare', color: '#3b8cff', weight: 26 },
  epique: { label: 'Épique', color: '#b05cff', weight: 10 },
  legendaire: { label: 'Légendaire', color: '#ffb000', weight: 3.4 },
  mythique: { label: 'Mythique', color: '#ff4d6d', weight: 0.6 },
};

export const RAMES = {
  Z2N: { name: 'Z 2N', rarity: 'commun', deck: 2, accel: 1.5, brake: 1.4, vmax: 120, board: 16, grip: 1, body: '#eef1f5', band: null, doors: '#8a1440', nose: 'round', perk: 'La rame de base, fiable et sans surprise.' },
  Z20500: { name: 'Z 20500', rarity: 'commun', deck: 2, accel: 1.45, brake: 1.48, vmax: 140, board: 16, grip: 1, body: '#e6e9ee', band: '#2b4aa0', doors: '#2b4aa0', nose: 'round', perk: 'Freine un poil mieux que la Z 2N.' },
  Z50000: { name: 'Z 50000 « Francilien »', rarity: 'rare', deck: 1, accel: 1.75, brake: 1.45, vmax: 140, board: 21, grip: 1, body: '#f2f3f5', band: '#3d4350', doors: '#3d4350', nose: 'flat', perk: 'Larges portes : les voyageurs montent vite.' },
  Regio2N: { name: 'Regio 2N', rarity: 'rare', deck: 2, accel: 1.62, brake: 1.5, vmax: 160, board: 15, grip: 1.05, body: '#f3f4f6', band: '#1fa38c', doors: '#1fa38c', nose: 'sharp', perk: 'Taillée pour la vitesse en grande banlieue.' },
  MI2N: { name: 'MI 2N', rarity: 'epique', deck: 2, accel: 1.82, brake: 1.56, vmax: 140, board: 22, grip: 1.05, body: '#eceff3', band: '#c8102e', doors: '#c8102e', nose: 'round', perk: 'Trois portes par voiture.' },
  MI09: { name: 'MI 09', rarity: 'epique', deck: 2, accel: 1.95, brake: 1.6, vmax: 140, board: 23, grip: 1.05, body: '#f0f2f5', band: '#e3051c', doors: '#4a4f5a', nose: 'flat', perk: 'La reine du RER A : nerveuse et capacitaire.' },
  RERNG: { name: 'RER NG', rarity: 'legendaire', deck: 2, accel: 2.02, brake: 1.7, vmax: 140, board: 25, grip: 1.1, body: '#f5f6f8', band: '#00a88f', doors: '#2d3340', nose: 'sharp', perk: 'Dernière génération : accélération et freinage au top.' },
  MI20: { name: 'MI 20', rarity: 'legendaire', deck: 2, accel: 2.06, brake: 1.66, vmax: 140, board: 25, grip: 1.1, body: '#f4f5f7', band: '#5091cd', doors: '#2d3340', nose: 'sharp', perk: 'Conçue pour les foules du RER B.' },
  Z6100: { name: 'Z 6100 « petit gris »', rarity: 'mythique', deck: 1, accel: 1.55, brake: 1.5, vmax: 120, board: 18, grip: 1.35, body: '#a9afb7', band: '#6e757f', doors: '#7d848e', nose: 'flat', perk: 'Légende des années 60 : accroche aux rails même sur les feuilles.' },
  Z5300: { name: 'Z 5300 « petit gris »', rarity: 'mythique', deck: 1, accel: 1.8, brake: 1.55, vmax: 130, board: 19, grip: 1.3, body: '#b3b8bf', band: '#5f6670', doors: '#727a84', nose: 'flat', perk: 'Inox et rivets : la classe absolue.' },
};

export const LIVREES = {
  origine: { name: 'Livrée d\'origine', rarity: 'commun' },
  idfm: { name: 'Île-de-France', rarity: 'commun', body: '#eef1f5', band: '#00a3a6', doors: '#1b3f8b' },
  stif: { name: 'Bleu Stif', rarity: 'rare', body: '#e9eef8', band: '#2251a3', doors: '#2251a3' },
  carmillon: { name: 'Carmillon', rarity: 'rare', body: '#f2f2f2', band: '#a50f2d', doors: '#a50f2d' },
  nuit: { name: 'Nuit néon', rarity: 'epique', body: '#22283a', band: '#38f0ff', doors: '#ff3ec9', glow: true },
  rose: { name: 'Rose U', rarity: 'epique', body: '#ffe3ef', band: '#c4245f', doors: '#c4245f' },
  inox: { name: 'Inox brossé', rarity: 'legendaire', body: '#c8cdd4', band: '#8a929c', doors: '#9aa1aa' },
  or: { name: 'Or', rarity: 'mythique', body: '#f3d27a', band: '#a7781a', doors: '#7a5310', glow: true },
};

// Boîtes : contenus tirés par le serveur, prix en tickets
export const BOX_SHOP = {
  standard: { name: 'Colis du technicentre', price: 300, hint: 'Tickets, pièces, parfois une livrée ou une rame' },
  rare: { name: 'Colis rare', price: 900, hint: 'Bonnes chances de rame rare ou épique' },
  legendaire: { name: 'Colis légendaire', price: 2400, hint: 'Rame épique garantie, chance de légendaire ou mythique' },
};

export const MAX_LEVEL = 5;
export const levelCost = (level) => ({ parts: [0, 10, 25, 50, 90][level] ?? 999, tickets: [0, 100, 250, 500, 900][level] ?? 99999 });

// Caractéristiques effectives d'une rame à un niveau donné (+2,5 % accélération et freinage par niveau)
export function rameStats(id = 'Z2N', level = 1) {
  const r = RAMES[id] ?? RAMES.Z2N;
  const k = 1 + 0.025 * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
  return { id: RAMES[id] ? id : 'Z2N', level, name: r.name, deck: r.deck, accel: r.accel * k, brake: r.brake * k, vmax: r.vmax / 3.6, board: r.board, grip: r.grip };
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
// line, from, to : index des gares sur la ligne (to < from = sens inverse). stops : gares desservies.
// need : étoiles requises sur la ligne. build : aléas, avec les index des gares de la ligne.

export const MISSIONS = [
  // ----- Ligne U -----
  {
    id: 'm1', line: 'U', title: 'Premiers pas', from: 0, to: 6, clock: [7, 41], need: 0, weather: 'clear', light: 0.55, tutorial: true,
    blurb: 'Six arrêts de La Défense à Versailles-Chantiers. On apprend à freiner sous les tours, puis la forêt arrive.',
    build: (h) => { h.limit(1, 2, 0.35, 0.75, 60, 'Courbe'); h.signal(2, 3, 0.55, 6); h.leaves(4, 5, 0.3, 0.7); h.runner(5); h.passengers(6, 70); },
  },
  {
    id: 'm2', line: 'U', title: 'La traversée des bois', from: 2, to: 8, clock: [7, 52], need: 2, weather: 'clear', light: 0.62,
    blurb: 'De Suresnes à Saint-Quentin : feuilles mortes dans la forêt, un sanglier qui traîne et un train de la N devant.',
    build: (h) => { h.limit(2, 3, 0.3, 0.7, 80, 'Courbe'); h.leaves(4, 5, 0.25, 0.75); h.animal(5, 6, 0.4); h.signal(5, 6, 0.8, 7); h.passengers(6, 70); h.signal(7, 8, 0.5, 7, 'Train de la N devant'); },
  },
  {
    id: 'u-retour', line: 'U', title: 'Retour du soir', from: 10, to: 4, clock: [18, 47], need: 3, weather: 'clear', light: 0.14,
    blurb: 'La Verrière → Sèvres à la tombée de la nuit. Les quais sont pleins, les retardataires courent.',
    build: (h) => { h.runner(9); h.signal(8, 7, 0.5, 6, 'Train de la N devant'); h.runner(7); h.passengers(6, 75); h.leaves(5, 4, 0.3, 0.7); h.runner(4); },
  },
  {
    id: 'm3', line: 'U', title: 'Averse sur les Yvelines', from: 6, to: 10, clock: [8, 9], need: 4, weather: 'rain', light: 0.5,
    blurb: 'De Versailles à La Verrière sous la pluie : rails glissants, chantier à Trappes et retardataires sur les quais.',
    build: (h) => { h.limit(6, 7, 0.2, 0.55, 80, 'Appareils de voie'); h.signal(7, 8, 0.5, 8, 'Train de la N devant'); h.runner(8); h.works(8, 9, 0.35, 0.7); h.runner(9); h.passengers(10, 25); },
  },
  {
    id: 'u-nuit', line: 'U', title: 'Nuit de travaux', from: 6, to: 0, clock: [0, 12], need: 5, weather: 'clear', light: 0.02,
    blurb: 'Dernier train de la nuit, de Versailles à La Défense. Deux chantiers sur la voie : klaxon et prudence.',
    build: (h) => { h.works(6, 5, 0.3, 0.6); h.animal(5, 4, 0.5); h.works(3, 2, 0.25, 0.65); h.limit(2, 1, 0.3, 0.7, 60, 'Courbe'); },
  },
  {
    id: 'm4', line: 'U', title: 'Semi-direct', from: 0, to: 10, stops: [3, 6, 8, 10], clock: [7, 33], need: 6, weather: 'clear', light: 0.4,
    blurb: 'Toute la ligne avec quatre arrêts seulement. Ça roule vite. Ne vous arrêtez surtout pas ailleurs.',
    build: (h) => { h.limit(1, 2, 0.3, 0.7, 80, 'Courbe'); h.signal(3, 4, 0.45, 6); h.leaves(4, 5, 0.3, 0.9); h.animal(5, 6, 0.55); h.works(8, 9, 0.3, 0.6); h.signal(9, 10, 0.6, 6, 'Train de la N devant'); },
  },
  {
    id: 'u-neige', line: 'U', title: 'Neige sur les Yvelines', from: 6, to: 10, clock: [7, 18], need: 7, weather: 'snow', light: 0.7,
    blurb: 'Il neige sur le plateau : freinages longs, patinage au démarrage. Anticipez chaque arrêt.',
    build: (h) => { h.limit(6, 7, 0.2, 0.6, 80, 'Neige'); h.animal(7, 8, 0.6); h.runner(8); h.limit(9, 10, 0.3, 0.8, 80, 'Neige'); },
  },
  {
    id: 'u-greve', line: 'U', title: 'Jour de grève', from: 0, to: 6, clock: [8, 2], need: 8, weather: 'clear', light: 0.6,
    blurb: 'Un train sur trois : les quais débordent, tout le monde court et les signaux s\'enchaînent.',
    crowd: 2,
    build: (h) => { for (let k = 1; k <= 6; k++) h.runner(k); h.signal(1, 2, 0.5, 8); h.signal(3, 4, 0.5, 9); h.signal(5, 6, 0.4, 8, 'Train de la N devant'); },
  },
  {
    id: 'm5', line: 'U', title: 'Le grand tour', from: 0, to: 10, clock: [6, 58], need: 10, weather: 'clear', light: 0.3,
    blurb: 'La ligne U en entier, les dix arrêts, à l\'aube. Pour les acharnés : huit minutes sans relâcher.',
    build: (h) => { h.limit(1, 2, 0.35, 0.75, 60, 'Courbe'); h.signal(2, 3, 0.55, 6); h.leaves(4, 5, 0.25, 0.75); h.animal(5, 6, 0.45); h.runner(6); h.limit(6, 7, 0.2, 0.55, 80, 'Appareils de voie'); h.signal(7, 8, 0.5, 7, 'Train de la N devant'); h.works(8, 9, 0.35, 0.7); h.runner(9); },
  },
  // ----- Ligne L -----
  {
    id: 'l1', line: 'L', title: 'Départ Saint-Lazare', from: 0, to: 5, clock: [8, 14], need: 0, weather: 'clear', light: 0.6,
    blurb: 'Sortie de la gare Saint-Lazare, la Seine à Asnières et l\'arrivée sous les tours de La Défense.',
    build: (h) => { h.limit(0, 1, 0, 0.5, 60, 'Faisceau Saint-Lazare'); h.signal(1, 2, 0.3, 6, 'Train de la J devant'); h.runner(3); h.limit(4, 5, 0.4, 0.9, 80, 'Courbe'); h.passengers(5, 70); },
  },
  {
    id: 'l2', line: 'L', title: 'Vers Versailles Rive Droite', from: 5, to: 13, clock: [9, 3], need: 2, weather: 'clear', light: 0.75,
    blurb: 'Huit arrêts à travers les coteaux et la forêt jusqu\'à Versailles Rive Droite.',
    build: (h) => { h.leaves(8, 9, 0.2, 0.7); h.signal(9, 10, 0.5, 6, 'Train de la U devant'); h.animal(10, 11, 0.5); h.runner(12); },
  },
  {
    id: 'l3', line: 'L', title: 'Soirée à Saint-Lazare', from: 5, to: 0, clock: [21, 36], need: 4, weather: 'rain', light: 0.08,
    blurb: 'La Défense → Saint-Lazare un soir de pluie. Arrivée dans la grande gare illuminée.',
    build: (h) => { h.limit(5, 4, 0.2, 0.6, 80, 'Courbe'); h.runner(4); h.signal(2, 1, 0.5, 7, 'Train de la J devant'); h.limit(1, 0, 0.5, 1, 60, 'Faisceau Saint-Lazare'); h.passengers(0, 30); },
  },
  // ----- Ligne N -----
  {
    id: 'n1', line: 'N', title: 'Rive gauche', from: 0, to: 8, clock: [7, 26], need: 0, weather: 'clear', light: 0.45,
    blurb: 'De Montparnasse à Versailles-Chantiers par Meudon et Bellevue : huit arrêts sur les hauteurs.',
    build: (h) => { h.limit(0, 1, 0, 0.6, 60, 'Faisceau Montparnasse'); h.runner(3); h.leaves(4, 5, 0.2, 0.8); h.signal(6, 7, 0.5, 6, 'Train du RER C devant'); h.passengers(8, 70); },
  },
  {
    id: 'n2', line: 'N', title: 'Plein ouest', from: 12, to: 16, clock: [10, 41], need: 2, weather: 'clear', light: 0.9,
    blurb: 'De La Verrière à Rambouillet : de longues lignes droites à 120 km/h entre champs et forêts.',
    build: (h) => { h.animal(13, 14, 0.5); h.leaves(14, 15, 0.4, 0.8); h.works(15, 16, 0.3, 0.55); },
  },
  {
    id: 'n3', line: 'N', title: 'Semi-direct Rambouillet', from: 16, to: 8, stops: [12, 10, 8], clock: [7, 4], need: 4, weather: 'snow', light: 0.4,
    blurb: 'Rambouillet → Versailles sous la neige avec trois arrêts. Vitesse et adhérence, tout un art.',
    build: (h) => { h.limit(16, 15, 0, 0.3, 80, 'Neige'); h.animal(14, 13, 0.5); h.signal(11, 10, 0.5, 7, 'Train de la U devant'); },
  },
  // ----- RER C -----
  {
    id: 'c1', line: 'C', title: 'Bord de Seine', from: 7, to: 13, clock: [8, 31], need: 0, weather: 'clear', light: 0.7,
    blurb: 'Le long de la Seine, la tour Eiffel à droite, puis sous terre jusqu\'à Saint-Michel.',
    build: (h) => { h.runner(9); h.signal(10, 11, 0.5, 6, 'Train du RER C devant'); h.limit(11, 12, 0.2, 0.8, 60, 'Tunnel'); h.passengers(13, 30); },
  },
  {
    id: 'c2', line: 'C', title: 'Sous Meudon', from: 0, to: 5, clock: [7, 49], need: 2, weather: 'rain', light: 0.5,
    blurb: 'De Versailles-Chantiers à Issy sous la pluie, avec le tunnel de Meudon au milieu.',
    build: (h) => { h.leaves(2, 3, 0.2, 0.8); h.limit(3, 4, 0.2, 0.85, 70, 'Tunnel'); h.runner(5); },
  },
  {
    id: 'c3', line: 'C', title: 'La traversée de Paris', from: 0, to: 13, clock: [17, 54], need: 4, weather: 'clear', light: 0.2,
    blurb: 'Treize arrêts de Versailles à Saint-Michel au coucher du soleil. Le grand tour du RER C.',
    build: (h) => { h.limit(3, 4, 0.2, 0.85, 70, 'Tunnel'); h.runner(5); h.signal(7, 8, 0.5, 7, 'Train du RER C devant'); h.runner(9); h.limit(11, 12, 0.2, 0.8, 60, 'Tunnel'); h.passengers(13, 30); },
  },
  {
    id: 'c4', line: 'C', title: 'Les quais de la Seine', from: 13, to: 23, clock: [7, 5], need: 5, weather: 'clear', light: 0.55,
    blurb: 'De Saint-Michel à Juvisy à l\'heure de pointe : Austerlitz sous terre, puis la Seine et les Ardoines.',
    build: (h) => { h.limit(13, 14, 0, 1, 60, 'Tunnel'); h.runner(15); h.signal(17, 18, 0.5, 7, 'Train du RER C devant'); h.works(18, 19, 0.3, 0.6); h.leaves(20, 21, 0.2, 0.8); h.runner(22); h.passengers(23, 20); },
  },
  {
    id: 'c5', line: 'C', title: 'Dernier train pour Paris', from: 23, to: 13, clock: [23, 38], need: 7, weather: 'rain', light: 0.08,
    blurb: 'Juvisy → Saint-Michel de nuit, sous la pluie. Pleins phares obligatoires, et Austerlitz au bout du tunnel.',
    build: (h) => { h.animal(21, 20, 0.5); h.signal(19, 18, 0.5, 8, 'Travaux de nuit'); h.works(16, 15, 0.3, 0.7); h.limit(14, 13, 0, 1, 60, 'Tunnel'); h.runner(14); },
  },
  // ----- RER A (gares numérotées de Saint-Germain-en-Laye à Boissy-Saint-Léger) -----
  {
    id: 'a1', line: 'A', title: 'Sous La Défense', from: 7, to: 3, clock: [8, 7], need: 0, weather: 'clear', light: 0.65,
    blurb: 'Départ en souterrain sous La Défense, puis la traversée de la Seine vers Chatou.',
    build: (h) => { h.limit(7, 6, 0, 0.8, 70, 'Tunnel'); h.runner(6); h.signal(5, 4, 0.5, 6, 'Train du RER A devant'); h.passengers(6, 60); },
  },
  {
    id: 'a2', line: 'A', title: 'Boucles de la Seine', from: 4, to: 0, clock: [11, 22], need: 2, weather: 'clear', light: 0.95,
    blurb: 'Deux ponts sur la Seine et l\'arrivée souterraine à Saint-Germain-en-Laye.',
    build: (h) => { h.leaves(3, 2, 0.3, 0.8); h.animal(2, 1, 0.5); h.limit(1, 0, 0.5, 1, 60, 'Tunnel'); h.passengers(0, 20); },
  },
  {
    id: 'a3', line: 'A', title: 'Retour vers Paris', from: 0, to: 7, clock: [8, 48], need: 4, weather: 'rain', light: 0.45,
    blurb: 'Saint-Germain → La Défense à l\'heure de pointe, sous la pluie. Les quais de Nanterre débordent.',
    crowd: 1.5,
    build: (h) => { h.limit(0, 1, 0, 0.5, 60, 'Tunnel'); h.runner(2); h.signal(3, 4, 0.5, 7, 'Train du RER A devant'); h.runner(5); h.limit(6, 7, 0.15, 1, 70, 'Tunnel'); },
  },
  {
    id: 'a4', line: 'A', title: 'Le tronc central', from: 7, to: 12, clock: [8, 32], need: 5, weather: 'clear', light: 0.9, crowd: 1.3,
    blurb: 'La Défense → Nation sous Paris, la ligne la plus chargée d\'Europe. Tout en tunnel : phares allumés, code en gare.',
    build: (h) => { h.limit(7, 8, 0.2, 0.8, 80, 'Tunnel'); h.signal(8, 9, 0.55, 8, 'Train du RER A devant'); h.runner(9); h.signal(10, 11, 0.5, 6, 'Régulation Châtelet'); h.runner(10); h.passengers(10, 70); },
  },
  {
    id: 'a5', line: 'A', title: 'Les boucles de la Marne', from: 12, to: 22, clock: [17, 42], need: 7, weather: 'rain', light: 0.35,
    blurb: 'Nation → Boissy-Saint-Léger au soir : le bois de Vincennes, deux ponts sur la Marne et le tunnel de Saint-Maur.',
    build: (h) => { h.limit(12, 13, 0.2, 0.9, 80, 'Tunnel'); h.runner(14); h.leaves(15, 16, 0.2, 0.7); h.limit(17, 18, 0, 0.45, 70, 'Tunnel'); h.works(19, 20, 0.3, 0.6); h.animal(21, 22, 0.5); h.passengers(22, 15); },
  },
];

export const lineOf = (m) => LINES[m.line ?? 'U'];

export const dailyKey = (date = new Date()) => Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`);

// Retrouve une mission par son identifiant (y compris « daily-AAAAMMJJ »)
export function missionById(id) {
  const m = MISSIONS.find((x) => x.id === id);
  if (m) return m;
  const d = /^daily-(\d{8})$/.exec(id);
  if (d) return dailyMission(null, Number(d[1]));
  const w = /^weekly-(\d{8})$/.exec(id);
  if (w) return weeklyMission(null, Number(w[1]));
  return null;
}

// Défi du jour : une ligne, un tronçon et des aléas tirés au hasard, identiques pour tout le monde.
// Rame imposée (Z 2N) : tout le monde à armes égales.
export function dailyMission(date = new Date(), forcedKey = null) {
  const key = forcedKey ?? dailyKey(date);
  const rng = mulberry32(key);
  const ids = Object.keys(LINES);
  const line = LINES[ids[Math.floor(rng() * ids.length)]];
  const n = line.stations.length;
  const len = Math.min(n - 1, 5 + Math.floor(rng() * 2));
  let from = Math.floor(rng() * (n - len));
  let to = from + len;
  if (rng() < 0.5) [from, to] = [to, from];
  const weathers = ['clear', 'clear', 'rain', 'snow'];
  const weather = weathers[Math.floor(rng() * weathers.length)];
  const light = 0.1 + rng() * 0.85;
  const clock = [6 + Math.floor(rng() * 15), Math.floor(rng() * 60)];
  return {
    id: `daily-${key}`, daily: true, line: line.id, title: 'Défi du jour', from, to, clock, need: 0, weather, light, fixedRame: 'Z2N',
    blurb: `${line.name} : ${line.stations[from].name} → ${line.stations[to].name}. Même tracé, mêmes aléas et même rame (Z 2N) pour tout le monde aujourd'hui.`,
    build: (h) => {
      const r = mulberry32(key * 7 + 1); // tirage propre à chaque construction : même résultat à chaque fois
      const picks = ['signal', 'limit', 'leaves', 'animal', 'works', 'runner'];
      const dir = to > from ? 1 : -1;
      for (let s = from; s !== to; s += dir) {
        const p = picks[Math.floor(r() * picks.length)];
        if (p === 'signal') h.signal(s, s + dir, 0.4 + r() * 0.4, 5 + Math.floor(r() * 4));
        if (p === 'limit') h.limit(s, s + dir, 0.2, 0.6, r() < 0.5 ? 60 : 80, 'Courbe');
        if (p === 'leaves') h.leaves(s, s + dir, 0.2, 0.8);
        if (p === 'animal') h.animal(s, s + dir, 0.3 + r() * 0.4);
        if (p === 'works') h.works(s, s + dir, 0.3, 0.65);
        if (p === 'runner') h.runner(s + dir);
      }
    },
  };
}

// Semaine de jeu : identifiée par la date de son lundi (AAAAMMJJ)
export function weekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dailyKey(d);
}

// Défi hebdo : la couronne de régulateur. Plus long que le défi du jour, deux aléas par interstation,
// Z 2N imposée : du pur talent, remis en jeu chaque lundi.
export function weeklyMission(date = new Date(), forcedKey = null) {
  const key = forcedKey ?? weekKey(date);
  const rng = mulberry32(key * 31 + 7);
  const ids = Object.keys(LINES);
  const line = LINES[ids[Math.floor(rng() * ids.length)]];
  const n = line.stations.length;
  const len = Math.min(n - 1, 7 + Math.floor(rng() * 3));
  let from = Math.floor(rng() * (n - len));
  let to = from + len;
  if (rng() < 0.5) [from, to] = [to, from];
  const weather = ['clear', 'rain', 'snow', 'rain'][Math.floor(rng() * 4)];
  const light = 0.08 + rng() * 0.85;
  const clock = [6 + Math.floor(rng() * 16), Math.floor(rng() * 60)];
  return {
    id: `weekly-${key}`, weekly: true, line: line.id, title: 'Défi hebdo', from, to, clock, need: 0, weather, light, fixedRame: 'Z2N', crowd: 1.2,
    blurb: `${line.name} : ${line.stations[from].name} → ${line.stations[to].name}. Même tracé, mêmes aléas, même Z 2N pour tous jusqu'à dimanche soir. Le meilleur prend la couronne de régulateur.`,
    build: (h) => {
      const r = mulberry32(key * 13 + 5);
      const picks = ['signal', 'limit', 'leaves', 'animal', 'works', 'runner'];
      const dir = to > from ? 1 : -1;
      for (let s = from; s !== to; s += dir) {
        for (const f of [0.15, 0.55]) {
          const p = picks[Math.floor(r() * picks.length)];
          if (p === 'signal') h.signal(s, s + dir, f + r() * 0.25, 5 + Math.floor(r() * 5));
          if (p === 'limit') h.limit(s, s + dir, f, f + 0.3, r() < 0.5 ? 60 : 80, 'Courbe');
          if (p === 'leaves') h.leaves(s, s + dir, f, f + 0.35);
          if (p === 'animal') h.animal(s, s + dir, f + r() * 0.3);
          if (p === 'works') h.works(s, s + dir, f, f + 0.25);
          if (p === 'runner') h.runner(s + dir);
        }
      }
    },
  };
}

// Tracé concret d'une mission : gares dans le sens de marche, positions en mètres de jeu
export function buildRoute(m) {
  const line = lineOf(m);
  const dir = m.to >= m.from ? 1 : -1;
  const base = line.stations[m.from].km;
  const xOf = (k) => Math.round(Math.abs(line.stations[k].km - base) * 1000 * SCALE);
  const stations = [];
  for (let k = m.from; ; k += dir) {
    const short = line.stations[k].quai === 'court';
    stations.push({ k, name: line.stations[k].name, region: line.stations[k].region, x: xOf(k), short, plat: short ? PLATFORM : PLATFORM_LONG });
    if (k === m.to) break;
  }
  const span = (a, b, f0, f1) => {
    const xa = xOf(a);
    const xb = xOf(b);
    const p = xa + (xb - xa) * f0;
    const q = xa + (xb - xa) * f1;
    return { from: Math.round(Math.min(p, q)), to: Math.round(Math.max(p, q)) };
  };
  const inRoute = (a, b) => {
    const lo = Math.min(m.from, m.to);
    const hi = Math.max(m.from, m.to);
    return Math.min(a, b) >= lo && Math.max(a, b) <= hi;
  };
  const tunnels = (line.tunnels ?? []).filter((t) => inRoute(t.a, t.b)).map((t) => span(t.a, t.b, t.f0, t.f1));
  const bridges = (line.bridges ?? []).filter((b) => inRoute(b.a, b.b)).map((b) => {
    const c = span(b.a, b.b, b.f, b.f).from;
    return { from: c - b.len / 2, to: c + b.len / 2 };
  });
  for (const s of stations) s.under = tunnels.some((t) => s.x - s.plat >= t.from - 5 && s.x <= t.to + 5);
  return { line, dir, stations, tunnels, bridges, xOf };
}

export function regionAt(route, x) {
  let r = route.stations[0].region;
  for (const s of route.stations) if (x >= s.x - 120) r = s.region;
  return r;
}

export const inTunnel = (route, x) => route.tunnels.some((t) => x >= t.from && x <= t.to);

// Construit la liste concrète des arrêts et aléas d'une mission.
export function buildMission(m) {
  const route = buildRoute(m);
  const at = (a, b, f) => Math.round(route.xOf(a) + (route.xOf(b) - route.xOf(a)) * f);
  const course = { limits: [], signals: [], leaves: [], animals: [], works: [], runners: new Set(), passengers: {} };
  const h = {
    limit: (a, b, f0, f1, kmh, why) => {
      const p = at(a, b, f0);
      const q = at(a, b, f1);
      course.limits.push({ from: Math.min(p, q), to: Math.max(p, q), kmh, why });
    },
    signal: (a, b, f, hold, why = 'Train de la L devant') => {
      const x = at(a, b, f);
      course.signals.push({ x, hold, why, warn: x - 260 });
    },
    leaves: (a, b, f0, f1) => { const p = at(a, b, f0); const q = at(a, b, f1); course.leaves.push({ from: Math.min(p, q), to: Math.max(p, q) }); },
    animal: (a, b, f) => course.animals.push({ x: at(a, b, f) }),
    works: (a, b, f0, f1) => {
      const p = at(a, b, f0);
      const q = at(a, b, f1);
      const from = Math.min(p, q);
      const to = Math.max(p, q);
      course.works.push({ from, to });
      course.limits.push({ from: from - 40, to: to + 20, kmh: 40, why: 'Travaux' });
    },
    runner: (k) => course.runners.add(k),
    passengers: (k, n) => { course.passengers[k] = n; },
  };
  m.build(h);
  const compo = compoOf(m);
  const crowd = (m.crowd ?? 1) * (compo === 'UM' ? 1.4 : 1);
  const stopIdx = m.stops ?? route.stations.slice(1).map((s) => s.k);
  const at2 = (k) => route.stations.find((s) => s.k === k);
  const stops = stopIdx.map((k) => ({
    k, name: route.line.stations[k].name, x: route.xOf(k),
    pax: Math.round((course.passengers[k] ?? (k === m.to ? 12 : 26 + ((k * 37) % 30))) * (k === m.to ? 1 : crowd)),
    runner: course.runners.has(k),
    plat: at2(k).plat, short: at2(k).short,
  }));
  const passes = route.stations.slice(1).filter((s) => !stopIdx.includes(s.k)).map((s) => ({ k: s.k, name: s.name, x: s.x, plat: s.plat }));
  return {
    ...m,
    route,
    lineLimit: route.line.limit,
    compo,
    trainLen: compo === 'UM' ? TRAIN_LEN * 2 : TRAIN_LEN,
    // une UM a deux fois plus de portes ; sur un quai court, la deuxième rame reste hors quai
    boardMult: compo === 'UM' ? 1.8 : 1,
    start: 0,
    end: route.xOf(m.to),
    stops,
    passes,
    ...course,
    runners: undefined,
  };
}
