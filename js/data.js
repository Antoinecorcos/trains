// Données de jeu : ligne U, personnel, incidents, dilemmes, missions.
// Les temps sont en secondes simulées (1 s réelle = 36 s simulées).

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
    { name: 'Saint-Cyr', short: 'Saint-Cyr' },
    { name: 'Saint-Quentin-en-Yvelines', short: 'St-Quentin-en-Y.', turnback: true },
    { name: 'Trappes', short: 'Trappes', turnback: true },
    { name: 'La Verrière', short: 'La Verrière', terminus: true },
  ],
  // Temps de parcours entre gares consécutives (segment s = gare s ↔ gare s+1)
  runTimes: [180, 170, 170, 230, 190, 400, 190, 260, 190, 240],
  sharedL: [0, 1, 2, 3, 4],
  sharedNC: [6, 7, 8, 9],
  // Poids de destination par sens (0 : vers La Verrière, 1 : vers La Défense)
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

// Couleurs approximatives des lignes voisines, pour les pictogrammes du schéma
export const NEIGHBOURS = { L: '#7B83C2', N: '#1FA38C', C: '#E8C21C' };

export const SERIES = {
  'Z 2N': { capacity: 1100, speed: 1 },
  'Z 50000': { capacity: 1300, speed: 1.08 },
};

export const CREW = [
  { id: 'aiguilleur', name: 'Karim', role: 'Aiguilleur', initials: 'KA' },
  { id: 'maintenance', name: 'Nadia', role: 'Maintenance', initials: 'NA' },
  { id: 'surete', name: 'Bruno', role: 'Sûreté', initials: 'BR' },
  { id: 'escale', name: 'Sylvie', role: 'Escale', initials: 'SY' },
];

// natural : durée si on laisse faire ; specTime / otherTime : avec le spécialiste / un autre agent.
// alt : réponse alternative, sans agent, avec sa contrepartie.
export const INCIDENTS = {
  signal: {
    label: 'Panne de signalisation', glyph: '!', spec: 'aiguilleur',
    natural: 1500, specTime: 300, otherTime: 720, weight: 3,
    effect: 'Marche à vue sur le tronçon, dans les deux sens.',
    alt: { label: 'Voie unique', icon: '⇅', hint: 'Vitesse normale, un train à la fois' },
    annonce: 'En raison d\'une panne de signalisation entre {a} et {b}, le trafic est ralenti.',
  },
  colis: {
    label: 'Bagage oublié', glyph: '!', spec: 'surete',
    natural: 1500, specTime: 360, otherTime: 780, weight: 2,
    effect: 'Gare neutralisée : aucun train n\'y entre.',
    alt: { label: 'Sans arrêt', icon: '»', hint: 'Les trains traversent la gare' },
    annonce: 'En raison d\'un bagage oublié en gare de {st}, le trafic est interrompu dans cette gare.',
  },
  malaise: {
    label: 'Malaise voyageur', glyph: '+', spec: 'escale',
    natural: 900, specTime: 240, otherTime: 540, weight: 3,
    effect: 'Le train est retenu en gare.',
    alt: { label: 'Évacuer', icon: '⇥', hint: 'Repart vide dans 2 min' },
    annonce: 'En raison d\'un malaise voyageur à bord du train {num}, celui-ci est retenu en gare.',
  },
  panne: {
    label: 'Rame avariée', glyph: '!', spec: 'maintenance',
    natural: 1800, specTime: 360, otherTime: 900, weight: 2,
    effect: 'Le train est immobilisé en pleine voie. Réparé, il roule au ralenti puis rentre à l\'atelier.',
    alt: { label: 'Retirer', icon: '✕', hint: 'Voie dégagée en 6 min, une rame en moins' },
    annonce: 'En raison d\'un incident technique sur le train {num}, le trafic est perturbé entre {a} et {b}.',
  },
  personnes: {
    label: 'Personnes sur les voies', glyph: '!', spec: 'surete',
    natural: 1080, specTime: 300, otherTime: 600, weight: 1.5,
    effect: 'Circulation interrompue sur le tronçon.',
    alt: { label: 'Marche à vue', icon: '◐', hint: 'Reprise lente dans 4 min' },
    annonce: 'En raison de la présence de personnes sur les voies entre {a} et {b}, le trafic est interrompu.',
  },
  affluence: {
    label: 'Affluence exceptionnelle', glyph: '+', spec: 'escale',
    natural: 1200, specTime: 300, otherTime: 600, weight: 1.5,
    effect: 'Trois fois plus de voyageurs sur les quais, arrêts allongés.',
    alt: { label: 'Filtrer', icon: '⊘', hint: 'Plus d\'entrées, la grogne monte' },
    annonce: 'En raison d\'une affluence exceptionnelle en gare de {st}, les temps d\'arrêt sont allongés.',
  },
  ligneL: {
    label: 'Train de la L en difficulté', glyph: 'L', spec: null,
    natural: 840, weight: 1.5,
    effect: 'Un train de la L encombre les voies partagées : vitesse réduite.',
    alt: { label: 'Priorité U', icon: '⚑', hint: 'Fin immédiate · la L s\'en souviendra' },
    annonce: 'En raison d\'un train de la ligne L en difficulté, le trafic est ralenti entre {a} et {b}.',
  },
  ligneN: {
    label: 'Train de la N en retard', glyph: 'N', spec: null,
    natural: 900, weight: 0,
    effect: 'Un train de la N passe devant sur les voies partagées : vitesse réduite.',
    annonce: 'En raison d\'un train de la ligne N en retard, le trafic est ralenti entre {a} et {b}.',
  },
  derangement: {
    label: 'Poste d\'aiguillage en dérangement', glyph: '⇄', spec: 'aiguilleur',
    natural: 1440, specTime: 480, otherTime: 900, weight: 0,
    effect: 'Commande manuelle : chaque départ de Versailles-Chantiers doit être autorisé.',
    annonce: 'En raison d\'un dérangement du poste d\'aiguillage de Versailles-Chantiers, les circulations sont autorisées une par une.',
  },
};

