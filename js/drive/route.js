// Tracé de la ligne U en mode conduite, missions et aléas.
// Les positions sont en mètres « de jeu » : les distances réelles sont réduites (×0,19)
// pour qu'une mission dure environ 4 à 5 minutes (7 pour la ligne complète).

import { mulberry32 } from '../rng.js';

const SCALE = 0.19;
const KM = [0, 1.3, 3.1, 4.8, 7.1, 8.9, 13.4, 16.2, 20.5, 22.8, 27.2];

export const STATIONS = [
  { name: 'La Défense', region: 'defense' },
  { name: 'Puteaux', region: 'urban' },
  { name: 'Suresnes-Mont-Valérien', region: 'urban' },
  { name: 'Saint-Cloud', region: 'forest' },
  { name: "Sèvres-Ville-d'Avray", region: 'forest' },
  { name: 'Chaville-Rive-Droite', region: 'forest' },
  { name: 'Versailles-Chantiers', region: 'versailles' },
  { name: 'Saint-Cyr', region: 'plain' },
  { name: 'Saint-Quentin-en-Yvelines', region: 'newtown' },
  { name: 'Trappes', region: 'newtown' },
  { name: 'La Verrière', region: 'fields' },
].map((s, i) => ({ ...s, x: Math.round(KM[i] * 1000 * SCALE) }));

export const PLATFORM = 150; // longueur de quai (m), le repère d'arrêt est en bout de quai
export const TRAIN_LEN = 104; // une Z 2N de 4 voitures

// Région du décor à une position donnée
export function regionAt(x) {
  let r = STATIONS[0].region;
  for (const s of STATIONS) {
    if (x >= s.x - 120) r = s.region;
  }
  return r;
}

export const SERIES = {
  'Z 2N': { label: 'Z 2N', accel: 1.5, brake: 1.4, vmax: 120 / 3.6 },
};

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
// from / to : index des gares. stops : gares desservies (sinon toutes).
// hazards : construits par build(), en position relative aux gares.

export const MISSIONS = [
  {
    id: 'm1', title: 'Premiers pas', from: 0, to: 6, clock: [7, 41], need: 0,
    weather: 'clear', light: 0.55,
    blurb: 'Six arrêts de La Défense à Versailles-Chantiers. On apprend à freiner sous les tours, puis la forêt arrive.',
    tutorial: true,
    build: (h) => {
      h.limit(1, 2, 0.35, 0.75, 60, 'Courbe');
      h.signal(2, 3, 0.55, 6);
      h.leaves(4, 5, 0.3, 0.7);
      h.runner(5);
      h.passengers(6, 70);
    },
  },
  {
    id: 'm2', title: 'La traversée des bois', from: 2, to: 8, clock: [7, 52], need: 2,
    weather: 'clear', light: 0.62,
    blurb: 'De Suresnes à Saint-Quentin : feuilles mortes dans la forêt, un sanglier qui traîne et un train de la N devant.',
    build: (h) => {
      h.limit(2, 3, 0.3, 0.7, 80, 'Courbe');
      h.leaves(4, 5, 0.25, 0.75);
      h.animal(5, 6, 0.4);
      h.signal(5, 6, 0.8, 7);
      h.passengers(6, 70);
      h.signal(7, 8, 0.5, 7, 'Train de la N devant');
    },
  },
  {
    id: 'm3', title: 'Averse sur les Yvelines', from: 6, to: 10, clock: [8, 9], need: 4,
    weather: 'rain', light: 0.5,
    blurb: 'De Versailles à La Verrière sous la pluie : rails glissants, chantier à Trappes et retardataires sur les quais.',
    build: (h) => {
      h.limit(6, 7, 0.2, 0.55, 80, 'Appareils de voie');
      h.signal(7, 8, 0.5, 8, 'Train de la N devant');
      h.runner(8);
      h.works(8, 9, 0.35, 0.7);
      h.runner(9);
      h.passengers(10, 25);
    },
  },
  {
    id: 'm4', title: 'Semi-direct', from: 0, to: 10, stops: [3, 6, 8, 10], clock: [7, 33], need: 6,
    weather: 'clear', light: 0.4,
    blurb: 'Toute la ligne avec quatre arrêts seulement. Ça roule vite. Ne vous arrêtez surtout pas ailleurs.',
    build: (h) => {
      h.limit(1, 2, 0.3, 0.7, 80, 'Courbe');
      h.signal(3, 4, 0.45, 6);
      h.leaves(4, 5, 0.3, 0.9);
      h.animal(5, 6, 0.55);
      h.works(8, 9, 0.3, 0.6);
      h.signal(9, 10, 0.6, 6, 'Train de la N devant');
    },
  },
  {
    id: 'm5', title: 'Le grand tour', from: 0, to: 10, clock: [6, 58], need: 9,
    weather: 'clear', light: 0.3,
    blurb: 'La ligne U en entier, les dix arrêts, à l\'aube. Pour les acharnés : huit minutes sans relâcher.',
    build: (h) => {
      h.limit(1, 2, 0.35, 0.75, 60, 'Courbe');
      h.signal(2, 3, 0.55, 6);
      h.leaves(4, 5, 0.25, 0.75);
      h.animal(5, 6, 0.45);
      h.runner(6);
      h.limit(6, 7, 0.2, 0.55, 80, 'Appareils de voie');
      h.signal(7, 8, 0.5, 7, 'Train de la N devant');
      h.works(8, 9, 0.35, 0.7);
      h.runner(9);
    },
  },
];

