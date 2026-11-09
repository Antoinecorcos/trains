# UKIPU — Document de game design

> **Mise à jour V2 (retour au brainstorm).** La conduite reste le cœur des parties de 5 minutes,
> mais tout le jeu « de fond » imaginé au départ est revenu autour : un réseau à soi sur la carte
> (gares à rénover en temps réel, caisses à récolter), du personnel à affecter (les potes en cartes
> légendaires), le sabotage amical, la couronne de régulateur du défi hebdo, la U d'Or et le
> Bulletin trafic du lundi. Voir la section 0.

> **Mise à jour V1 (jeu complet).** Le cœur du jeu a évolué après les tests : la régulation en
> 5 minutes manquait de dynamisme. Ukipu est désormais un **jeu de conduite** (vue de côté) où
> l'on s'arrête au mètre près, gare après gare. Le reste de la vision (expansion par les
> correspondances, collection, couronnes, ego entre potes) est en place. Le résumé ci-dessous
> décrit le jeu tel qu'il est ; les sections suivantes gardent la réflexion d'origine.

## 0. Le jeu aujourd'hui (V2)

| Pilier | Ce qui est en place |
|---|---|
| **Cœur** | Conduite d'une rame : manipulateur traction/freinage, arrêt pile au repère (PARFAIT < 0,5 m, noté à l'ouverture des portes), combos, **ouverture et fermeture des portes à la main**, **phares** (pleins phares dans le noir, code en gare), horaire à tenir, départ verrouillé avant l'heure. Étoiles : 2 ★ à 40 % du score de référence, 3 ★ à 68 %. |
| **Matériel et quais** | Unité simple (US, une rame) ou unité multiple aux heures de pointe (UM, deux rames, plus de voyageurs mais deux fois plus de portes). Quais longs (225 m) ou courts (150 m) : en UM sur un quai court, la deuxième rame reste hors quai. |
| **Aléas** | Signaux fermés, limitations et contrôle de vitesse (KVB), feuilles mortes, pluie et neige (patinage, enrayage), sanglier et agents à prévenir au klaxon, retardataires, jours de grève. |
| **Réseau** | 5 lignes : **U** (9 missions), **L**, **N** (3 missions chacune), **RER C** de Versailles-Chantiers à Juvisy et **RER A** de Saint-Germain-en-Laye à Boissy-Saint-Léger (5 missions chacune), avec tunnels, ponts sur la Seine, Paris, nuit et neige. Les lignes se débloquent par les correspondances et les étoiles (L et N depuis la U, A depuis la L, C depuis la N). |
| **Défi du jour** | Ligne, tronçon, météo et aléas tirés au hasard, identiques pour tous, **rame imposée** : à armes égales. |
| **Collection** | 10 rames (Commun → Mythique) qui conduisent différemment (accélération, freinage, portes, adhérence), 5 niveaux d'amélioration ; 8 livrées visibles par les autres sur leurs fantômes. |
| **Économie** | Tickets gagnés à chaque partie, pièces détachées, 3 sortes de colis multi-contenu (tirés par le serveur), cadeau quotidien avec série de 7 jours, colis bonus pour les 3 étoiles, les couronnes et le défi du jour. |
| **Ego** | Classement par mission, couronne d'exploitant 👑 par ligne (meilleur cumul de records, avec sa collection), classement général, fantômes des potes, fil d'actu (couronnes volées, sorties légendaires, sangliers percutés). |
| **Ton réseau (V2)** | Carte schématique façon plan Transilien. Chaque ligne exploitée remplit une **caisse** (30 🎟/h + 8 par niveau de gare, plafond 5 h) à récolter d'un tap. Les **gares se rénovent** en 3 niveaux (20 min, 2 h, 6 h ; 2 chantiers en même temps) : anneaux dorés et chantiers animés sur la carte, recettes en hausse sur toutes les lignes qui desservent la gare. |
| **Personnel (V2)** | Cartes tirées des colis : agent d'escale (caisse), aiguilleur (caisse et plafond), maintenance (chantiers plus courts), régulateur (tickets des services), sûreté (bonus quand on déjoue un sabotage). Une carte par ligne, niveaux par doublons. **Les cartes légendaires sont les autres joueurs**, avec leur pseudo et un trait. |
| **Sabotage (V2)** | Un jeton par jour : on envoie un incident (signal capricieux, sanglier, feuilles, travaux, quais bondés) sur le prochain service d'un pote, sur une ligne qu'il exploite. 2 ★ sans percuter ni franchir de signal : il le déjoue et gagne le bonus ; sinon le saboteur l'empoche. Tout part dans le fil d'actu. Jamais sur les défis à armes égales. |
| **Semaine (V2)** | **Défi hebdo** (plus long, deux aléas par interstation, Z 2N imposée) : son meilleur score prend la **couronne de régulateur** 🎖️. **U d'Or** 🏆 : le pire service de la semaine (score le plus bas par rapport au potentiel). **Bulletin trafic du lundi** à copier dans le groupe. |
| **Saison et Pass (V2.4)** | Saison mensuelle à 20 paliers (piste gratuite pour tous). **Pass Navigo** à 2,99 € le mois, paiement unique, offrable : piste Pass avec 2 Colis Navigo (carte légendaire garantie), livrée du mois, klaxon, traînée et emote du fantôme, badge, nom de rame, cadre doré, caisses à 8 h et 3 chantiers. Ni rames, ni points, ni avantage sur les défis. Paiement Stripe. |
| **Incidents et survie (V2.5)** | Signal d'alarme, gare évacuée (colis suspect), malaise voyageur, trains en sens inverse (code ou salut au klaxon). Mode **Heure de pointe** hebdomadaire : 10 arrêts, 3 vies, rame imposée, classement. Annonces sonores en gare. |
| **Notifications (V2.6)** | Web Push : couronne volée, sabotage, Pass offert, caisses pleines, chantier terminé, cadeau du jour. Heures calmes 23 h – 8 h. Rappels par tâche horaire du Worker. |
| **Confiance** | Le serveur rejoue chaque partie à partir du journal des commandes : impossible d'envoyer un faux score ou de rouler avec une rame qu'on ne possède pas. |

