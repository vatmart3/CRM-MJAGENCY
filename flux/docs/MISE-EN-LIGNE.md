# Mettre FLUX en ligne

Objectif : Jérémy et Matheis ouvrent FLUX depuis l'ordinateur ou le téléphone et voient les mêmes chiffres en temps réel.

FLUX réutilise **le même projet Supabase que le cockpit** (même liste de membres `allowed_emails`, mêmes comptes) mais garde ses propres tables. Il se déploie comme **un second projet Vercel** pointé sur le dossier `flux/` du même dépôt.

Tant que les variables ne sont pas renseignées, FLUX fonctionne en **mode local** : les données restent dans le navigateur, et un sélecteur permet de passer de Jérémy à Matheis pour tester les droits.

---

## 1. Créer les tables de FLUX

1. Supabase → **SQL Editor** → **New query**.
2. Coller tout le contenu de `flux/supabase/flux.sql`, puis **Run**.

Le script crée :

| Élément | Rôle |
|---|---|
| `flux_records` | Toutes les données : clients, projets, recettes, dépenses, catégories, abonnements, déclarations, résumés hebdo, réglages |
| `flux_journal` | Journal d'historique, **en ajout seul** : la base refuse toute modification ou suppression |
| bucket `flux-justificatifs` | Photos de tickets et PDF de factures, privés, ouverts par lien signé |
| règles de sécurité | Seuls les membres lisent et écrivent ; seul l'administrateur (Jérémy) modifie les réglages et les catégories ; **aucune suppression possible**, pour personne |

Le script se relance sans risque. Si FLUX vit dans un projet Supabase à part, il crée aussi la table `allowed_emails` : y ajouter les deux adresses.

```sql
insert into public.allowed_emails (email, user_key) values
  ('adresse.de.jeremy@…', 'jeremy'),
  ('adresse.de.matheis@…', 'matheis')
on conflict (email) do nothing;
```

`jeremy` = administrateur (accès total + Réglages). `matheis` = associé (saisie et tableau de bord, pas de réglages).

## 2. Déployer sur Vercel

1. Vercel → **Add New** → **Project** → importer le dépôt `crm-mjagency` **une seconde fois**.
2. **Root Directory** : choisir `flux`. C'est ce qui sépare FLUX du cockpit.
3. Les réglages de build sont lus dans `flux/vercel.json` : ne rien changer.
4. **Environment Variables** :

   | Name | Value | Remarque |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://votre-ref.supabase.co` | les mêmes que le cockpit |
   | `VITE_SUPABASE_ANON_KEY` | la clé publiable | garder le préfixe `VITE_` |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | facultatif, **sans** préfixe `VITE_` |

5. **Deploy**. Les variables `VITE_` sont lues au build : si vous les ajoutez après coup, relancez un déploiement.

Au premier lancement connecté, FLUX dépose dans la base les catégories de dépenses, l'abonnement Figma d'exemple et les réglages. Si des données avaient été saisies en mode local dans ce navigateur, elles partent avec.

## 3. Sur le téléphone

Ouvrir l'adresse Vercel dans Safari ou Chrome, puis **Partager → Sur l'écran d'accueil**. FLUX s'ouvre alors en plein écran comme une application, avec le dock en bas et le bouton « + » au centre.

## 4. L'IA (facultatif, payant à l'usage)

Sans clé, tout fonctionne gratuitement :
- le **scan de ticket** lit la photo dans le navigateur (reconnaissance de caractères) ;
- l'**assistant** répond aux questions courantes avec son moteur de calcul local ;
- le **résumé du lundi** est rédigé à partir de règles simples.

Avec `ANTHROPIC_API_KEY`, Claude prend le relais : lecture des tickets plus fiable (même froissés ou en PDF), questions libres, résumé plus fin. La fonction `api/ai.ts` vérifie que l'appelant est connecté et figure dans `allowed_emails` avant tout appel.

## 5. Premiers réglages (Jérémy)

Dans **Réglages** :
1. Vérifier les **taux URSSAF** (cotisations, CFP, versement libératoire), les **seuils de TVA** et le **plafond micro** sur autoentrepreneur.urssaf.fr, puis cliquer « J'ai vérifié ces valeurs ».
2. Saisir le **solde du compte pro** à une date donnée : c'est le point de départ de la trésorerie estimée.
3. Régler l'**objectif mensuel**, la **périodicité** de déclaration et la **répartition par défaut** entre associés.
4. Compléter le montant de l'abonnement **Figma** dans Abonnements.
