# Lancer Ukipu auprès des potes

Le jeu est prêt côté code. Il reste quelques réglages à faire dans Cloudflare (à ton nom) avant
d'envoyer le lien au groupe.

## 1. Passer à l'offre Workers payante (5 $/mois) — recommandé

Chaque service envoyé est **rejoué par le serveur** pour vérifier le score. Sur les missions
longues (8 à 11 minutes, le défi hebdo), ce calcul prend autour de 10 ms, soit pile la limite de
l'offre gratuite. Au-delà, Cloudflare coupe la requête (erreur 1102) et le score n'est pas enregistré.

Le jeu garde la partie sur le téléphone et la renvoie plus tard. Mais sur l'offre gratuite, le
même calcul trop long échouera à chaque nouvelle tentative.

- Tableau de bord Cloudflare → **Workers & Pages → Plans** → **Workers Paid** (5 $/mois, sans engagement).
- Rien à changer dans le code : la limite passe à 30 secondes par requête.

## 2. Un nom de domaine (optionnel)

- **Domaines → Enregistrer un domaine** dans Cloudflare (prix coûtant, environ 10 €/an pour un `.fr`,
  par exemple `ukipu.fr`).
- Puis sur le Worker `ukipu` : **Paramètres → Domaines et routes → Ajouter → Domaine personnalisé**.
- L'ancienne adresse `*.workers.dev` continue de marcher. Les comptes restent les mêmes.

## 3. Remettre les compteurs à zéro (saison 1)

Les records faits pendant les tests datent d'anciennes règles (portes automatiques, gares plus
rapprochées). Pour partir sur un classement propre, dans **D1 → ukipu → Console**, colle :

```sql
DELETE FROM best; DELETE FROM runs; DELETE FROM events; DELETE FROM sabotages; DELETE FROM schedules;
```

Les comptes, la collection (rames, livrées, personnel), les tickets et les gares rénovées sont
gardés. Pour repartir vraiment de zéro, ajoute :

```sql
DELETE FROM users; DELETE FROM sessions; DELETE FROM wallet; DELETE FROM rames; DELETE FROM livrees;
DELETE FROM boxes; DELETE FROM staff; DELETE FROM stations; DELETE FROM caisses;
```

## 4. Le message pour le groupe

> 🚆 **Ukipu** : la ligne U est à vous. Conduisez la ligne la plus pourrie d'Île-de-France,
> volez-vous les couronnes, sabotez-vous (gentiment) et évitez la U d'Or de la semaine.
> Sur iPhone : ouvrez le lien dans Safari → Partager → « Sur l'écran d'accueil ».
> 👉 *(ton adresse)*

Dans le jeu, le bouton **➕ Inviter des potes** (onglet Classement) envoie aussi un lien.

## Notifications

Rien à configurer : le serveur crée ses clés de notification au premier besoin et envoie les
rappels toutes les heures (tâche planifiée visible dans **Workers & Pages → ukipu → Paramètres →
Déclencheurs**). Sur iPhone, chaque joueur doit ajouter le jeu à l'écran d'accueil puis toucher
« Activer » sur la carte.

## 5. La première semaine

- Le **Bulletin du lundi** (Classement → 📰) se partage en image : c'est le rendez-vous du groupe.
- Les **cartes légendaires** des joueurs ont un trait tiré au hasard. Envoie à Claude une phrase
  par pote (« Freine toujours trop tôt… ») pour les personnaliser.
- À surveiller : les missions où tout le monde bloque (seuils d'étoiles), les erreurs d'envoi de
  score, et qui revient d'un jour sur l'autre.
