# Ukipu

*Régulation Île-de-France.* Tu hérites de la ligne U, à toi de la tenir.

Le document de game design est dans [`docs/GDD.md`](docs/GDD.md).

## V0.3 — mode conduite

Tu conduis la Z 2N de la ligne U, gare par gare. Missions de 4 à 6 arrêts (environ 4 à 5 min), et la ligne complète pour les acharnés.

- **Manipulateur** (à droite) : vers le haut = traction, vers le bas = freinage, tout en bas = freinage d'urgence. Au clavier : flèches haut/bas, `0` pour le neutre.
- **Arrêt précis** : s'arrêter pile sur le repère en bout de quai. PARFAIT (< 0,5 m), SUPER, BIEN, OK… Les arrêts parfaits enchaînés font monter le combo.
- **Portes** : fermer dès que tout le monde est monté (trop tôt = voyageurs restés à quai, trop tard = temps perdu). Parfois un retardataire court sur le quai.
- **Horaire** : arriver pile à l'heure rapporte des points ; impossible de repartir avant l'heure de départ.
- **Aléas** : signaux fermés (train de la L ou de la N devant), limitations (KVB si survitesse), feuilles mortes et pluie (patinage, enrayage), sanglier et agents sur la voie (klaxon !).
- **Fantôme** : le conducteur titulaire, puis ton propre record, roulent avec toi.
- **Progression** : 5 missions débloquées par les étoiles + un défi du jour identique pour tout le monde.

Le mode régulation (V0.2) reste jouable via `public/regulation.html`.

## V0.4 — en ligne

- **Comptes** (pseudo + mot de passe), **classement par mission**, **classement général** (étoiles, couronnes).
- **Le serveur fait foi** : chaque partie est envoyée sous forme de journal des commandes et **rejouée** par le serveur, qui recalcule le score. Impossible d'envoyer un faux score.
- **Fantômes des potes** : avant chaque mission, on choisit contre qui rouler (le leader 👑 par défaut, un pote, son record ou le titulaire).
- **Fil d'actu** : couronnes prises et perdues, 3 étoiles, sans-faute… et les sangliers percutés.
- Sans serveur (fichiers locaux, page de démonstration), le jeu reste jouable hors ligne.

Mise en ligne : voir [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Lancer en local

Aucune installation : ce sont des fichiers statiques.

```bash
python3 -m http.server 8000 --directory public
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
| `public/index.html`, `public/css/drive.css` | Mode conduite (PWA, iPhone et PC) |
| `public/js/drive/route.js` | Tracé de la U, missions, aléas, défi du jour |
| `public/js/drive/sim.js` | Physique et règles de conduite déterministes, conducteur titulaire (IA) |
| `public/js/drive/world.js` | Vue de côté : décors en parallaxe, quais, Z 2N |
| `public/js/drive/main.js`, `public/js/drive/audio.js` | Pupitre, écrans, sons synthétisés |
| `public/js/drive/api.js` | Accès au serveur (comptes, parties, classements, fantômes) |
| `server/worker.js`, `wrangler.toml` | Serveur Cloudflare (Worker + D1) |
| `public/regulation.html`, `public/css/style.css` | Ancien mode régulation |
| `public/js/data.js` | Ligne U, personnel, incidents, scénario |
| `public/js/sim.js` | Simulation déterministe — réutilisable côté serveur pour rejouer une partie |
| `public/js/render.js` | Dessin du TCO (schéma de ligne) sur Canvas |
| `public/js/main.js` | Boucle de jeu, panneaux, écrans |
| `tools/headless.js` | Simulations sans affichage pour l'équilibrage |
| `tools/drive-test.js`, `tools/api-test.js` | Tests du mode conduite et de l'API |
