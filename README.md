# Ukipu

*Régulation Île-de-France.* Tu hérites de la ligne U, à toi de la tenir.

Le document de game design est dans [`docs/GDD.md`](docs/GDD.md).

## V0.2 — prototype

Un service de 5 minutes sur la ligne U (lundi de pointe, 06:30 → 09:30), sans serveur, dans l'univers des écrans en gare.

- **Incidents** (carré orange) : chacun propose plusieurs réponses — le spécialiste, un autre agent, ou une solution alternative avec sa contrepartie (voie unique, évacuation, marche à vue…).
- **Trains** : touchez-les pour les retenir, les passer en direct, leur faire faire demi-tour ou les supprimer. Raccourcis : glisser vers l'avant = direct, vers l'arrière = demi-tour.
- **Dilemmes** : journaliste à bord, conducteur volontaire, visite du directeur, rame neuve, la N qui demande le passage… 14 secondes pour trancher.
- **Séries** : enchaîner les trains à l'heure débloque des bonus (agents disponibles, applaudissements).
- **Poste de Versailles en panne** : touchez « GO » sur chaque train, un à la fois.
- Score : régularité (trains arrivés au terminus avec moins de 5 min de retard). Si la satisfaction tombe à zéro, le service est interrompu.

## Lancer en local

Aucune installation : ce sont des fichiers statiques.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Ajouter `?vitesse=4` à l'adresse pour accélérer une partie de test.

## Calibrer la difficulté

La simulation est déterministe (seed + actions) et tourne aussi sans navigateur :

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
| `index.html`, `css/style.css` | Interface (PWA, iPhone et PC) |
| `js/data.js` | Ligne U, personnel, incidents, scénario |
| `js/sim.js` | Simulation déterministe — réutilisable côté serveur pour rejouer une partie |
| `js/render.js` | Dessin du TCO (schéma de ligne) sur Canvas |
| `js/main.js` | Boucle de jeu, panneaux, écrans |
| `tools/headless.js` | Simulations sans affichage pour l'équilibrage |
