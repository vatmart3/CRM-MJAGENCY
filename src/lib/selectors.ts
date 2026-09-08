import { AppState, Period } from '../store'
import { Notification, Pillar, PILLARS, PILLAR_TARGETS } from '../store/types'
import { addDays, addMonths, daysSince, mondayOf, monthStart, quarterStart, today } from './dates'

export interface Range { start: string; end: string; prevStart: string; prevEnd: string; label: string; prevLabel: string }

export const periodRange = (period: Period, ref = today()): Range => {
  if (period === 'week') {
    const start = mondayOf(ref)
    return { start, end: addDays(start, 6), prevStart: addDays(start, -7), prevEnd: addDays(start, -1), label: 'cette semaine', prevLabel: 'vs semaine précédente' }
  }
  if (period === 'quarter') {
    const start = quarterStart(ref)
    return { start, end: addDays(addMonths(start, 3), -1), prevStart: addMonths(start, -3), prevEnd: addDays(start, -1), label: 'ce trimestre', prevLabel: 'vs trimestre précédent' }
  }
  const start = monthStart(ref)
  return { start, end: addDays(addMonths(start, 1), -1), prevStart: addMonths(start, -1), prevEnd: addDays(start, -1), label: 'ce mois-ci', prevLabel: 'vs mois précédent' }
}

export const inRange = (iso: string | null | undefined, start: string, end: string) => !!iso && iso >= start && iso <= end

/** Cash received: 40 % deposit at project creation, 60 % balance at paidAt/deliveredAt. Signed quotes without project count deposit. */
export const cashEvents = (s: Pick<AppState, 'projects' | 'offers'>) => {
  const ev: { date: string; amount: number; offerId: string; client: string }[] = []
  for (const p of s.projects) {
    if (p.depositPaid) ev.push({ date: p.createdAt, amount: Math.round(p.amount * 0.4), offerId: p.offerId, client: p.client })
    if (p.balancePaid) ev.push({ date: p.paidAt ?? p.deliveredAt ?? p.createdAt, amount: Math.round(p.amount * 0.6), offerId: p.offerId, client: p.client })
  }
  return ev
}

export const revenueBetween = (s: Pick<AppState, 'projects' | 'offers'>, start: string, end: string) =>
  cashEvents(s).filter((e) => inRange(e.date, start, end)).reduce((a, e) => a + e.amount, 0)

export const revenueByOffer = (s: Pick<AppState, 'projects' | 'offers'>, start: string, end: string) => {
  const map = new Map<string, number>()
  for (const e of cashEvents(s)) if (inRange(e.date, start, end)) map.set(e.offerId, (map.get(e.offerId) ?? 0) + e.amount)
  return s.offers.map((o) => ({ id: o.id, name: o.name, color: o.color, value: map.get(o.id) ?? 0 }))
}

export const quotesSentBetween = (s: Pick<AppState, 'quotes'>, start: string, end: string) =>
  s.quotes.filter((q) => q.status !== 'Brouillon' && inRange(q.sentAt, start, end)).length

export const salesBetween = (s: Pick<AppState, 'quotes' | 'prospects'>, start: string, end: string) => {
  const signed = s.quotes.filter((q) => q.status === 'Signé' && inRange(q.signedAt ?? q.sentAt, start, end)).length
  const won = s.prospects.filter((p) => p.stage === 'Gagné' && inRange(p.wonAt, start, end) && !s.quotes.some((q) => q.prospectId === p.id && q.status === 'Signé')).length
  return signed + won
}

export const contactsBetween = (s: Pick<AppState, 'kpiWeeks' | 'dmLogs'>, start: string, end: string) => {
  const weeks = s.kpiWeeks.filter((k) => inRange(k.weekStart, mondayOf(start), end)).reduce((a, k) => a + k.contacts, 0)
  return weeks
}

export const followupsToday = (s: Pick<AppState, 'followups'>) => s.followups.filter((f) => !f.done && f.dueDate <= today())
export const pendingQuotes = (s: Pick<AppState, 'quotes'>) => s.quotes.filter((q) => q.status === 'Envoyé' || q.status === 'Relancé')
export const commissionsToPay = (s: Pick<AppState, 'partners'>) => s.partners.filter((p) => p.commissionsDue > 0)
export const commissionOverdue = (p: { commissionsDue: number; dueSince: string | null }) => p.commissionsDue > 0 && (daysSince(p.dueSince) ?? 0) > 7
export const partnerNeedsFollowup = (p: { lastFollowup: string | null; status: string }) =>
  p.status !== 'Inactif' && (p.lastFollowup === null || (daysSince(p.lastFollowup) ?? 0) >= 30)
export const prospectStale = (p: { lastContact: string | null; stage: string }) =>
  p.stage !== 'Gagné' && p.stage !== 'Perdu' && (p.lastContact === null || (daysSince(p.lastContact) ?? 0) > 7)
export const projectAlert = (p: { deliveredAt: string | null; reviewAsked: boolean; referralObtained: boolean }) =>
  !!p.deliveredAt && (!p.reviewAsked || !p.referralObtained)
