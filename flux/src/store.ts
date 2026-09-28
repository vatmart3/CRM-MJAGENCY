import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  Collections, ENTITY_LABEL, EntityName, JournalAction, JournalEntry, Settings, Stats, Theme, UserId, USERS,
} from './types'
import { defaultSettings, defaultStats, seedAbonnements, seedCategories } from './seed'
import { nowISO } from './lib/dates'
import { eur, uid } from './lib/format'
import { pushJournal, pushSingleton, pushUpsert } from './lib/sync'

export type PeriodKind = 'mois' | 'trimestre' | 'annee' | 'perso'
export interface PeriodFilter {
  kind: PeriodKind
  /** Date de référence (le mois, trimestre ou année qui la contient). */
  ref: string
  from: string
  to: string
}

type NewItem<K extends EntityName> = Omit<Collections[K], 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'archived'> & { id?: string }

export interface FluxState {
  clients: Collections['clients'][]
  projets: Collections['projets'][]
  recettes: Collections['recettes'][]
  depenses: Collections['depenses'][]
  categories: Collections['categories'][]
  abonnements: Collections['abonnements'][]
  declarations: Collections['declarations'][]
  rapports: Collections['rapports'][]
  settings: Settings
  stats: Stats
  journal: JournalEntry[]

  // Propre à chaque appareil, jamais synchronisé.
  currentUser: UserId
  theme: Theme
  period: PeriodFilter

  create<K extends EntityName>(coll: K, item: NewItem<K>, opts?: { silent?: boolean }): Collections[K]
  update<K extends EntityName>(coll: K, id: string, patch: Partial<Collections[K]>, opts?: { silent?: boolean; action?: JournalAction; details?: string }): void
  archive(coll: EntityName, id: string, motif: string): void
  restore(coll: EntityName, id: string): void
  setSettings(patch: Partial<Settings>, details?: string): void
  setStats(patch: Partial<Stats>): void
  log(entry: Omit<JournalEntry, 'id' | 'at' | 'by'>): void
  setUser(u: UserId): void
  setTheme(t: Theme): void
  setPeriod(p: PeriodFilter): void
}

/** Libellé lisible d'un enregistrement, pour le journal. */
export const labelOf = (coll: EntityName, item: Record<string, unknown>): string => {
  switch (coll) {
    case 'clients':
      return String(item.entreprise || item.nom || 'Client')
    case 'projets':
    case 'abonnements':
    case 'categories':
      return String(item.nom || '')
    case 'recettes':
      return `${item.numeroFacture ? item.numeroFacture + ' · ' : ''}${item.libelle || 'Recette'} · ${eur(Number(item.montant) || 0)}`
    case 'depenses':
      return `${item.fournisseur || 'Dépense'} · ${eur(Number(item.montant) || 0)}`
    case 'declarations':
      return `Période ${item.periode}`
    case 'rapports':
      return `Semaine du ${item.semaine}`
  }
}

const FIELD_LABEL: Record<string, string> = {
  montant: 'montant', statut: 'statut', dateEncaissement: 'date d’encaissement', dateFacture: 'date de facture', dateEcheance: 'échéance',
  clientId: 'client', projetId: 'projet', libelle: 'libellé', numeroFacture: 'n° de facture', mode: 'mode de règlement', fournisseur: 'fournisseur',
  categorieId: 'catégorie', date: 'date', payePar: 'payé par', aRembourser: 'à rembourser', rembourseLe: 'remboursement', justificatif: 'justificatif',
  recurrente: 'récurrente', nom: 'nom', montantPrevu: 'montant prévu', partJeremy: 'répartition', prochainPrelevement: 'prochain prélèvement',
  actif: 'actif', utilise: 'utilisé', frequence: 'fréquence', entreprise: 'entreprise', email: 'e-mail', telephone: 'téléphone', ville: 'ville',
  activite: 'activité', notes: 'notes', type: 'type', dateDebut: 'début', dateLivraison: 'livraison', caDeclare: 'CA déclaré', cotisations: 'cotisations',
  tauxCotisations: 'taux de cotisations', vlActif: 'versement libératoire', tauxVL: 'taux du versement libératoire', tauxCFP: 'taux CFP',
  seuilTVA: 'seuil de franchise TVA', seuilTVAMajore: 'seuil TVA majoré', plafondMicro: 'plafond micro', periodicite: 'périodicité URSSAF',
  objectifMensuel: 'objectif mensuel', soldeInitial: 'solde de départ', dateSoldeInitial: 'date du solde de départ', partDefautJeremy: 'répartition par défaut',
  delaiPaiementJours: 'délai de paiement', prefixeFacture: 'préfixe de facture', tauxVerifies: 'taux vérifiés', signatureRelance: 'signature des relances',
}

const describeChanges = (before: Record<string, unknown>, patch: Record<string, unknown>) => {
  const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]))
  return changed.map((k) => FIELD_LABEL[k] ?? k).join(', ')
}

const thisMonth = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return { kind: 'mois' as const, ref: `${y}-${m}-01`, from: `${y}-${m}-01`, to: `${y}-${m}-${last}` }
}