Pas encore fait : mode duo, technicentre (usure des
rames), cartes image partageables, bonus de retour des occasionnels, extension métro, poste
d'aiguillage multi-lignes.

---


> *Ukipu · Régulation Île-de-France*
> Version 0.1 — document de travail, à valider avant le développement de la V0.

---

## 1. Pitch

Tu hérites de la **ligne U** (La Défense ↔ La Verrière), réputée la plus pourrie d'Île-de-France.
Aux commandes du poste de régulation, tu dois la rendre ponctuelle, service après service, puis
t'étendre de correspondance en correspondance jusqu'à exploiter tout le réseau RER et Transilien.

Pendant ce temps, tes potes font pareil. Chaque ligne a une **couronne** visible de tous, et
chaque naufrage s'affiche dans le **fil d'actu**.

**En une phrase :** des parties de régulation ferroviaire de 5 minutes, réalistes et sous
pression, qui alimentent un empire ferroviaire à collectionner et un classement entre potes
où l'ego est en jeu en permanence.

---

## 2. Public et piliers

**Cible :** environ 50 joueurs max, des ingénieurs de l'ESTACA (toutes filières), dont environ
50 % d'acharnés et 50 % d'occasionnels. Ils ont une culture transport, ils aiment optimiser, et
ils jouent sur iPhone et sur PC (Chrome).

| Pilier | Ce que ça veut dire concrètement |
|---|---|
| **Ego** | Couronnes nominatives sur la carte, fil d'actu public, U d'Or de la honte, sabotage, cartes partageables |
| **Addiction** | Une partie de 5 min rapporte toujours quelque chose : box multi-contenu, raretés, recettes à récolter, chantiers en cours |
| **Rejouabilité** | Étoiles par scénario, incidents aléatoires, défi hebdo à armes égales, expansion par routes différentes |
| **Réalisme** | Vraies gares, vrais tracés, vrai matériel, vraies annonces. **L'humour vient de la vérité**, pas de la caricature |
| **Équité** | Occasionnels protégés : couronne de régulateur à armes égales, bonus de retour, aucun pay-to-win |

---

## 3. Les boucles de jeu

