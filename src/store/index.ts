import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { seed } from '../data/seed'
import {
  Addon, CommissionRule, Decision, DmLog, Followup, FollowupStep, KpiWeek, Meeting, Objection, Offer, Partner, PartnerProfile, Post, Project,
  Prospect, Question, Quote, Rule, Settings, Task, User, UserId, WeekMeta, WeekSlot,
} from './types'
import { addDays, today } from '../lib/dates'
import { uid } from '../lib/format'

export type Period = 'month' | 'week' | 'quarter'
export type UserFilter = 'all' | UserId

export interface Collections {
  users: User
  offers: Offer
  addons: Addon
  priceRules: Rule
  objections: Objection
  followupSequence: FollowupStep
  rules: Rule
  partnerProfiles: PartnerProfile
  commissionRules: CommissionRule
  partnerRules: Rule
  weekMeta: WeekMeta
  tasks: Task
  weekSlots: WeekSlot
  posts: Post
  decisions: Decision
  questions: Question
  prospects: Prospect
  projects: Project
  quotes: Quote
  partners: Partner
  kpiWeeks: KpiWeek
  followups: Followup
  meetings: Meeting
}
export type CollectionKey = keyof Collections
type IdOf<K extends CollectionKey> = K extends 'weekMeta' ? number : string

export interface AppState {
  version: number
  users: User[]
  offers: Offer[]
  addons: Addon[]
  priceRules: Rule[]
  script: { title: string; text: string; note: string }
  objections: Objection[]
  followupSequence: FollowupStep[]
  rules: Rule[]
  partnerProfiles: PartnerProfile[]
  commissionRules: CommissionRule[]
  partnerRules: Rule[]
  partnerWarning: string
  weekMeta: WeekMeta[]
  tasks: Task[]
  weekSlots: WeekSlot[]
  posts: Post[]
  decisions: Decision[]
  questions: Question[]
  settings: Settings
  prospects: Prospect[]
  projects: Project[]
  quotes: Quote[]
  partners: Partner[]
  kpiWeeks: KpiWeek[]
  followups: Followup[]
  dmLogs: DmLog[]
  meetings: Meeting[]
  ui: { period: Period; userFilter: UserFilter }

  add<K extends CollectionKey>(coll: K, item: Collections[K]): void
  patch<K extends CollectionKey>(coll: K, id: IdOf<K>, partch: Partial<Collections[K]>): void
  remove<K extends CollectionKey>(coll: K, id: IdOf<K>): void
  setAll<K extends CollectionKey>(coll: K, items: Collections[K][]): void
  setScript(s: Partial<AppState['script']>): void
  setPartnerWarning(s: string): void
  setSettings(patch: Partial<Settings>): void
  setUi(patch: Partial<AppState['ui']>): void
  moveProspect(id: string, stage: string): void
  addDm(n?: number): void
  resetAll(): void
}

const idKey = (coll: CollectionKey) => (coll === 'weekMeta' ? 'week' : 'id')

const initial = () => ({
  version: 1,
  users: seed.users,
  offers: seed.offers,
  addons: seed.addons,
  priceRules: seed.priceRules,
  script: seed.script,
  objections: seed.objections,
  followupSequence: seed.followupSequence,
  rules: seed.rules,
  partnerProfiles: seed.partnerProfiles,
  commissionRules: seed.commissionRules,
  partnerRules: seed.partnerRules,
  partnerWarning: seed.partnerWarning,
  weekMeta: seed.weekMeta,
  tasks: seed.tasks,
  weekSlots: seed.weekSlots,
  posts: seed.posts,
  decisions: seed.decisions,
  questions: seed.questions,
  settings: seed.settings,
  prospects: seed.prospects,
  projects: seed.projects,
  quotes: seed.quotes,
  partners: seed.partners,
  kpiWeeks: seed.kpiWeeks,
  followups: seed.followups,
  dmLogs: seed.dmLogs,
  meetings: seed.meetings,
  ui: { period: 'month' as Period, userFilter: 'all' as UserFilter },
})

/** Creates the J+1 / J+3 / J+7 / J+14 / J+30 sequence for a prospect (and optional quote). */
export const buildFollowupSequence = (
  seq: FollowupStep[], prospect: Prospect, quoteId: string | null, from = today(),
): Followup[] =>
  seq.map((s) => ({
    id: uid(), prospectId: prospect.id, quoteId, title: `${prospect.business} — ${s.moment}`, channel: s.channel, message: s.message,
    dueDate: addDays(from, s.day), done: false, assignee: prospect.assignee, createdAt: from,
  }))

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initial(),
      add: (coll, item) => set((s) => ({ [coll]: [...(s[coll] as unknown[]), item] }) as Partial<AppState>),
      patch: (coll, id, patch) =>
        set((s) => {
          const key = idKey(coll)
          const list = (s[coll] as unknown as Record<string, unknown>[]).map((it) => (it[key] === id ? { ...it, ...patch } : it))
          return { [coll]: list } as Partial<AppState>
        }),
      remove: (coll, id) =>
        set((s) => {
          const key = idKey(coll)
          return { [coll]: (s[coll] as unknown as Record<string, unknown>[]).filter((it) => it[key] !== id) } as Partial<AppState>
        }),
      setAll: (coll, items) => set(() => ({ [coll]: items }) as Partial<AppState>),
      setScript: (p) => set((s) => ({ script: { ...s.script, ...p } })),
      setPartnerWarning: (partnerWarning) => set({ partnerWarning }),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
      moveProspect: (id, stage) => {
        const s = get()
        const p = s.prospects.find((x) => x.id === id)
        if (!p || p.stage === stage) return
        const patch: Partial<Prospect> = { stage, lastContact: today() }
        if (stage === 'Gagné') patch.wonAt = today()
        let followups = s.followups
        if (stage === 'Devis envoyé') {
          const already = s.followups.some((f) => f.prospectId === id && !f.done && f.title.includes('J+'))
          const quote = s.quotes.find((q) => q.prospectId === id && (q.status === 'Envoyé' || q.status === 'Relancé'))
          if (!already) {
            followups = [...followups, ...buildFollowupSequence(s.followupSequence, p, quote?.id ?? null)]
          }
          patch.nextFollowup = addDays(today(), s.followupSequence[0]?.day ?? 1)
        }
        set({ prospects: s.prospects.map((x) => (x.id === id ? { ...x, ...patch } : x)), followups })
      },
      addDm: (n = 1) =>
        set((s) => {
          const t = today()
          const found = s.dmLogs.find((l) => l.date === t)
          const dmLogs = found
            ? s.dmLogs.map((l) => (l.date === t ? { ...l, count: Math.max(0, l.count + n) } : l))
            : [...s.dmLogs, { date: t, count: Math.max(0, n) }]
          return { dmLogs }
        }),
      resetAll: () => set(initial()),
    }),
    {
      name: 'mjagency-cockpit-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        // Persist data only, not action functions.
        const { add, patch, remove, setAll, setScript, setPartnerWarning, setSettings, setUi, moveProspect, addDm, resetAll, ...data } = s
        void add; void patch; void remove; void setAll; void setScript; void setPartnerWarning; void setSettings; void setUi; void moveProspect; void addDm; void resetAll
        return data
      },
    },
  ),
)

export const useUsers = () => useStore((s) => s.users)
export const userById = (users: User[], id: string | null | undefined) => users.find((u) => u.id === id)