// Défi du jour : un tronçon et des aléas tirés au hasard, identiques pour tout le monde ce jour-là.
export function dailyMission(date = new Date()) {
  const key = Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`);
  const rng = mulberry32(key);
  const from = Math.floor(rng() * 5);
  const len = 5 + Math.floor(rng() * 2);
  const to = Math.min(10, from + len);
  const weather = rng() < 0.4 ? 'rain' : 'clear';
  return {
    id: `daily-${key}`, daily: true, title: 'Défi du jour', from, to, clock: [7, 30 + Math.floor(rng() * 50) % 60], need: 1,
    weather, light: 0.4 + rng() * 0.5,
    blurb: `${STATIONS[from].name} → ${STATIONS[to].name}. Mêmes conditions pour tout le monde aujourd'hui.`,
    build: (h) => {
      const picks = ['signal', 'limit', 'leaves', 'animal', 'works', 'runner'];
      for (let s = from; s < to; s++) {
        const p = picks[Math.floor(rng() * picks.length)];
        if (p === 'signal') h.signal(s, s + 1, 0.4 + rng() * 0.4, 5 + Math.floor(rng() * 4));
        if (p === 'limit') h.limit(s, s + 1, 0.2, 0.6, rng() < 0.5 ? 60 : 80, 'Courbe');
        if (p === 'leaves') h.leaves(s, s + 1, 0.2, 0.8);
        if (p === 'animal') h.animal(s, s + 1, 0.3 + rng() * 0.4);
        if (p === 'works') h.works(s, s + 1, 0.3, 0.65);
        if (p === 'runner') h.runner(s + 1);
      }
    },
  };
}

// Construit la liste concrète des arrêts et aléas d'une mission.
export function buildMission(m) {
  const at = (a, b, f) => Math.round(STATIONS[a].x + (STATIONS[b].x - STATIONS[a].x) * f);
  const course = {
    limits: [], signals: [], leaves: [], animals: [], works: [], runners: new Set(), passengers: {},
  };
  const h = {
    limit: (a, b, f0, f1, kmh, why) => course.limits.push({ from: at(a, b, f0), to: at(a, b, f1), kmh, why }),
    signal: (a, b, f, hold, why = 'Train de la L devant') => {
      const x = at(a, b, f);
      course.signals.push({ x, hold, why, warn: x - 260 });
    },
    leaves: (a, b, f0, f1) => course.leaves.push({ from: at(a, b, f0), to: at(a, b, f1) }),
    animal: (a, b, f) => course.animals.push({ x: at(a, b, f) }),
    works: (a, b, f0, f1) => {
      const from = at(a, b, f0);
      const to = at(a, b, f1);
      course.works.push({ from, to });
      course.limits.push({ from: from - 40, to: to + 20, kmh: 40, why: 'Travaux' });
    },
    runner: (k) => course.runners.add(k),
    passengers: (k, n) => { course.passengers[k] = n; },
  };
  m.build(h);
  const stopIdx = m.stops ?? range(m.from + 1, m.to);
  const stops = stopIdx.map((k) => ({
    k, name: STATIONS[k].name, x: STATIONS[k].x,
    pax: course.passengers[k] ?? (k === m.to ? 12 : 26 + ((k * 37) % 30)),
    runner: course.runners.has(k),
  }));
  const passes = range(m.from + 1, m.to).filter((k) => !stopIdx.includes(k)).map((k) => ({ k, name: STATIONS[k].name, x: STATIONS[k].x }));
  return {
    ...m,
    start: STATIONS[m.from].x,
    end: STATIONS[m.to].x,
    stops,
    passes,
    ...course,
    runners: undefined,
  };
}

function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}