```
[ 5 min ]   SERVICE ─► score, étoiles, recettes, box ─► (couronne ? fil d'actu ?)
[ session ] récolter recettes ─► ouvrir box ─► affecter rames/personnel ─► lancer chantier ─► service
[ jour ]    cadeau quotidien, 2–3 récoltes de caisse, jeton de sabotage, chantiers qui finissent
[ semaine ] défi hebdo (couronne de régulateur), U d'Or, Bulletin trafic du lundi
[ long ]    étendre le réseau, compléter la collection, tenir le plus de couronnes
```

---

## 4. Le service (cœur du jeu)

### 4.1 Format
- Durée : **5 minutes réelles**, qui représentent une tranche horaire accélérée (par exemple
  6h30 → 9h30).
- Vue : **plan schématique de la ligne** (style signalétique), avec gares, voies, trains en
  mouvement, quais qui se remplissent et incidents qui surgissent.
- Contrôles : uniquement des taps ou clics. Jouable à une main sur iPhone, à la souris sur PC.

### 4.2 Les trois postures (C + A, B ponctuel)

**C — Directeur de ligne (base).** Décisions macro avec des contreparties :

| Décision | Effet sur la régularité | Effet sur la satisfaction |
|---|---|---|
| Injecter une rame de réserve | ++ | + |
| Terminus partiel (« ce train est limité à Trappes ») | ++ | −− |
| Omission d'arrêts (passer en direct) | + | − (gares sautées) |
| Retenir un train à quai (régulation d'intervalle) | + (évite le paquet de trains) | − léger |
| Supprimer un train | +++ (sur le papier) | −−− |
| Annonce voyageurs | 0 | + (atténue la grogne quelques instants) |
| Bus de substitution | 0 | + sur un tronçon coupé, coûte des recettes |

**A — Pompier (incidents).** Un incident apparaît sur la ligne. Tu y envoies une **carte
personnel** de ton équipe (3 à 4 cartes, chacune avec un temps de recharge). La bonne carte sur
le bon incident le résout vite, une mauvaise carte le résout lentement.

**B — Aiguilleur (événement ponctuel).** « Le poste d'aiguillage de Versailles-Chantiers est en
dérangement : passe en manuel. » Pendant 30 à 45 s, tu gères les itinéraires à la main à un
nœud précis. C'est un moment de tension façon « mini-boss ».

### 4.3 Incidents (sobres et réalistes)
- Panne de signalisation
- Bagage oublié / colis suspect
- Malaise voyageur
- Personnes sur les voies
- Rame avariée (panne de matériel)
- Rupture de caténaire / chute d'arbre (scénarios orage et tempête)
- Conditions d'adhérence difficiles (feuilles mortes, scénario automne)
- Heurt d'animal (sanglier)
- Restitution tardive des travaux de nuit
- Absence de personnel de conduite
- Affluence exceptionnelle (concert, match)
- Intervention des forces de l'ordre
- Dérangement d'aiguillage (déclenche le mode B)

> Le jeu n'inclut volontairement pas l'« accident de personne », jugé hors ton.

Chaque incident a un **type** (signalisation, matériel, voyageurs, sûreté, infrastructure).
Chaque carte personnel a une **spécialité** (ex. aiguilleur ×2 sur la signalisation, agent de
sûreté ×2 sur les colis).

### 4.4 Score et fin de partie
- **📊 Régularité** (score principal, celui des couronnes) : % de trains arrivés au terminus avec
  moins de 5 min de retard, comme l'indicateur officiel de ponctualité.
- **😤 Satisfaction voyageurs** : une jauge qui baisse avec l'attente, les quais bondés, les trains
  supprimés et les terminus partiels. **À 0, le service est interrompu** : échec, et
  **message dans le fil d'actu des potes** (« ⚠️ Antoine a perdu le contrôle de la ligne U »).
- **💶 Recettes** : les voyageurs transportés, qui nourrissent le méta-jeu.
- **Fil voyageurs** (cosmétique et feedback) : des messages courts et crédibles qui défilent
  (« 25 min à La Verrière, comme d'hab »).

**Étoiles :** ⭐ service terminé · ⭐⭐ régularité ≥ seuil 1 · ⭐⭐⭐ régularité ≥ seuil 2.
Les seuils dépendent du scénario (par défaut 85 % / 95 %, mais 70 % / 80 % un jour de neige).

---

## 5. Monde 1 : la ligne U

### 5.1 Gares (12)
La Défense · Puteaux · Suresnes-Mont-Valérien · Saint-Cloud · Sèvres-Ville-d'Avray ·
Chaville-Rive-Droite · Versailles-Chantiers · Saint-Cyr ·
Saint-Quentin-en-Yvelines · Trappes · La Verrière

*(À vérifier avec les données ouvertes d'Île-de-France Mobilités pendant la V0.)*

### 5.2 Ce qui rend la U « pourrie » (et donc intéressante à jouer)
- Elle circule sur **deux réseaux** : les voies de Saint-Lazare (partagées avec la **L**, côté
  La Défense → Saint-Cloud → Viroflay) et celles de Montparnasse (partagées avec la **N** et le
  **RER C**, côté Versailles-Chantiers → La Verrière). **Un incident sur une ligne voisine
  contamine la U** : c'est une mécanique en soi.
- Des **travaux de nuit** fréquents (restitutions tardives le matin) et des **week-ends de
  fermeture** totale avec bus de substitution.
- Une ponctualité récente autour de **90–93 %**, sous l'objectif contractuel d'environ 94 %.
  Le joueur peut donc comparer sa U virtuelle à la vraie.

### 5.3 Scénarios du monde 1 (≈ 10 services étoilés)
1. **Lundi, 7h45** — tutoriel guidé, peu d'incidents.
2. **Restitution tardive** — le chantier de nuit n'est pas rendu, on démarre avec un tronçon fermé.
3. **Effet domino** — la L est perturbée et ses retards débordent sur ton tronçon partagé.
4. **Feuilles mortes** — adhérence dégradée, trains plus lents en freinage.
5. **Orage d'été** — caténaires, chutes d'arbres.
6. **Poste de Versailles en dérangement** — premier mode aiguilleur (B).
7. **Soir de concert à La Défense Arena** — affluence exceptionnelle en fin de service.
8. **Mouvement social** — service minimum, 1 train sur 2, gérer la grogne.
9. **Neige** — tout est plus lent, seuils d'étoiles abaissés.
10. **Épreuve finale : vendredi 18h, veille de vacances** — tout à la fois.

**Récompense de fin de monde :** la concession des lignes voisines.

---

## 6. Le réseau et l'expansion

- **Règle d'or :** tu ne peux obtenir la concession que d'une ligne qui **dessert une gare que tu
  exploites déjà**, contre un nombre d'étoiles donné.
- Depuis la U :
  - La Défense → **RER A**, **Transilien L**
  - Saint-Cloud / Sèvres / Chaville / Viroflay → **Transilien L**
  - Versailles-Chantiers / Saint-Cyr / Saint-Quentin → **RER C**, **Transilien N**
  - Trappes / La Verrière → **Transilien N**
- Chaque ligne est un **monde** avec ses scénarios étoilés (inspirés du vécu réel de la ligne).
- **Bonus de connectivité :** plus ton réseau est connecté, plus tes services reçoivent de
  voyageurs en correspondance, ce qui augmente la difficulté et les recettes.
- **Périmètre :** RER (A, B, C, D, E) + Transilien (H, J, K, L, N, P, R, U, V). Le métro est
  une extension future.
- **Carte du réseau** (vue « géographie stylisée ») : Seine, forêts et villes, tes lignes en
  couleur, les autres en gris, et le **pseudo du détenteur de la couronne** sur chaque ligne.

---

## 7. Collection et box

### 7.1 Box multi-contenu (façon Brawl Stars)
Une box s'ouvre en plusieurs « tirages » successifs, avec le gros lot à la fin :

> 🪙 crédits · 🔧 pièces détachées · 👷 1 carte personnel · ✨ *parfois* une rame entière

- Les box sont **gagnées en jouant** uniquement (fin de service, étoiles, défis, cadeau
  quotidien, Pass Navigo). **Elles ne sont jamais vendues contre de l'argent réel.**
- Tirage effectué **par le serveur**.

### 7.2 Raretés
**Commun · Rare · Épique · Légendaire · Mythique**
- **3 exemplaires identiques → fusion** en rareté supérieure.
- Les **pièces détachées** font monter de niveau une rame ou une carte (progression plus fine
  que la fusion).

### 7.3 Matériel roulant (liste de départ, à affiner)
Statistiques : **capacité**, **accélération**, **fiabilité** (moins de pannes), **vitesse**.

| Rareté de base | Exemples |
|---|---|
| Commun | Z 2N (Z 20500), VB 2N tractées |
| Rare | Z 50000 « Francilien », Regio 2N |
| Épique | MI 09, Z 22500 (MI 2N) |
| Légendaire | RER NG, MI 20 |
| Mythique | Z 6100 « petit gris », Z 5300 — séries historiques de collection |

*Une rame s'**affecte** à une ligne. Ton parc conditionne tes services « libres » (pas le défi
hebdo).*

### 7.4 Personnel
- Rôles : **régulateur**, **aiguilleur**, **agent de maintenance**, **agent de sûreté**,
  **agent d'escale**.
- Chaque carte a une spécialité, un temps de recharge et un trait.
- **Cartes Légendaires et Mythiques à l'effigie des joueurs** (leurs pseudos, tout le monde est
  d'accord), avec un trait écrit pour chacun.

---

## 8. Le jeu « de fond » entre les services

- **Recettes passives plafonnées** : chaque ligne exploitée remplit une caisse, qui plafonne
  au bout d'environ 4–6 h. C'est une raison de revenir 2–3 fois par jour.
- **Chantiers en temps réel** : rénovation de gare (≈ 6 h), poste d'aiguillage moderne (≈ 12 h),
  signalisation modernisée (≈ 48 h), prolongement (≈ 3 jours). Pendant les travaux, la ligne
  affiche « Travaux — bus de substitution » sur la carte. Les chantiers donnent des bonus
  permanents à la ligne.
- **Technicentre (léger)** : une rame très utilisée perd en fiabilité et peut passer en révision
  (temps réel court). Ça pousse à faire tourner sa collection.
- **Règle :** aucun timer n'empêche de jouer. Un joueur peut toujours enchaîner des services.

---

## 9. Social et ego

### 9.1 Double couronne par ligne
- **👑 Couronne d'exploitant** : meilleur score sur la ligne **avec sa collection**. Elle est
  conservée jusqu'à ce que quelqu'un fasse mieux.
- **🎖️ Couronne de régulateur** : **défi hebdo à armes égales** (même ligne, même scénario,
  même seed, même deck imposé pour tous). C'est du pur talent, et elle est réattribuée chaque
  semaine.

### 9.2 Fil d'actu
Couronnes gagnées ou perdues, sorties de rames Légendaires et Mythiques, services interrompus,
sabotages déjoués ou réussis, nouvelles concessions.

### 9.3 La U d'Or 🏆
Trophée de la honte hebdomadaire, décerné au **pire service de la semaine**. Il s'affiche sur le
profil jusqu'à ce que quelqu'un fasse pire.

### 9.4 Sabotage amical
- **1 jeton par jour.** Tu envoies un incident sur le prochain service d'un pote, sur une ligne
  qu'il exploite.
- S'il le gère bien, **c'est lui qui gagne un bonus**, et le fil d'actu annonce : « Thomas a
  déjoué le sabotage de Léa ».
- S'il échoue, le saboteur gagne un petit bonus et le droit de chambrer.

### 9.5 Contenu partageable
- **Cartes image générées** en un tap : couronne volée, rame Mythique, U d'Or…
- **Bulletin trafic du lundi** : un récap hebdo généré par le serveur, à poster dans le groupe.
- Pas de compte Insta au départ : le contenu vit dans vos groupes existants.

### 9.6 Rattrapage des occasionnels
Bonus de retour après une absence, défi hebdo jouable en 20 min, box de rattrapage.

---

## 10. Monétisation (« rembourser les frais + soutien »)

**Principe : l'argent achète du temps et du style, jamais du skill.**

- **Pass Navigo** (mensuel, ~2,99 €) : piste gratuite + piste premium (livrées, box bonus,
  quelques accélérateurs de chantier).
- **Livrées** (skins de rames) : historiques, éditions spéciales. Possibilité de **nommer ses
  rames** et de personnaliser la plaque de sa gare.
- **Confort** : accélérer un chantier, agrandir la caisse, un emplacement de technicentre en plus.
- **Interdits :** vendre des box, et toucher à la couronne de régulateur.
- Paiement via **Stripe** (web, sans commission Apple/Google). Prévu pour la V2.

---

## 11. Direction artistique et ton

- **Services** : plan schématique façon signalétique (lignes de couleur, pastilles de gares,
  typographie claire), animé et lisible sous pression.
- **Carte du réseau** : géographie stylisée de l'Île-de-France, la vitrine qu'on partage.
- **Ton : sérieux et réaliste.** Annonces au mot près (« En raison d'une panne de signalisation,
  le trafic est perturbé entre La Verrière et La Défense. Reprise estimée 18h45. »).
  Aucune blague explicite : l'humour vient de la reconnaissance.
- **Icône** : un panneau d'info voyageurs, avec un « U ».

---

## 12. Architecture technique

### 12.1 Client
- **HTML / CSS / JavaScript en modules**, sans moteur ni étape de build. Rendu des services en
  **Canvas 2D**.
- **PWA** : s'installe sur l'écran d'accueil de l'iPhone 16, fonctionne dans Chrome sur PC.
- Cibles de test prioritaires : **Safari iOS (iPhone 16)** et **Chrome desktop**.

### 12.2 Serveur — Cloudflare (compte à ton nom)
- **Cloudflare Pages** : hébergement du client.
- **Cloudflare Workers** : API (comptes, box, couronnes, fil d'actu, sabotage, chantiers).
- **D1 (SQLite)** : base de données, avec sauvegardes automatiques (Time Travel) et export
  régulier.
- **Cron Triggers** : défi hebdo, U d'Or, Bulletin du lundi.
- Coût prévu : **0 €** à l'échelle de 50 joueurs (palier payant à 5 $/mois en cas de buzz).

### 12.3 Anti-triche : le serveur fait foi
- La simulation d'un service est **déterministe** (seed + journal des actions du joueur).
- Le client envoie le journal, et le Worker **rejoue la simulation** avec le même code JS :
  le score officiel est celui du serveur.
- Les box, récompenses, chantiers et timers sont tous calculés côté serveur.

### 12.4 Données
- Tracés et gares réels issus des **données ouvertes d'Île-de-France Mobilités** /
  OpenStreetMap, simplifiés en un graphe (gares, tronçons, voies partagées) embarqué dans le jeu.

---

## 13. Feuille de route

| Étape | Contenu | Question à laquelle elle répond |
|---|---|---|
| **V0 — Prototype** | 1 service de 5 min sur la U, sans serveur, PC + iPhone. Trains, quais, 5–6 incidents, décisions C, cartes personnel, score et étoiles. | *Est-ce que réguler la U est fun ?* |
| **V1 — Lancement potes** | Serveur Cloudflare, comptes, monde 1 complet, carte réseau avec L / N / C / A, box et collection, couronne d'exploitant, fil d'actu, U d'Or, cadeau quotidien, recettes. | *Est-ce que ça accroche sur la durée ?* |
| **V2 — Enrichissement** | Sabotage, défi hebdo et couronne de régulateur, Bulletin du lundi, chantiers, technicentre, Pass Navigo et livrées (Stripe), toutes les lignes RER + Transilien. | *Est-ce que ça dure ?* |
| **Plus tard** | Mode duo coopératif, extension métro. | |

---

## 14. Points encore ouverts
- Calibrage des seuils d'étoiles et de la difficulté (on ajuste en jouant la V0).
- Liste et statistiques définitives du matériel roulant (à affiner ensemble).
- Traits des cartes personnel à l'effigie des joueurs (à collecter auprès du groupe).
- Saisonnalité : remise à zéro mensuelle des couronnes d'exploitant (calée sur le Pass Navigo)
  ou permanence jusqu'à défaite ?
- Rebirth / prestige à long terme (comme la Mutation d'Antikor) : utile ou pas ?
