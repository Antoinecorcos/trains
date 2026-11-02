# Ukipu

*Régulation Île-de-France.* Tu hérites de la ligne U, à toi de la tenir.

Le document de game design est dans [`docs/GDD.md`](docs/GDD.md).

## V0.3 — mode conduite

Tu conduis la Z 2N de la ligne U, gare par gare. Missions de 1 min 30 à 2 min 30.

- **Manipulateur** (à droite) : vers le haut = traction, vers le bas = freinage, tout en bas = freinage d'urgence. Au clavier : flèches haut/bas, `0` pour le neutre.
- **Arrêt précis** : s'arrêter pile sur le repère en bout de quai. PARFAIT (< 0,5 m), SUPER, BIEN, OK… Les arrêts parfaits enchaînés font monter le combo.
- **Portes** : fermer dès que tout le monde est monté (trop tôt = voyageurs restés à quai, trop tard = temps perdu). Parfois un retardataire court sur le quai.
- **Horaire** : arriver pile à l'heure rapporte des points ; impossible de repartir avant l'heure de départ.
- **Aléas** : signaux fermés (train de la L ou de la N devant), limitations (KVB si survitesse), feuilles mortes et pluie (patinage, enrayage), sanglier et agents sur la voie (klaxon !).
- **Fantôme** : le conducteur titulaire, puis ton propre record, roulent avec toi.
- **Progression** : 5 missions débloquées par les étoiles + un défi du jour identique pour tout le monde.

Le mode régulation (V0.2) reste jouable via `regulation.html`.

## Lancer en local

Aucune installation : ce sont des fichiers statiques.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Ajouter `?vitesse=4` à l'adresse pour accélérer une partie de test.

## Calibrer la difficulté

La simulation est déterministe (seed + actions) et tourne aussi sans navigateur :

```bash
node tools/drive-test.js
```

```bash
node tools/headless.js 30 idle
```

```bash
node tools/headless.js 30 bot
```

`idle` ne fait rien, `bot` envoie le bon agent sur chaque incident et gère le poste d'aiguillage.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `css/drive.css` | Mode conduite (PWA, iPhone et PC) |
| `js/drive/route.js` | Tracé de la U, missions, aléas, défi du jour |
| `js/drive/sim.js` | Physique et règles de conduite déterministes, conducteur titulaire (IA) |
| `js/drive/world.js` | Vue de côté : décors en parallaxe, quais, Z 2N |
| `js/drive/main.js`, `js/drive/audio.js` | Pupitre, écrans, sons synthétisés |
| `regulation.html`, `css/style.css` | Ancien mode régulation |
| `js/data.js` | Ligne U, personnel, incidents, scénario |
| `js/sim.js` | Simulation déterministe — réutilisable côté serveur pour rejouer une partie |
| `js/render.js` | Dessin du TCO (schéma de ligne) sur Canvas |
| `js/main.js` | Boucle de jeu, panneaux, écrans |
| `tools/headless.js` | Simulations sans affichage pour l'équilibrage |
