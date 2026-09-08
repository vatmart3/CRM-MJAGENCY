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

Aucun backend : les données vivent dans le `localStorage` du navigateur (clé `mjagency-cockpit-v1`). Export / import JSON et remise à zéro depuis **Réglages → Données**.

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
