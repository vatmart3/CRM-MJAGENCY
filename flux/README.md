# FLUX — gestion financière de MJAGENCY

Recettes, dépenses, URSSAF, trésorerie, rentabilité des projets et répartition entre associés, en temps réel, sur ordinateur et sur mobile.

Micro-entreprise de Jérémy Vatuone (SIRET 992 328 120 00017, 54 rue Marceau, 34200 Sète). TVA non applicable, art. 293 B du CGI : aucune TVA sur les ventes, dépenses saisies en TTC, cotisations calculées sur le **CA encaissé** à la **date d'encaissement réel**.

## Lancer

```bash
cd flux
npm install
npm run dev        # http://localhost:5174
npm run build
```

Sans variables d'environnement, FLUX tourne en mode local (données dans le navigateur). Mise en ligne partagée : **[docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md)**.

## Pages

| Route | Contenu |
|---|---|
| `/` | Tableau de bord : 4 chiffres clés, « Ce que tu gardes vraiment » avec la sphère 3D de trésorerie, objectif mensuel, 12 mois, dépenses par catégorie, seuils TVA et micro avec projection, à encaisser avec relance en un clic, échéances, meilleurs clients, assistant, résumé du lundi, série sans justificatif manquant |
| `/recettes` | Liste filtrable (statut, client, projet, période, règlement), saisie en quelques secondes, passage automatique « En retard » |
| `/depenses` | Liste filtrable, scan de ticket, indicateur de justificatif manquant, onglet Notes de frais |
| `/projets`, `/projets/:id` | Marge réelle, reste à encaisser, part de chaque associé, classement par projet et par type de prestation |
| `/clients` | Fiches clients et historique des factures |
| `/abonnements` | Coût mensuel et annuel, prélèvements à confirmer en un clic, pistes d'économie |
| `/urssaf` | Cotisations par période et par associé (chacun déclare sa part, à son taux), provision « à mettre de côté », statut des déclarations, livre des recettes |
| `/associes` | Parts de CA, charges, notes de frais et solde net de Jérémy et Matheis |
| `/exports` | Rapport mensuel PDF, livre des recettes et registre des dépenses (PDF, CSV), export CSV de toutes les tables |
| `/assistant` | Questions en langage naturel sur les chiffres, historique des résumés hebdomadaires |
| `/journal` | Journal d'historique et archives (rien n'est jamais supprimé) |
| `/reglages` | Taux, seuils, périodicité, objectif, solde de départ, catégories (administrateur) |

## ACRE

Chaque associé déclare sa part du CA encaissé (répartition du projet, sinon répartition par défaut) sur son propre compte URSSAF. Jérémy n'a pas l'ACRE, Matheis l'a : son taux de cotisations sociales est réduit (25 % par défaut, 50 % pour une activité démarrée avant le 1er juillet 2025) pour les encaissements jusqu'à la date de fin saisie dans **Réglages → ACRE**. La CFP et le versement libératoire ne changent pas.

## Droits

- **Jérémy** (administrateur) : tout, y compris Réglages, restauration d'archives et statut des déclarations URSSAF.
- **Matheis** (associé) : saisie des recettes et dépenses, tableau de bord, archivage avec motif.
- Personne ne peut supprimer définitivement : supprimer = archiver avec motif, tracé au journal. La base de données l'impose aussi (aucune règle `delete`).

## Thèmes

Le bouton lune bascule entre **Nuit**, l'interface de référence, et **Jour**, la charte MJAGENCY (#F5F5F7, bleu #0071E3). Toutes les couleurs passent par des variables CSS (`src/index.css`).

## Structure

| Fichier | Rôle |
|---|---|
| `src/types.ts` | Modèle de données |
| `src/lib/finance.ts` | Tous les calculs (cotisations, trésorerie, seuils, marges, répartition) |
| `src/store.ts` | État, traçabilité automatique (« saisi par », journal), archivage |
| `src/lib/sync.ts` | Synchronisation Supabase temps réel |
| `src/lib/files.ts` | Justificatifs (Supabase Storage, ou IndexedDB en local) |
| `src/lib/scan.ts`, `api/ai.ts` | Lecture des tickets (Claude, ou OCR dans le navigateur) |
| `src/lib/assistant.ts`, `src/lib/weekly.ts` | Assistant et résumé du lundi (Claude, ou moteur local) |
| `src/lib/exports.ts` | PDF et CSV |
| `supabase/flux.sql` | Tables, sécurité, temps réel, stockage |

Stack : Vite · React 18 · TypeScript · Tailwind · Zustand · Recharts · Three.js · jsPDF · Supabase · Claude.
