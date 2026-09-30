// ─────────────────────────────────────────────────────────────────────────────
// Modèle de données de FLUX
// Montants en euros (nombres décimaux), dates au format ISO « AAAA-MM-JJ ».
// ─────────────────────────────────────────────────────────────────────────────

export type UserId = 'jeremy' | 'matheis'
export type Role = 'admin' | 'associe'

export interface Archive {
  at: string
  by: UserId
  motif: string
}

/** Champs communs : traçabilité de chaque saisie. */
export interface Meta {
  id: string
  createdAt: string
  createdBy: UserId
  updatedAt?: string
  updatedBy?: UserId
  archived?: Archive
}

/** Référence vers un justificatif (photo ou PDF). */
export interface FileRef {
  /** Chemin dans Supabase Storage, ou clé IndexedDB en mode local. */
  path: string
  name: string
  type: string
  size: number
  storage: 'cloud' | 'local'
}

export interface Client extends Meta {
  nom: string
  entreprise: string
  activite: string
  ville: string
  email: string
  telephone: string
  notes: string
}

export const PROJET_TYPES = [
  'Site vitrine',
  'Site premium',
  'Réseaux sociaux',
  'Agent IA',
  'Logiciel sur-mesure',
  'Carte NFC',
  'Fidélité',
  'Autre',
] as const
export type ProjetType = (typeof PROJET_TYPES)[number]

export const PROJET_STATUTS = ['Devis', 'En cours', 'Livré', 'Annulé'] as const
export type ProjetStatut = (typeof PROJET_STATUTS)[number]

export interface Projet extends Meta {
  nom: string
  clientId: string
  type: ProjetType
  montantPrevu: number
  statut: ProjetStatut
  dateDebut: string
  dateLivraison: string
  /** Part de Jérémy en %. Celle de Matheis vaut 100 − partJeremy. */
  partJeremy: number
}

export const MODES_REGLEMENT = ['Virement', 'CB', 'Espèces', 'Chèque', 'Stripe', 'PayPal'] as const
export type ModeReglement = (typeof MODES_REGLEMENT)[number]

export const RECETTE_STATUTS = ['Encaissée', 'En attente', 'En retard', 'Annulée'] as const
export type RecetteStatut = (typeof RECETTE_STATUTS)[number]

export interface Relance {
  at: string
  by: UserId
}

export interface Recette extends Meta {
  dateFacture: string
  dateEncaissement: string
  clientId: string
  projetId: string
  numeroFacture: string
  libelle: string
  montant: number
  mode: ModeReglement
  /** Statut saisi. « En retard » est aussi déduit automatiquement de l'échéance. */
  statut: RecetteStatut
  dateEcheance: string
  justificatif?: FileRef
  relances?: Relance[]
}

export type PayePar = 'pro' | 'jeremy' | 'matheis'
export const PAYE_PAR_LABEL: Record<PayePar, string> = {
  pro: 'Compte pro',
  jeremy: 'Jérémy perso',
  matheis: 'Matheis perso',
}

export const MODES_PAIEMENT = ['CB', 'Virement', 'Prélèvement', 'Espèces', 'Chèque', 'PayPal'] as const
export type ModePaiement = (typeof MODES_PAIEMENT)[number]

export interface Depense extends Meta {
  date: string
  fournisseur: string
  libelle: string
  categorieId: string
  montant: number
  mode: ModePaiement
  payePar: PayePar
  aRembourser: boolean
  /** Date du remboursement de la note de frais, vide tant que c'est dû. */
  rembourseLe: string
  justificatif?: FileRef
  projetId: string
  recurrente: boolean
  abonnementId: string
}

export interface Categorie extends Meta {
  nom: string
  ordre: number
  /** Mots qui aident le scan et l'assistant à reconnaître la catégorie. */
  motsCles: string
}

export type Frequence = 'mensuel' | 'annuel'

export interface Abonnement extends Meta {
  nom: string
  fournisseur: string
  montant: number
  frequence: Frequence
  prochainPrelevement: string
  actif: boolean
  utilise: boolean
  categorieId: string
  payePar: PayePar
  notes: string
}

