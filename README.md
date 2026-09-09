# MJAGENCY — Cockpit

CRM + cockpit de pilotage pour une agence web de deux personnes (Jérémy — Production, Matheis — Acquisition).

Interface sombre, épurée, une seule couleur d’accent (bleu `#0071E3`). Toutes les données du plan (tâches du mois, calendrier Instagram, questions structurantes, offres, commissions, objections, étapes de production, profils d’apporteurs) sont **pré-implantées au premier lancement** et **entièrement modifiables** depuis l’interface.

## Lancer l’app

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
npm run preview    # sert dist/
```

Par défaut, les données vivent dans le `localStorage` du navigateur (clé `mjagency-cockpit-v1`). Export / import JSON et remise à zéro depuis **Réglages → Données**.

## Mode partagé (base de données en ligne)

Pour que Jérémy et Matheis travaillent sur les mêmes données depuis n'importe quel appareil, l'app se branche sur **Supabase** (Postgres, authentification et temps réel).

```bash
cp .env.example .env   # puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
```

Sans ces variables, rien ne change : l'app reste en local. Avec elles, un écran de connexion apparaît, les données sont partagées et synchronisées en direct entre les deux comptes.

👉 **Marche à suivre complète : [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md)** — création du projet Supabase, schéma SQL, comptes, déploiement sur Vercel.

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, liste blanche des membres, règles de sécurité, temps réel |
| `src/lib/supabase.ts` | Client, activé seulement si les variables sont présentes |
| `src/lib/sync.ts` | Chargement, écriture groupée, réception des changements en direct |
| `src/components/Auth.tsx` | Écran de connexion et contrôle des accès |
| `vercel.json` | Build, redirections des routes et cache pour le déploiement |

## Pages

| Route | Écran |
|---|---|
| `/` | Tableau de bord — KPI, CA encaissé, répartition par offre, actions du jour, cap du mois |
| `/pipeline` | Pipeline — Kanban (drag & drop) + vue tableau |
| `/relances` | Relances — séquence J+1 / J+3 / J+7 / J+14 / J+30 créée automatiquement à chaque devis envoyé |
| `/clients` | Clients & projets — checklist de production en 15 étapes |
| `/devis` | Devis & facturation — générateur imprimable avec mentions légales |
| `/apporteurs` | Apporteurs d’affaires — répertoire, profils cibles, grille de commissions |
| `/planning` | Planning du mois — 4 semaines + semaine type |
| `/instagram` | Instagram — calendrier éditorial, piliers, compteur de DM, mémo |
| `/kpi` | KPI hebdomadaires — saisie, historique, graphiques, diagnostic automatique |
| `/playbook` | Playbook — offres, add-ons, script, objections, séquence de relance, 7 règles |
| `/strategie` | Stratégie — 10 décisions à acter, questions structurantes |
| `/point-hebdo` | Point hebdo — compte-rendu chronométré, actions créées en tâches |
| `/reglages` | Réglages — agence, utilisateurs, pipeline, offres, commissions, cibles, étapes |

## Stack

Vite · React 18 · TypeScript · Tailwind CSS · Zustand (persist) · Recharts · lucide-react · React Router.

## Données d’exemple

Quelques prospects, deux clients livrés, des devis, des apporteurs et quatre semaines de KPI sont fournis pour que le cockpit soit lisible dès le premier écran. Ils se suppriment depuis chaque page, ou en bloc via **Réglages → Réinitialiser**.

## Version « un seul fichier »

`npm run build:single` produit `dist-artifact/mjagency-cockpit.html` : toute l’app dans un seul fichier HTML (routeur en mode hash), à ouvrir directement ou à déposer sur n’importe quel hébergement statique.
