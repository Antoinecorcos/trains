# Mettre Ukipu en ligne (Cloudflare)

**Adresse actuelle : https://ukipu.antiprod.workers.dev** (Worker `ukipu`, sous-domaine `antiprod`).

Le jeu et le serveur tournent sur **un seul Worker Cloudflare** : il sert les fichiers du jeu
et répond à l'API `/api/*`. Les données (comptes, records, fantômes, fil d'actu) sont dans une
base **D1** (SQLite). À l'échelle d'une cinquantaine de joueurs, l'offre gratuite suffit.

Chaque `git push` sur la branche de production redéploie le jeu automatiquement.

## 1. Créer le compte Cloudflare (à ton nom)

Inscription gratuite sur https://dash.cloudflare.com/sign-up. Utilise ton adresse à toi :
c'est ce compte qui détient le jeu et ses données.

## 2. Créer la base de données

1. Dans le tableau de bord : **Stockage et bases de données → D1 SQL Database → Créer**.
2. Nom : `ukipu`. Emplacement : Europe de l'Ouest si on te le propose.
3. Une fois créée, copie l'**identifiant de la base** (Database ID, une suite du type
   `1a2b3c4d-…`). Cet identifiant n'est pas secret.
4. Envoie-le à Claude, ou remplace toi-même la valeur `database_id` dans `wrangler.toml`.

Les tables sont créées automatiquement au premier appel du serveur : rien à faire dans la console D1.

## 3. Brancher le dépôt GitHub

1. **Workers & Pages → Créer → Importer un dépôt** (Import a repository).
2. Autorise Cloudflare à accéder à GitHub, puis choisis `antoinecorcos/trains`.
3. Réglages :
   - Nom du projet : `ukipu` (doit être identique au `name` de `wrangler.toml`).
   - Branche de production : `claude/train-network-game-design-56cuok` (tant que c'est la seule branche).
   - Commande de build : **laisser vide** (ne pas y mettre le nom de la branche, sinon le build échoue avec « not found »).
   - Commande de déploiement : `npx wrangler deploy`.
4. Lance le déploiement. L'adresse du jeu ressemble à `https://ukipu.<ton-sous-domaine>.workers.dev`.

Vérification : `https://ukipu.<ton-sous-domaine>.workers.dev/api/health` doit répondre `{"ok":true,…}`.

## Changer l'adresse

- Sous-domaine gratuit : **Workers & Pages → Sous-domaine → Modifier** (s'applique à tous les Workers du compte).
- Nom de domaine à soi : sur le Worker `ukipu`, **Paramètres → Domaines et routes → Ajouter → Domaine personnalisé**.

Les comptes et records sont sur le serveur : changer d'adresse ne fait rien perdre.

## 4. Sur iPhone

Ouvre l'adresse dans Safari → bouton Partager → **Sur l'écran d'accueil**. Le jeu s'ouvre alors
en plein écran comme une application.

## Limites et coûts

- Offre gratuite : 100 000 requêtes par jour, 5 Go de base de données. Largement assez pour 50 joueurs.
- Chaque partie envoyée est **rejouée par le serveur** pour recalculer le score (environ 5 ms).
  L'offre gratuite limite le calcul à 10 ms par requête : si des envois échouent avec l'erreur 1102,
  passer à l'offre Workers payante (5 $/mois) règle le problème.
- Sauvegardes : D1 garde un historique restaurable (« Time Travel ») ; on peut aussi exporter la base
  depuis le tableau de bord.

## Tester en local

```bash
npm install
```

```bash
npx wrangler dev
```

Puis ouvrir http://localhost:8787. Le script `tools/api-test.js` vérifie toute l'API :

```bash
node tools/api-test.js
```
