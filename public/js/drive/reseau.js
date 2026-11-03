// Le jeu « de fond » entre les services, partagé par le client et le serveur :
// gares à rénover (chantiers en temps réel), caisses de recettes, personnel, sabotage amical.
import { LINES, LINE_UNLOCK, MISSIONS } from './route.js';

// ---------------------------------------------------------------------------
// Lignes exploitées : mêmes règles partout (étoiles sur la ligne qui mène à la correspondance)
// ---------------------------------------------------------------------------

export function openLinesFrom(starsOn) {
  return Object.keys(LINES).filter((id) => {
    const u = LINE_UNLOCK[id];
    return !u || starsOn(u.line) >= u.stars || starsOn(id) > 0;
  });
}

export const missionLine = (missionId) => MISSIONS.find((m) => m.id === missionId)?.line ?? null;

// Gares uniques du réseau (une gare desservie par plusieurs lignes n'existe qu'une fois)
export const STATIONS = (() => {
  const map = new Map();
  for (const l of Object.values(LINES)) {
    for (const s of l.stations) {
      if (!map.has(s.name)) map.set(s.name, { name: s.name, lines: [] });
      map.get(s.name).lines.push(l.id);
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Chantiers : rénovation des gares
// ---------------------------------------------------------------------------

export const RENOV = [
  { level: 0, name: 'Gare d\'origine' },
  { level: 1, name: 'Quais rafraîchis', tickets: 150, parts: 0, minutes: 20, what: 'Peinture, bancs neufs, écrans de quai.' },
  { level: 2, name: 'Gare rénovée', tickets: 450, parts: 10, minutes: 120, what: 'Ascenseurs, abris, accès refaits.' },
  { level: 3, name: 'Pôle d\'échanges', tickets: 1000, parts: 30, minutes: 360, what: 'Verrière, commerces, gare routière.' },
];
export const MAX_STATION = RENOV.length - 1;
export const CHANTIER_SLOTS = 2;

// ---------------------------------------------------------------------------
// Caisses : chaque ligne exploitée remplit sa caisse, qui plafonne
// ---------------------------------------------------------------------------

export const CAISSE = { base: 30, perLevel: 8, capHours: 5 };

export function caisseRate(lineId, levelOf, staffFx = {}) {
  const lv = LINES[lineId].stations.reduce((s, st) => s + (levelOf(st.name) || 0), 0);
  return (CAISSE.base + CAISSE.perLevel * lv) * (staffFx.caisse ?? 1);
}
export const caisseCap = (rate, staffFx = {}) => Math.floor(rate * (CAISSE.capHours + (staffFx.capHours ?? 0)));

// ---------------------------------------------------------------------------
// Personnel : une carte par ligne. Les cartes légendaires sont… les potes.
// ---------------------------------------------------------------------------

export const ROLES = {
  escale: { name: 'Agent d\'escale', icon: '🧍' },
  maintenance: { name: 'Agent de maintenance', icon: '🔧' },
  regulateur: { name: 'Régulateur', icon: '🎧' },
  aiguilleur: { name: 'Aiguilleur', icon: '🔀' },
  surete: { name: 'Agent de sûreté', icon: '🛡️' },
};

export const STAFF = {
  gerard: { name: 'Gérard', role: 'escale', rarity: 'commun', trait: 'Connaît chaque habitué de Puteaux par son prénom.' },
  nadia: { name: 'Nadia', role: 'maintenance', rarity: 'commun', trait: 'Répare un enrayage avec un trombone et du scotch.' },
  kevin: { name: 'Kévin', role: 'aiguilleur', rarity: 'commun', trait: 'Stagiaire, mais il a déjà tout compris au poste de Versailles.' },
  lucie: { name: 'Lucie', role: 'surete', rarity: 'commun', trait: 'Repère un colis abandonné à trois quais de distance.' },
  sandrine: { name: 'Sandrine', role: 'regulateur', rarity: 'rare', trait: 'Trente ans de nuits au PCC, plus rien ne l\'étonne.' },
  moussa: { name: 'Moussa', role: 'surete', rarity: 'rare', trait: 'A déjà raccompagné un sanglier hors du quai de Saint-Cloud.' },
  chantal: { name: 'Chantal', role: 'escale', rarity: 'rare', trait: 'Ses annonces sonores sont devenues cultes.' },
  jp: { name: 'Jean-Pierre', role: 'escale', rarity: 'epique', trait: '32 ans sur la U. Il l\'appelle « ma ligne ».' },
  ines: { name: 'Inès', role: 'maintenance', rarity: 'epique', trait: 'Cheffe de chantier : ses délais sont tenus. Toujours.' },
  bernard: { name: 'Bernard', role: 'aiguilleur', rarity: 'epique', trait: 'Fait passer trois lignes sur deux voies sans jamais un retard.' },
  titulaire: { name: 'Le titulaire', role: 'regulateur', rarity: 'legendaire', trait: 'Le fantôme que tout le monde veut battre.' },
};

const POTE_TRAITS = [
  'Ne rate jamais un arrêt PARFAIT… sauf le lundi matin.',
  'A déjà klaxonné un sanglier pendant quarante secondes.',
  'Connaît par cœur la signalisation de La Défense, et le fait savoir.',
  'Prétend que la U est la meilleure ligne d\'Île-de-France.',
  'Freine toujours trop tôt, mais avec élégance.',
  'Arrive en avance même quand la ligne est en grève.',
  'A une théorie sur chaque retard de la ligne N.',
  'Garde un plan Transilien de 2009 dans son portefeuille.',
  'Annonce les gares à voix haute, même dans sa voiture.',
  'Champion du monde du départ à l\'heure pile.',
];
const ROLE_IDS = Object.keys(ROLES);
const mix = (n) => { let x = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; return x >>> 0; };

// Carte d'un joueur : rôle et trait fixés par son identifiant
export function poteCard(userId, pseudo) {
  const h = mix(userId);
  return { name: pseudo, role: ROLE_IDS[h % ROLE_IDS.length], rarity: 'legendaire', trait: POTE_TRAITS[(h >>> 8) % POTE_TRAITS.length], pote: true };
}

export function cardDef(cardId, pseudoOf = () => null) {
  if (STAFF[cardId]) return STAFF[cardId];
  const m = /^p(\d+)$/.exec(cardId);
  if (m) return poteCard(Number(m[1]), pseudoOf(Number(m[1])) ?? 'Ancien collègue');
  return null;
}

export const STAFF_MAX_LEVEL = 5;
const RARITY_MULT = { commun: 1, rare: 1.5, epique: 2, legendaire: 3, mythique: 4 };
export const staffPower = (rarity, level) => RARITY_MULT[rarity] * (1 + 0.2 * (Math.min(level, STAFF_MAX_LEVEL) - 1));

// Effets d'une carte affectée à une ligne
export function staffFx(role, power) {
  if (role === 'escale') return { caisse: 1 + 0.12 * power };
  if (role === 'aiguilleur') return { capHours: 0.75 * power, caisse: 1 + 0.04 * power };
  if (role === 'maintenance') return { chantier: Math.max(0.4, 1 - 0.1 * power) };
  if (role === 'regulateur') return { tickets: 1 + 0.12 * power };
  if (role === 'surete') return { foil: 1 + 0.6 * power };
  return {};
}

export function staffText(role, power) {
  const fx = staffFx(role, power);
  const pct = (k) => `${Math.round((k - 1) * 100)} %`;
  if (role === 'escale') return `Caisse de la ligne +${pct(fx.caisse)}`;
  if (role === 'aiguilleur') return `Caisse +${pct(fx.caisse)}, plafond +${fx.capHours.toFixed(1).replace('.', ',')} h`;
  if (role === 'maintenance') return `Chantiers de la ligne −${Math.round((1 - fx.chantier) * 100)} %`;
  if (role === 'regulateur') return `Tickets des services de la ligne +${pct(fx.tickets)}`;
  if (role === 'surete') return `Sabotage déjoué : récompense ×${fx.foil.toFixed(1).replace('.', ',')}`;
  return '';
}

// ---------------------------------------------------------------------------
// Sabotage amical : un jeton par jour, un incident sur le prochain service d'un pote
// ---------------------------------------------------------------------------

export const SABOTAGES = {
  signal: { name: 'Signal capricieux', icon: '🚦', text: 'un signal fermé pendant 20 s' },
  sanglier: { name: 'Sanglier lâché', icon: '🐗', text: 'un sanglier sur la voie' },
  feuilles: { name: 'Tapis de feuilles', icon: '🍂', text: 'des feuilles mortes sur tout un interstation' },
  travaux: { name: 'Travaux surprise', icon: '🚧', text: 'une zone de travaux à 40 km/h' },
  affluence: { name: 'Quais bondés', icon: '👥', text: '60 % de voyageurs en plus à chaque arrêt' },
};
export const SABOTAGE_FOIL_STARS = 2; // 2 étoiles ou plus malgré le sabotage : déjoué

// Applique un sabotage à une mission (même résultat côté client et côté serveur)
export function withSabotage(m, sab) {
  if (!sab || !SABOTAGES[sab.kind] || m.daily || m.weekly) return m;
  const dir = m.to >= m.from ? 1 : -1;
  const seq = m.stops ? [m.from, ...m.stops] : [];
  if (!m.stops) for (let k = m.from; ; k += dir) { seq.push(k); if (k === m.to) break; }
  const i = Math.max(0, Math.floor((seq.length - 1) / 2) - (seq.length > 3 ? 1 : 0));
  const a = seq[i];
  const b = seq[i + 1];
  const by = sab.by ?? 'un pote';
  const out = { ...m, sabotage: { ...sab }, build: (h) => {
    m.build(h);
    if (sab.kind === 'signal') h.signal(a, b, 0.55, 20, `Sabotage de ${by}`);
    if (sab.kind === 'sanglier') h.animal(a, b, 0.6);
    if (sab.kind === 'feuilles') h.leaves(a, b, 0.05, 0.95);
    if (sab.kind === 'travaux') h.works(a, b, 0.35, 0.7);
  } };
  if (sab.kind === 'affluence') out.crowd = (m.crowd ?? 1) * 1.6;
  return out;
}
