# Pass Navigo : brancher le paiement (Stripe)

Le Pass est déjà dans le jeu (onglet **Saison**). Tant que Stripe n'est pas branché, le bouton
affiche « Paiement bientôt disponible ». Pour l'activer, il faut deux secrets dans Cloudflare.

## Ce que vend le jeu

- **Pass Navigo du mois** : 2,99 €, paiement unique, valable jusqu'à la fin du mois en cours,
  sans renouvellement automatique. On peut aussi **l'offrir à un pote** (le fil d'actu l'annonce).
- La piste gratuite de la saison reste ouverte à tous. Le Pass ajoute la piste Pass (2 Colis
  Navigo, livrée du mois, klaxon, traînée et emote du fantôme, badge 🎫, nom de rame, cadre doré)
  et du confort (caisses à 8 h, 3 chantiers). Jamais de rames, de points ni d'avantage sur les défis.

## 1. Le compte Stripe

1. Crée un compte sur https://dashboard.stripe.com/register (à ton nom, comme particulier).
2. Pour encaisser pour de vrai, Stripe demande ta pièce d'identité et ton RIB (« Activer les paiements »).
   Tu peux tout tester avant, en **mode test**, sans rien fournir.
3. Les conditions de vente et les mentions se règlent dans Stripe :
   **Paramètres → Paramètres publics** (nom affiché, e-mail de contact) et
   **Paramètres → Checkout** (lien vers tes conditions).

## 2. La clé secrète → Cloudflare

1. Stripe : **Développeurs → Clés API** → copie la **clé secrète** (`sk_test_…` en mode test, `sk_live_…` ensuite).
2. Cloudflare : **Workers & Pages → ukipu → Paramètres → Variables et secrets → Ajouter**.
   - Type : **Secret**
   - Nom : `STRIPE_SECRET`
   - Valeur : la clé copiée
3. Enregistre puis redéploie si Cloudflare le propose. Le bouton « Prendre le Pass » apparaît.

Ça suffit pour vendre : au retour de la page de paiement, le jeu demande à Stripe si c'est payé
et active le Pass.

## 3. Le webhook (recommandé)

Il active le Pass même si le joueur ferme la page avant d'être revenu dans le jeu.

1. Stripe : **Développeurs → Webhooks → Ajouter une destination**.
   - Adresse : `https://ukipu.antiprod.workers.dev/api/stripe/webhook` (ou ton domaine)
   - Événement : `checkout.session.completed`
2. Copie le **secret de signature** (`whsec_…`).
3. Cloudflare : ajoute un second secret `STRIPE_WEBHOOK_SECRET` avec cette valeur.

## 4. Tester

En mode test, achète le Pass avec la carte `4242 4242 4242 4242`, une date future et n'importe
quel code. Le Pass doit s'activer et le fil d'actu afficher « 🎫 … a pris son Pass Navigo ».
Quand tout marche, remplace les deux secrets par les versions **live** (nouvelle clé `sk_live_…`
et nouveau webhook créé en mode live).

## Où voir les ventes

- Dans Stripe : **Paiements**.
- Dans la console D1 : `SELECT * FROM passes ORDER BY id DESC;` (une ligne par Pass, avec
  l'acheteur dans `by_user` quand c'est un cadeau).
