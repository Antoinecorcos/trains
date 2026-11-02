// Données de jeu : ligne U, personnel, incidents.
// Les temps sont en secondes simulées.

export const LINE_U = {
  id: 'U',
  name: 'Ligne U',
  color: '#C4245F',
  stations: [
    { name: 'La Défense', short: 'La Défense', terminus: true },
    { name: 'Puteaux', short: 'Puteaux' },
    { name: 'Suresnes-Mont-Valérien', short: 'Suresnes-M.-V.' },
    { name: 'Saint-Cloud', short: 'Saint-Cloud', turnback: true },
    { name: "Sèvres-Ville-d'Avray", short: "Sèvres-V.-d'A." },
    { name: 'Chaville-Rive-Droite', short: 'Chaville-R.-D.' },
    { name: 'Versailles-Chantiers', short: 'Versailles-Ch.', turnback: true },
    { name: "Saint-Cyr", short: 'Saint-Cyr' },
    { name: 'Saint-Quentin-en-Yvelines', short: 'St-Quentin-en-Y.', turnback: true },
    { name: 'Trappes', short: 'Trappes', turnback: true },
    { name: 'La Verrière', short: 'La Verrière', terminus: true },
  ],
  // Temps de parcours entre gares consécutives (segment s = gare s ↔ gare s+1)
  runTimes: [180, 170, 170, 230, 190, 400, 190, 260, 190, 240],
  // Tronçons partagés avec d'autres lignes (pour l'affichage et les incidents « extérieurs »)
  sharedL: [0, 1, 2, 3, 4],
  sharedNC: [6, 7, 8, 9],
  // Poids de destination (attractivité) par sens, pour répartir les descentes
  // index 0 : vers La Verrière, index 1 : vers La Défense
  alightWeight: [
    [0, 0.6, 0.7, 1, 0.6, 0.6, 3, 0.8, 4, 2, 2],
    [10, 0.8, 0.8, 1.2, 0.6, 0.6, 3, 0.6, 2, 0.6, 0],
  ],
  // Voyageurs par minute (avant profil horaire) : [vers La Verrière, vers La Défense]
  demand: [
    [26, 0], [5, 3], [6, 4], [7, 6], [5, 5], [5, 7],
    [9, 13], [3, 6], [5, 11], [2, 9], [0, 14],
  ],
};

export const RAME = { serie: 'Z 2N', capacity: 1100 };

export const CREW = [
  { id: 'aiguilleur', name: 'Karim', role: 'Aiguilleur', glyph: 'A', skill: 'Signalisation · aiguillages' },
  { id: 'maintenance', name: 'Nadia', role: 'Maintenance', glyph: 'M', skill: 'Matériel roulant' },
  { id: 'surete', name: 'Bruno', role: 'Sûreté', glyph: 'S', skill: 'Bagages · intrusions' },
  { id: 'escale', name: 'Sylvie', role: 'Escale', glyph: 'E', skill: 'Voyageurs · affluence' },
];

// natural : durée sans intervention ; specTime / otherTime : durée avec le bon agent / un autre agent
export const INCIDENTS = {
  signal: {
    label: 'Panne de signalisation', glyph: '⚡', spec: 'aiguilleur',
    natural: 1500, specTime: 300, otherTime: 720, weight: 3,
    effect: 'Marche à vue : vitesse réduite sur le tronçon, dans les deux sens.',
    annonce: 'En raison d\'une panne de signalisation entre {a} et {b}, le trafic est ralenti sur la ligne U.',
  },
  colis: {
    label: 'Bagage oublié', glyph: '◼', spec: 'surete',
    natural: 1500, specTime: 360, otherTime: 780, weight: 2,
    effect: 'Gare neutralisée : aucun train ne peut y entrer ni en sortir.',
    annonce: 'En raison d\'un bagage oublié en gare de {st}, le trafic est interrompu dans cette gare.',
  },
  malaise: {
    label: 'Malaise voyageur', glyph: '+', spec: 'escale',
    natural: 900, specTime: 240, otherTime: 540, weight: 3,
    effect: 'Le train est retenu en gare le temps de la prise en charge.',
    annonce: 'En raison d\'un malaise voyageur à bord du train {num}, celui-ci est retenu en gare.',
  },
  panne: {
    label: 'Rame avariée', glyph: '⚙', spec: 'maintenance',
    natural: 1800, specTime: 360, otherTime: 900, weight: 2,
    effect: 'Le train est immobilisé en pleine voie. Après dépannage, il roule au ralenti et rentre à l\'atelier au terminus.',
    annonce: 'En raison d\'un incident technique sur le train {num}, le trafic est perturbé entre {a} et {b}.',
  },
  personnes: {
    label: 'Personnes sur les voies', glyph: '!', spec: 'surete',
    natural: 1080, specTime: 300, otherTime: 600, weight: 1.5,
    effect: 'Circulation interrompue sur le tronçon, dans les deux sens.',
    annonce: 'En raison de la présence de personnes sur les voies entre {a} et {b}, le trafic est interrompu sur ce tronçon.',
  },
  affluence: {
    label: 'Affluence exceptionnelle', glyph: '≡', spec: 'escale',
    natural: 1200, specTime: 300, otherTime: 600, weight: 1.5,
    effect: 'Trois fois plus de voyageurs sur les quais, arrêts allongés.',
    annonce: 'En raison d\'une affluence exceptionnelle en gare de {st}, les temps d\'arrêt sont allongés.',
  },
  ligneL: {
    label: 'Train de la ligne L en difficulté', glyph: 'L', spec: null,
    natural: 720, weight: 2,
    effect: 'Incident extérieur sur les voies partagées avec la L : vitesse réduite. Aucun agent ne peut intervenir, adaptez la régulation.',
    annonce: 'En raison d\'un train de la ligne L en difficulté, le trafic est ralenti entre {a} et {b}.',
  },
  derangement: {
    label: 'Dérangement du poste d\'aiguillage', glyph: '⇄', spec: 'aiguilleur',
    natural: 1440, specTime: 480, otherTime: 900, weight: 0,
    effect: 'Commande manuelle : chaque départ de Versailles-Chantiers doit être autorisé. Deux autorisations trop rapprochées provoquent un conflit d\'itinéraire.',
    annonce: 'En raison d\'un dérangement du poste d\'aiguillage de Versailles-Chantiers, les circulations sont autorisées une par une.',
  },
};

export const SCENARIO = {
  id: 'lundi-pointe',
  title: 'Lundi, heure de pointe',
  subtitle: 'Ligne U · 06:30 – 09:30',
  stars: [85, 95],
};
