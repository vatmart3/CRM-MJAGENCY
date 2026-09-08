# Mettre le cockpit en ligne, à deux

Objectif : Jérémy et Matheis ouvrent la même app, depuis n'importe quel appareil, et voient les mêmes données en temps réel.

Il y a deux briques à installer. La base de données chez **Supabase**, et l'hébergement du site chez **Vercel**. Les deux ont une formule gratuite qui couvre largement les besoins de l'agence. Comptez trente minutes en tout.

Tant que les variables d'environnement ne sont pas renseignées, l'app continue de fonctionner en local dans le navigateur, exactement comme aujourd'hui. Rien ne casse pendant l'installation.

---

## 1. Créer la base de données

1. Aller sur [supabase.com](https://supabase.com) et créer un compte.
2. Créer un projet. Choisir la région **Europe (Paris ou Francfort)** pour la rapidité et pour que les données restent en Europe.
3. Noter le mot de passe de la base que Supabase demande. Il ne sert pas à l'app, mais il est utile pour l'administration.

## 2. Créer les tables

1. Dans le menu de gauche, ouvrir **SQL Editor**, puis **New query**.
2. Copier tout le contenu du fichier `supabase/schema.sql` de ce dépôt, le coller, cliquer sur **Run**.
3. Le script crée deux tables. `records` contient toutes les données de l'app. `allowed_emails` contient la liste des personnes autorisées.

Le script insère deux adresses d'exemple. Il faut les remplacer par les vraies. Dans **Table Editor**, ouvrir `allowed_emails` et corriger les lignes, ou relancer cette requête dans le SQL Editor :

```sql
delete from public.allowed_emails;
insert into public.allowed_emails (email, user_key) values
  ('adresse.de.jeremy@gmail.com',  'jeremy'),
  ('adresse.de.matheis@gmail.com', 'matheis');
```

La colonne `user_key` doit valoir exactement `jeremy` ou `matheis`. C'est elle qui fait que chacun est reconnu comme lui-même dans l'app.

## 3. Créer les deux comptes

1. Menu **Authentication**, puis **Users**, puis **Add user**, puis **Create new user**.
2. Saisir l'adresse et un mot de passe. Cocher **Auto Confirm User** pour éviter l'email de validation.
3. Recommencer pour la deuxième personne.

Les adresses doivent être identiques à celles de `allowed_emails`.

**Recommandé.** Dans **Authentication**, puis **Sign In / Providers**, puis **Email**, désactiver **Allow new users to sign up**. Sans cela, un inconnu peut créer un compte. Il ne verrait aucune donnée, la liste blanche l'en empêche, mais autant fermer la porte.

## 4. Récupérer les deux clés

Menu **Project Settings**, puis **API**. Deux valeurs à copier :

| Valeur | Nom dans Supabase |
|---|---|
| L'adresse du projet | Project URL |
| La clé publique | anon public |

La clé `anon` est faite pour être publique, elle part dans le code du site. Ce sont les règles de sécurité posées par le script SQL qui protègent les données, pas le secret de cette clé. En revanche la clé `service_role` ne doit jamais quitter Supabase.

## 5. Tester en local

À la racine du projet :

```bash
cp .env.example .env
```

Remplir les deux lignes avec les valeurs de l'étape 4, puis :

```bash
npm run dev
```

L'écran de connexion doit apparaître. Après connexion, la pastille en haut à droite passe de « Local » à « En ligne ».

**La première connexion envoie automatiquement en base tout le contenu pré-rempli**, les tâches du mois, le calendrier Instagram, les questions stratégiques, les offres. Les fois suivantes, l'app lit ce qui est en base.

## 6. Mettre le site en ligne

1. Aller sur [vercel.com](https://vercel.com), se connecter avec GitHub.
2. **Add New**, puis **Project**, puis importer le dépôt `crm-mjagency`.
3. Vercel détecte Vite tout seul. Ne rien changer aux réglages de build.
4. Ouvrir **Environment Variables** et ajouter les deux mêmes variables qu'à l'étape 5 :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy**.

Vercel fournit une adresse en `.vercel.app`. Un nom de domaine à vous s'ajoute ensuite dans **Settings**, puis **Domains**.

Chaque envoi de code sur la branche redéploie le site automatiquement.

---

## Comment ça marche, une fois branché

**Une seule table pour tout.** Chaque prospect, tâche, devis ou publication est une ligne de `records`, avec le nom de sa catégorie et son contenu en JSON. Cela évite de modifier la base à chaque fois qu'un champ change dans l'app.

**Écriture immédiate.** Chaque modification part en base dans les deux dixièmes de seconde, sans bouton Enregistrer.

**Temps réel.** Si Matheis déplace une carte du pipeline, elle bouge chez Jérémy sans recharger la page.

**En cas de coupure réseau.** La pastille passe au rouge et affiche « Hors ligne ». L'app reste utilisable, les données du navigateur prennent le relais. Rechargez la page une fois le réseau revenu pour resynchroniser.

**Réglage personnel.** L'utilisateur courant, Jérémy ou Matheis, est déduit du compte connecté. C'est la seule donnée qui ne se partage pas.

## Sécurité

- Seules les adresses inscrites dans `allowed_emails` peuvent lire ou écrire. La règle est appliquée par Postgres, pas par le code du site, donc elle ne se contourne pas.
- Les mots de passe sont gérés par Supabase, l'app ne les voit jamais.
- Supabase sauvegarde la base automatiquement. La commande d'export JSON dans Réglages reste utile comme copie hors ligne.

## Coût

La formule gratuite de Supabase couvre 500 Mo de base et 50 000 connexions par mois. Le cockpit d'une agence de deux personnes représente quelques milliers de lignes. Vercel est gratuit pour un usage de cette taille. Aucun paiement n'est nécessaire au démarrage.
