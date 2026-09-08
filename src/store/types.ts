export type UserId = 'jeremy' | 'matheis'
/** Assignee can also be 'both' (Les deux), 'insta' (Pilote Insta), 'deliverer' (Celui qui livre) */
export type Assignee = UserId | 'both' | 'insta' | 'deliverer'

export interface User {
  id: UserId
  name: string
  role: string
  pole: 'Production' | 'Acquisition'
  color: string
  initials: string
}

export const PIPELINE_STAGES = [
  'À contacter',
  'Contacté',
  'Conversation engagée',
  'RDV planifié',
  'Devis envoyé',
  'Gagné',
  'Perdu',
] as const
export type Stage = string

export const SOURCES = ['Terrain', 'DM Instagram', 'Appel', 'Apporteur', 'Recommandation client', 'Entrant'] as const
export type Source = (typeof SOURCES)[number]

export const CITIES = [
  'Sète', 'Frontignan', 'Balaruc-les-Bains', 'Balaruc-le-Vieux', 'Mèze', 'Marseillan', 'Bouzigues', 'Poussan', 'Gigean', 'Montpellier',
]

export interface Prospect {
  id: string
  business: string
  contactFirst: string
  contactLast: string
  phone: string
  email: string
  instagram: string
  city: string
  sector: string
  source: Source
  partnerId: string | null
  stage: Stage
  offerId: string | null
  amount: number
  assignee: UserId
  lastContact: string | null // ISO date
  nextFollowup: string | null
  notes: string
  objectionId: string | null
  createdAt: string
  wonAt?: string | null
}

export interface ProductionStep { id: string; label: string }

export interface Project {
  id: string
  client: string
  contact: string
  phone: string
  email: string
  city: string
  offerId: string
  amount: number
  depositPaid: boolean
  balancePaid: boolean
  deliveryDate: string | null
  deliveredAt: string | null
  domain: string
  url: string
  reviewAsked: boolean
  referralObtained: boolean
  addons: string[]
  steps: Record<string, boolean>
  assignee: UserId
  partnerId: string | null
  paidAt: string | null // encaissement (for commission delay)
  notes: string
  createdAt: string
}

export type QuoteStatus = 'Brouillon' | 'Envoyé' | 'Relancé' | 'Signé' | 'Refusé' | 'Expiré'
export const QUOTE_STATUSES: QuoteStatus[] = ['Brouillon', 'Envoyé', 'Relancé', 'Signé', 'Refusé', 'Expiré']

export interface QuoteLine { id: string; label: string; qty: number; unitPrice: number }

export interface Quote {
  id: string
  number: string
  client: string
  clientAddress: string
  clientEmail: string
  prospectId: string | null
  offerId: string | null
  lines: QuoteLine[]
  sentAt: string | null
  nextFollowup: string | null
  status: QuoteStatus
  notes: string
  validityDays: number
  createdAt: string
  signedAt?: string | null
}

export type PartnerStatus = 'À contacter' | 'Contacté' | 'Contrat signé' | 'Actif' | 'Inactif'
export const PARTNER_STATUSES: PartnerStatus[] = ['À contacter', 'Contacté', 'Contrat signé', 'Actif', 'Inactif']

export interface Partner {
  id: string
  name: string
  profile: string
  canInvoice: boolean
  priority: 1 | 2 | 3
  status: PartnerStatus
  commissionRate: number // %
  contactsBrought: number
  revenueGenerated: number
  commissionsDue: number
  commissionsPaid: number
  lastFollowup: string | null
  /** Date from which a due commission has been owed (client payment date). */
  dueSince: string | null
  phone: string
  email: string
  notes: string
  createdAt: string
}

export interface PartnerProfile { id: string; label: string; priority: 1 | 2 | 3 }
export interface CommissionRule { id: string; sold: string; commission: string }

export interface Task {
  id: string
  title: string
  week: 1 | 2 | 3 | 4
  assignee: Assignee
  deadline: string // free text or date
  volume: string
  done: boolean
  createdAt: string
  source?: 'planning' | 'meeting' | 'quick'
}

export interface WeekMeta { week: 1 | 2 | 3 | 4; title: string; goal: string }
export interface WeekSlot { id: string; slot: string; activity: string }