// Dilemmes : un message arrive au PCC, il faut trancher vite. Le dernier choix est celui par défaut.
export const EVENTS = {
  journaliste: {
    from: 'Presse', icon: '✎',
    title: 'Journaliste à bord du {num}',
    choices: [
      { id: 'yes', label: 'Interview', hint: 'À l\'heure : article élogieux. En retard : article assassin.', tone: 'risk' },
      { id: 'no', label: 'Décliner', hint: '', tone: 'safe' },
    ],
  },
  heuresup: {
    from: 'Roulement', icon: '+',
    title: 'Didier propose un aller de plus',
    choices: [
      { id: 'yes', label: 'Accepter', hint: '+1 rame depuis La Verrière · −400 €', tone: 'good' },
      { id: 'no', label: 'Refuser', hint: '', tone: 'safe' },
    ],
  },
  directeur: {
    from: 'Direction', icon: '★',
    title: 'Le directeur visite Versailles-Chantiers',
    choices: [
      { id: 'yes', label: 'Relever le défi', hint: 'Moins de 350 voyageurs à quai de {from} à {to}', tone: 'risk' },
      { id: 'no', label: 'Esquiver', hint: 'Satisfaction −2', tone: 'safe' },
    ],
  },
  controle: {
    from: 'Sûreté', icon: '€',
    title: 'Contrôle des titres à Saint-Quentin ?',
    choices: [
      { id: 'yes', label: 'Autoriser', hint: '+600 € · arrêts allongés 15 min', tone: 'good' },
      { id: 'no', label: 'Reporter', hint: '', tone: 'safe' },
    ],
  },
  rameNeuve: {
    from: 'Technicentre', icon: '◆',
    title: 'Une Z 50000 neuve est prête',
    choices: [
      { id: 'yes', label: 'En ligne !', hint: 'Plus grande, plus rapide · à La Défense dans 10 min', tone: 'good' },
      { id: 'no', label: 'Au dépôt', hint: '', tone: 'safe' },
    ],
  },
  ligneN: {
    from: 'PCC ligne N', icon: 'N',
    title: 'La N demande à passer devant',
    choices: [
      { id: 'yes', label: 'Céder', hint: 'Vos trains ralentis 8 min · la N vous revaudra ça', tone: 'risk' },
      { id: 'no', label: 'Refuser', hint: 'La N risque de se venger', tone: 'risk' },
    ],
  },
  croissants: {
    from: 'Équipe du PCC', icon: '♥',
    title: 'Série de 5 ! L\'équipe est à bloc',
    choices: [{ id: 'ok', label: 'Merci l\'équipe', hint: 'Tous les agents sont disponibles', tone: 'good' }],
  },
  applaudissements: {
    from: 'Voyageurs', icon: '♥',
    title: 'Série de 10 ! Les voyageurs applaudissent',
    choices: [{ id: 'ok', label: 'Savourer', hint: 'Satisfaction +10', tone: 'good' }],
  },
};

export const SCENARIO = {
  id: 'lundi-pointe',
  title: 'Lundi de pointe',
  subtitle: 'La Défense ↔ La Verrière',
  stars: [85, 95],
};