export const DECLARATION_STATUTS = ['À faire', 'Déclarée', 'Payée'] as const
export type DeclarationStatut = (typeof DECLARATION_STATUTS)[number]

/** Une ligne par période déclarée. L'identifiant est la clé de période (2026-09 ou 2026-T3). */
export interface Declaration extends Meta {
  periode: string
  debut: string
  fin: string
  caDeclare: number
  cotisations: number
  dateLimite: string
  statut: DeclarationStatut
  declareeLe: string
  payeeLe: string
  /** Part de chaque associé, figée au moment de la déclaration. */
  parts?: Record<UserId, { ca: number; cotisations: number }>
}

export interface Rapport extends Meta {
  /** Lundi de la semaine résumée. */
  semaine: string
  resume: string
  recommandations: string[]
  source: 'ia' | 'local'
}

export type Periodicite = 'mensuelle' | 'trimestrielle'
export type Theme = 'nuit' | 'jour'

export interface Settings {
  entreprise: {
    nom: string
    titulaire: string
    siret: string
    adresse: string
    email: string
    telephone: string
    mentionTVA: string
  }
  tauxCotisations: number
  vlActif: boolean
  tauxVL: number
  tauxCFP: number
  /**
   * ACRE de chaque associé : chacun déclare sa part du CA sur son propre compte URSSAF.
   * Tant qu'elle court (encaissements jusqu'à `fin` incluse, sans limite si `fin` est vide),
   * le taux de cotisations sociales de l'associé est réduit de `reductionACRE` %.
   */
  acre: Record<UserId, { actif: boolean; fin: string }>
  /** Réduction ACRE en % du taux de cotisations sociales (la CFP et le versement libératoire ne changent pas). */
  reductionACRE: number
  seuilTVA: number
  seuilTVAMajore: number
  plafondMicro: number
  periodicite: Periodicite
  objectifMensuel: number
  /** Solde du compte pro à une date donnée, point de départ de la trésorerie estimée. */
  soldeInitial: number
  dateSoldeInitial: string
  /** Répartition par défaut des recettes sans projet, en % pour Jérémy. */
  partDefautJeremy: number
  delaiPaiementJours: number
  prefixeFacture: string
  tauxVerifies: boolean
  signatureRelance: string
}

/** Petites données partagées qui ne sont ni des réglages ni des entités. */
export interface Stats {
  /** Date depuis laquelle aucun justificatif ne manque. Vide si des pièces manquent. */
  sansManquantDepuis: string
  meilleureSerie: number
}

export type JournalAction = 'création' | 'modification' | 'archivage' | 'restauration' | 'réglages' | 'relance' | 'déclaration'

export interface JournalEntry {
  id: string
  at: string
  by: UserId
  action: JournalAction
  entity: EntityName | 'reglages'
  entityId: string
  label: string
  motif?: string
  details?: string
}

export interface Collections {
  clients: Client
  projets: Projet
  recettes: Recette
  depenses: Depense
  categories: Categorie
  abonnements: Abonnement
  declarations: Declaration
  rapports: Rapport
}
export type EntityName = keyof Collections
export const ENTITY_NAMES: EntityName[] = ['clients', 'projets', 'recettes', 'depenses', 'categories', 'abonnements', 'declarations', 'rapports']

export const ENTITY_LABEL: Record<EntityName | 'reglages', string> = {
  clients: 'Client',
  projets: 'Projet',
  recettes: 'Recette',
  depenses: 'Dépense',
  categories: 'Catégorie',
  abonnements: 'Abonnement',
  declarations: 'Déclaration URSSAF',
  rapports: 'Résumé hebdo',
  reglages: 'Réglages',
}

export const USERS: Record<UserId, { nom: string; prenom: string; role: Role; initiales: string }> = {
  jeremy: { nom: 'Jérémy Vatuone', prenom: 'Jérémy', role: 'admin', initiales: 'JV' },
  matheis: { nom: 'Matheis', prenom: 'Matheis', role: 'associe', initiales: 'M' },
}