export const useFlux = create<FluxState>()(
  persist(
    (set, get) => ({
      clients: [],
      projets: [],
      recettes: [],
      depenses: [],
      categories: seedCategories(),
      abonnements: seedAbonnements(),
      declarations: [],
      rapports: [],
      settings: defaultSettings,
      stats: defaultStats,
      journal: [],
      currentUser: 'jeremy',
      theme: 'nuit',
      period: thisMonth(),

      log(entry) {
        const e: JournalEntry = { id: uid(), at: nowISO(), by: get().currentUser, ...entry }
        set({ journal: [e, ...get().journal].slice(0, 2000) })
        pushJournal(e)
      },

      create(coll, item, opts) {
        const full = { ...item, id: item.id ?? uid(), createdAt: nowISO(), createdBy: get().currentUser } as unknown as Collections[typeof coll]
        const list = get()[coll] as unknown as Collections[typeof coll][]
        set({ [coll]: [...list, full] } as Partial<FluxState>)
        pushUpsert(coll, full.id, full as unknown as Record<string, unknown>)
        if (!opts?.silent)
          get().log({ action: 'création', entity: coll, entityId: full.id, label: labelOf(coll, full as unknown as Record<string, unknown>) })
        return full
      },

      update(coll, id, patch, opts) {
        const list = get()[coll] as unknown as Collections[typeof coll][]
        const before = list.find((x) => x.id === id)
        if (!before) return
        const next = { ...before, ...patch, updatedAt: nowISO(), updatedBy: get().currentUser }
        set({ [coll]: list.map((x) => (x.id === id ? next : x)) } as Partial<FluxState>)
        pushUpsert(coll, id, next as unknown as Record<string, unknown>)
        if (!opts?.silent) {
          const details = opts?.details ?? describeChanges(before as unknown as Record<string, unknown>, patch as Record<string, unknown>)
          if (details || opts?.action)
            get().log({
              action: opts?.action ?? 'modification',
              entity: coll,
              entityId: id,
              label: labelOf(coll, next as unknown as Record<string, unknown>),
              details: details ? (opts?.details ? details : `Champs modifiés : ${details}`) : undefined,
            })
        }
      },

      archive(coll, id, motif) {
        const list = get()[coll] as unknown as { id: string }[]
        const item = list.find((x) => x.id === id)
        if (!item) return
        const next = { ...item, archived: { at: nowISO(), by: get().currentUser, motif } }
        set({ [coll]: list.map((x) => (x.id === id ? next : x)) } as Partial<FluxState>)
        pushUpsert(coll, id, next as unknown as Record<string, unknown>)
        get().log({ action: 'archivage', entity: coll, entityId: id, label: labelOf(coll, next as unknown as Record<string, unknown>), motif })
      },

      restore(coll, id) {
        if (USERS[get().currentUser].role !== 'admin') return
        const list = get()[coll] as unknown as { id: string; archived?: unknown }[]
        const item = list.find((x) => x.id === id)
        if (!item) return
        const { archived, ...rest } = item
        void archived
        const next = { ...rest, updatedAt: nowISO(), updatedBy: get().currentUser }
        set({ [coll]: list.map((x) => (x.id === id ? next : x)) } as Partial<FluxState>)
        pushUpsert(coll, id, next as unknown as Record<string, unknown>)
        get().log({ action: 'restauration', entity: coll, entityId: id, label: labelOf(coll, next as unknown as Record<string, unknown>) })
      },

      setSettings(patch, details) {
        if (USERS[get().currentUser].role !== 'admin') return
        const changed = details ?? describeChanges(get().settings as unknown as Record<string, unknown>, patch as Record<string, unknown>)
        const next = { ...get().settings, ...patch }
        set({ settings: next })
        pushSingleton('settings', next as unknown as Record<string, unknown>)
        if (!changed) return
        get().log({ action: 'réglages', entity: 'reglages', entityId: 'settings', label: ENTITY_LABEL.reglages, details: details ?? `Champs modifiés : ${changed}` })
      },

      setStats(patch) {
        const next = { ...get().stats, ...patch }
        set({ stats: next })
        pushSingleton('stats', next as unknown as Record<string, unknown>)
      },

      setUser: (u) => set({ currentUser: u }),
      setTheme: (t) => {
        set({ theme: t })
        document.documentElement.dataset.theme = t
        try {
          localStorage.setItem('flux-theme', t)
        } catch {
          /* navigation privée */
        }
      },
      setPeriod: (p) => set({ period: p }),
    }),
    {
      name: 'flux-mjagency-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // La période affichée n'est pas gardée : on rouvre toujours sur le mois en cours.
      partialize: (s) => {
        const { period, ...rest } = s
        void period
        return rest
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FluxState>
        return {
          ...current,
          ...p,
          settings: { ...defaultSettings, ...(p.settings ?? {}), entreprise: { ...defaultSettings.entreprise, ...(p.settings?.entreprise ?? {}) } },
          stats: { ...defaultStats, ...(p.stats ?? {}) },
        }
      },
    },
  ),
)

/** Ce dont la synchronisation a besoin pour lire et écrire l'état. */
export const storeTarget = {
  getState: () => useFlux.getState() as unknown as Record<string, unknown>,
  setState: (partial: Record<string, unknown>) => useFlux.setState(partial as Partial<FluxState>),
}

export const useRole = () => USERS[useFlux((s) => s.currentUser)].role
export const useIsAdmin = () => useRole() === 'admin'

/** Les éléments non archivés d'une collection. */
export const alive = <T extends { archived?: unknown }>(list: T[]) => list.filter((x) => !x.archived)