export const projectProgress = (steps: Record<string, boolean>, all: { id: string }[]) => {
  if (!all.length) return 0
  const done = all.filter((st) => steps[st.id]).length
  return Math.round((done / all.length) * 100)
}
export const quoteTotal = (q: { lines: { qty: number; unitPrice: number }[] }) => q.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0)

export const notifications = (s: AppState): Notification[] => {
  const out: Notification[] = []
  const fu = followupsToday(s)
  if (fu.length) out.push({ id: 'n-fu', type: 'followup', text: `${fu.length} relance${fu.length > 1 ? 's' : ''} à faire aujourd’hui`, to: '/relances?filter=today', severity: 'info' })
  const com = commissionsToPay(s)
  for (const p of com) {
    const over = commissionOverdue(p)
    out.push({ id: 'n-com-' + p.id, type: 'commission', text: `Commission de ${p.commissionsDue} € à payer à ${p.name}${over ? ' (plus de 7 jours)' : ''}`, to: '/apporteurs', severity: over ? 'danger' : 'warn' })
  }
  const late = s.tasks.filter((t) => !t.done && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) && t.deadline < today())
  if (late.length) out.push({ id: 'n-task', type: 'task', text: `${late.length} tâche${late.length > 1 ? 's' : ''} en retard`, to: '/planning', severity: 'warn' })
  for (const p of s.projects) if (projectAlert(p)) out.push({ id: 'n-pj-' + p.id, type: 'project', text: `${p.client} livré sans ${!p.reviewAsked ? 'avis Google demandé' : 'recommandation obtenue'}`, to: '/clients', severity: 'danger' })
  for (const p of s.partners) if (partnerNeedsFollowup(p)) out.push({ id: 'n-pa-' + p.id, type: 'partner', text: `${p.name} sans relance depuis 30 jours`, to: '/apporteurs', severity: 'warn' })
  return out
}

export const pillarSplit = (posts: AppState['posts']) => {
  const published = posts.filter((p) => p.status === 'Publié')
  const total = published.length
  return PILLARS.map((pillar) => {
    const count = published.filter((p) => p.pillar === pillar).length
    const real = total ? (count / total) * 100 : 0
    const target = PILLAR_TARGETS[pillar]
    return { pillar, count, real, target, drift: total >= 4 && Math.abs(real - target) > 10 }
  })
}
export const PILLAR_COLORS: Record<Pillar, string> = { Preuve: '#0071E3', Pédagogie: '#30D158', Coulisses: '#BF5AF2', Local: '#FF9F0A', Offre: '#FFD60A' }

export const dmStreak = (logs: AppState['dmLogs'], target: number) => {
  let streak = 0
  let day = today()
  const map = new Map(logs.map((l) => [l.date, l.count]))
  if ((map.get(day) ?? 0) < target) day = addDays(day, -1)
  while ((map.get(day) ?? 0) >= target) { streak++; day = addDays(day, -1) }
  return streak
}

export const diagnose = (k: { contacts: number; conversations: number; meetings: number; quotes: number; sales: number } | null) => {
  if (!k) return { text: 'Saisissez une semaine pour obtenir un diagnostic.', tone: 'muted' as const }
  if (k.quotes >= 2 && k.sales === 0) return { text: 'Le problème est le prix ou la relance.', tone: 'danger' as const }
  if (k.conversations >= 6 && k.meetings / Math.max(1, k.conversations) < 0.2) return { text: 'Le problème est la prise de rendez-vous.', tone: 'warn' as const }
  if (k.contacts >= 20 && k.conversations / Math.max(1, k.contacts) < 0.2) return { text: 'Le problème est le message.', tone: 'warn' as const }
  if (k.contacts === 0) return { text: 'Aucun contact sortant : le levier est le volume.', tone: 'warn' as const }
  return { text: 'Les ratios tiennent. On garde le rythme.', tone: 'ok' as const }
}

export const searchAll = (s: AppState, q: string) => {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const hit = (...vals: (string | null | undefined)[]) => vals.some((v) => v && v.toLowerCase().includes(needle))
  const out: { type: string; label: string; sub: string; to: string }[] = []
  for (const p of s.prospects) if (hit(p.business, p.contactFirst, p.contactLast, p.city, p.sector, p.notes)) out.push({ type: 'Prospect', label: p.business, sub: `${p.city} · ${p.stage}`, to: `/pipeline?open=${p.id}` })
  for (const p of s.projects) if (hit(p.client, p.contact, p.city, p.domain)) out.push({ type: 'Client', label: p.client, sub: p.city, to: `/clients?open=${p.id}` })
  for (const p of s.partners) if (hit(p.name, p.profile, p.notes)) out.push({ type: 'Apporteur', label: p.name, sub: p.profile, to: `/apporteurs?open=${p.id}` })
  for (const t of s.tasks) if (hit(t.title)) out.push({ type: 'Tâche', label: t.title, sub: `Semaine ${t.week}`, to: `/planning` })
  for (const q2 of s.quotes) if (hit(q2.number, q2.client)) out.push({ type: 'Devis', label: `${q2.number} · ${q2.client}`, sub: q2.status, to: `/devis?open=${q2.id}` })
  return out.slice(0, 12)
}
