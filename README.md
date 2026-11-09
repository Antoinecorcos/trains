# Ukipu

*Régulation Île-de-France.* Tu hérites de la ligne U, à toi de la tenir.

**Jouer : https://ukipu.antiprod.workers.dev** (sur iPhone : Safari → Partager → Sur l'écran d'accueil).

À l'arrivée : la carte du réseau en plein écran (zoom au doigt, lignes cliquables, trains animés), puis les onglets Départs, Dépôt et Classement.

Le document de game design est dans [`docs/GDD.md`](docs/GDD.md).

## V2.5 — incidents et heure de pointe

- **Nouveaux incidents** : signal d'alarme tiré (s'arrêter dans les 380 m, attendre la levée de doute), colis suspect (gare évacuée à traverser sans s'arrêter), malaise voyageur (portes ouvertes jusqu'à l'arrivée des secours), trains qui croisent en sens inverse (code la nuit, coup de klaxon pour saluer le collègue le jour).
- **Heure de pointe** : mode survie de la semaine, 10 arrêts sur le RER A ou C, tous les incidents, 3 vies (gare brûlée, arrêt raté, signal franchi, sanglier, voyageurs laissés à quai…), rame imposée et classement.
- **Annonces sonores** : « Prochain arrêt… », nom de la gare à l'ouverture, « Attention à la fermeture des portes » (voix du téléphone).
- 2 nouvelles missions : « Jeudi noir » (U) et « Nuit blanche à Saint-Lazare » (L).

## V2.4 — saison mensuelle et Pass Navigo

- **Onglet Saison** : chaque service rapporte des points (+10, +5 par étoile, +15 pour les défis). 20 paliers par mois, piste gratuite pour tous.
- **Pass Navigo** (2,99 € le mois, paiement unique, sans abonnement, à s'offrir ou à offrir à un pote) : piste Pass avec 2 **Colis Navigo** (carte légendaire garantie, livrée, tickets, pièces), livrée du mois, klaxon de saison, traînée et emote du fantôme, badge 🎫, nom de rame, cadre doré ; caisses à 8 h et 3 chantiers. Jamais de rames ni de points.
- Paiement par Stripe : voir [`docs/PASS.md`](docs/PASS.md).

## V2.3 — prêt pour le lancement

- **Intro des nouveaux** : trois écrans puis directement le premier service, sans compte. Le score part au classement dès la création du compte.
- **Parties en attente** : un service qui n'a pas pu être envoyé (tunnel, réseau, serveur) est gardé sur l'appareil et renvoyé tout seul.
- **Cartes image à partager** : fin de service, U d'Or, régulateur de la semaine, bulletin du lundi (partage natif sur téléphone, téléchargement sur PC). Bouton **Inviter des potes**.
- **Bonus de retour** : après 3 jours d'absence, un colis rare et 250 tickets (annoncé dans le fil d'actu).
- Vérification serveur plus rapide. Check-list de mise en ligne : [`docs/LANCEMENT.md`](docs/LANCEMENT.md).

## V2.2 — le direct

- **Le direct de Rambouillet** (ligne N) : Montparnasse → Versailles-Chantiers → Rambouillet, 160 km/h autorisés, les petites gares traversées en trombe (+40 chacune au-dessus de 100 km/h).
- Les rames rapides atteignent enfin leur vitesse maxi (Regio 2N à 160 km/h) ; le compteur passe à 170 sur les lignes rapides.
- **Gares plus espacées** : au moins 460 m de jeu entre deux gares (un quai long + de quoi accélérer et freiner), fini les gares collées.

## V2.1 — au pupitre

- **Portes à la main** : à l'arrêt, c'est toi qui ouvres (bouton Portes, ou **Entrée** sur PC), puis tu refermes avec la même commande. Tant que les portes sont fermées, tu peux encore avancer doucement jusqu'au repère : l'arrêt est noté à l'ouverture.
- **Phares** : pleins phares de nuit et dans les tunnels (bouton Phares, ou **L**), code en entrant en gare pour ne pas éblouir les voyageurs. Sans phares, on ne voit presque rien devant.
- **Trains longs et quais courts** : aux heures de pointe, deux rames attelées (UM, 208 m) ; certaines gares ont un quai court où la deuxième rame reste hors quai (montée plus lente).
- **Étoiles plus accessibles** : 2 ★ à 40 % du score de référence, 3 ★ à 68 %.
- **RER A complet de Saint-Germain-en-Laye à Boissy-Saint-Léger** (tronc central sous Paris, la Marne) et **RER C jusqu'à Juvisy** (Austerlitz, les bords de Seine) : 4 nouvelles missions.

## V2 — ton réseau, tes potes

- **Carte façon plan Transilien** : tracés à 45°, correspondances en pastilles, noms qui ne grossissent pas au zoom, Seine animée, trains qui circulent.
- **Caisses** : chaque ligne exploitée rapporte des tickets en continu (plafond 5 h). Touche 💰 pour récolter.
- **Chantiers** : touche une gare pour la rénover (3 niveaux, de 20 min à 6 h, 2 chantiers à la fois). Plus de recettes sur toutes ses lignes.
- **Personnel** : cartes tirées des colis, une par ligne (escale, aiguilleur, maintenance, régulateur, sûreté). Les légendaires… ce sont les autres joueurs.
- **Sabotage amical** : un jeton par jour (😈 dans le Classement). Le pote visé le découvre avant son prochain service ; 2 ★ sans incident pour le déjouer.
- **Défi hebdo** : couronne de régulateur 🎖️, Z 2N pour tous. **U d'Or** 🏆 du pire service de la semaine. **Bulletin du lundi** à copier dans le groupe.
- Les défis du jour et de la semaine ont leurs propres cartes, avec le pictogramme de leur ligne.

## V1 — le jeu complet

- **5 lignes** : U, L, N, RER C, RER A — 21 missions + un défi du jour, tunnels, ponts sur la Seine, Paris, nuit, pluie et neige.
- **Carte du réseau** : les lignes se débloquent par les correspondances et les étoiles ; une couronne par ligne.
- **Dépôt** : 10 rames (Commun → Mythique) qui conduisent différemment, 5 niveaux d'amélioration, 8 livrées.
- **Colis** multi-contenu ouverts un objet à la fois, **tickets** et **pièces** gagnés en roulant, **cadeau quotidien** (série de 7 jours).
- Tout est vérifié par le serveur (tirages, possession des rames, scores rejoués).

## V0.3 — mode conduite

Tu conduis la Z 2N de la ligne U, gare par gare. Missions de 4 à 6 arrêts (environ 4 à 5 min), et la ligne complète pour les acharnés.

- **Manipulateur** (à droite) : vers le haut = traction, vers le bas = freinage, tout en bas = freinage d'urgence. Au clavier : flèches haut/bas, `0` pour le neutre, `Entrée` pour les portes, `L` pour les phares, espace pour le klaxon.
- **Arrêt précis** : s'arrêter pile sur le repère en bout de quai. PARFAIT (< 0,5 m), SUPER, BIEN, OK… Les arrêts parfaits enchaînés font monter le combo.
- **Portes** : les ouvrir une fois arrêté au repère, puis les fermer dès que tout le monde est monté (trop tôt = voyageurs restés à quai, trop tard = temps perdu). Parfois un retardataire court sur le quai.
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
| `public/js/drive/route.js` | Lignes, gares, missions, aléas, défis du jour et hebdo, rames, livrées, colis |
| `public/js/drive/reseau.js` | Gares à rénover, caisses, personnel, sabotages (partagé client/serveur) |
| `public/js/drive/netmap.js` | Plan du réseau sur Canvas |
| `public/js/drive/home.js` | Accueil : carte du réseau, départs, dépôt, colis, classement, fiche mission |
| `public/js/drive/sim.js` | Physique et règles de conduite déterministes, conducteur titulaire (IA) |
| `public/js/drive/world.js` | Vue de côté : décors en parallaxe, quais, Z 2N |
| `public/js/drive/main.js`, `public/js/drive/audio.js` | Pupitre, écrans, sons synthétisés |
| `public/js/drive/api.js` | Accès au serveur (comptes, parties, classements, fantômes) |
| `server/worker.js`, `server/economy.js`, `server/network.js`, `wrangler.toml` | Serveur Cloudflare (Worker + D1) : comptes, parties, économie, réseau, semaine |
| `public/regulation.html`, `public/css/style.css` | Ancien mode régulation |
| `public/js/data.js` | Ligne U, personnel, incidents, scénario |
| `public/js/sim.js` | Simulation déterministe — réutilisable côté serveur pour rejouer une partie |
| `public/js/render.js` | Dessin du TCO (schéma de ligne) sur Canvas |
| `public/js/main.js` | Boucle de jeu, panneaux, écrans |
| `tools/headless.js` | Simulations sans affichage pour l'équilibrage |
| `tools/drive-test.js`, `tools/api-test.js` | Tests du mode conduite et de l'API |