export type PostStatus = 'À produire' | 'Produit' | 'Programmé' | 'Publié'
export const POST_STATUSES: PostStatus[] = ['À produire', 'Produit', 'Programmé', 'Publié']
export type Pillar = 'Preuve' | 'Pédagogie' | 'Coulisses' | 'Local' | 'Offre'
export const PILLARS: Pillar[] = ['Preuve', 'Pédagogie', 'Coulisses', 'Local', 'Offre']
export const PILLAR_TARGETS: Record<Pillar, number> = { Preuve: 40, Pédagogie: 25, Coulisses: 15, Local: 10, Offre: 10 }

export interface Post {
  id: string
  week: 1 | 2 | 3 | 4
  format: 'Carrousel' | 'Reel' | 'Story' | 'Post'
  subject: string
  pillar: Pillar
  status: PostStatus
  publishDate: string | null
  link: string
  reach: number
  interactions: number
  messages: number
  createdAt: string
}

export interface DmLog { date: string; count: number }

export interface KpiWeek {
  id: string
  weekStart: string // ISO monday
  contacts: number
  conversations: number
  meetings: number
  quotes: number
  sales: number
  revenue: number
  delivered: number
  posts: number
  partners: number
  note: string
}

export interface KpiTargets {
  contacts: number
  conversations: number
  meetings: number
  quotes: number
  sales: number
  posts: number
  partners: number
}

export interface Offer {
  id: string
  name: string
  price: number
  priceLabel: string
  content: string
  audience: string
  color: string
}
export interface Addon { id: string; name: string; price: string; pitch: string }
export interface Objection { id: string; objection: string; answer: string }
export interface FollowupStep { id: string; day: number; moment: string; channel: string; message: string }
export interface Rule { id: string; text: string }

export interface Followup {
  id: string
  prospectId: string | null
  quoteId: string | null
  title: string
  channel: string
  message: string
  dueDate: string
  done: boolean
  assignee: UserId
  createdAt: string
}

export interface Decision { id: string; text: string; done: boolean; field?: string; fieldLabel?: string; value?: string; field2?: string; fieldLabel2?: string; value2?: string }

export type QuestionStatus = 'Non traitée' | 'En discussion' | 'Tranchée'
export const QUESTION_STATUSES: QuestionStatus[] = ['Non traitée', 'En discussion', 'Tranchée']
export interface Question { id: string; theme: string; text: string; answer: string; status: QuestionStatus; decidedAt: string | null }

export interface MeetingAction { id: string; title: string; assignee: UserId; due: string; taskId?: string }
export interface Meeting {
  id: string
  weekStart: string
  kpiWeekId: string | null
  numbers: string
  blockers: { jeremy: string; matheis: string }
  priorities: { jeremy: string[]; matheis: string[] }
  unsaid: string
  decisions: string[]
  actions: MeetingAction[]
  postponed: string[]
  createdAt: string
}

export interface AgencyInfo {
  name: string
  address: string
  siret: string
  email: string
  phone: string
  vat: string
  terms: string
  revisions: string
  instagram: string
}

export interface Settings {
  agency: AgencyInfo
  pipelineStages: string[]
  productionSteps: ProductionStep[]
  kpiTargets: KpiTargets
  capMessage: string
  instaBio: string
  dmStructure: string
  dmTemplate: string
  dmTargetPerDay: number
  rhythm: string
  currentUser: UserId
}

export interface Notification {
  id: string
  type: 'followup' | 'commission' | 'task' | 'project' | 'partner'
  text: string
  to: string
  severity: 'info' | 'warn' | 'danger'
}

// ————————————————————————————————————————————————————————————————
// Synchronisation : quelles données partent en base, et sous quelle clé.
// ————————————————————————————————————————————————————————————————

/** Collections dont chaque élément devient une ligne de la table « records ». */
export const SYNCED_COLLECTIONS = [
  'users', 'offers', 'addons', 'priceRules', 'objections', 'followupSequence', 'rules', 'partnerProfiles',
  'commissionRules', 'partnerRules', 'weekMeta', 'tasks', 'weekSlots', 'posts', 'decisions', 'questions',
  'prospects', 'projects', 'quotes', 'partners', 'kpiWeeks', 'followups', 'meetings', 'dmLogs',
] as const

/** Objets uniques stockés sous leur propre nom. */
export const SYNCED_SINGLETONS = ['settings', 'script', 'partnerWarning'] as const

/** Champ servant d'identifiant, quand ce n'est pas « id ». */
const ID_KEYS: Record<string, string> = { weekMeta: 'week', dmLogs: 'date' }
export const idKeyOf = (collection: string) => ID_KEYS[collection] ?? 'id'
