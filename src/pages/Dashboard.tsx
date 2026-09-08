import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { Bars, Donut } from '../components/charts'
import { PeriodSelector } from '../components/Layout'
import { Card, Editable, KpiCard, Page, SectionTitle, Segmented, cx } from '../components/ui'
import { cashEvents, commissionOverdue, commissionsToPay, contactsBetween, followupsToday, pendingQuotes, periodRange, quotesSentBetween, revenueBetween, revenueByOffer, salesBetween } from '../lib/selectors'
import { fmtEur, variation } from '../lib/format'
import { addDays, addMonths, fmtDate, mondayOf, monthStart, today } from '../lib/dates'

export default function Dashboard() {
  const state = useStore()
  const nav = useNavigate()
  const { settings, users, setSettings } = state
  const me = users.find((u) => u.id === settings.currentUser) ?? users[0]
  const r = useMemo(() => periodRange(state.ui.period), [state.ui.period])
  const [chartMode, setChartMode] = useState<'week' | 'month'>('month')

  const revenue = revenueBetween(state, r.start, r.end)
  const revenuePrev = revenueBetween(state, r.prevStart, r.prevEnd)
  const quotes = quotesSentBetween(state, r.start, r.end)
  const quotesPrev = quotesSentBetween(state, r.prevStart, r.prevEnd)
  const sales = salesBetween(state, r.start, r.end)
  const salesPrev = salesBetween(state, r.prevStart, r.prevEnd)
  const contacts = contactsBetween(state, r.start, r.end)
  const contactsPrev = contactsBetween(state, r.prevStart, r.prevEnd)

  const chart = useMemo(() => {
    const ev = cashEvents(state)
    if (chartMode === 'week') {
      const start = mondayOf(today())
      return Array.from({ length: 8 }, (_, i) => {
        const s = addDays(start, -7 * (7 - i))
        const e = addDays(s, 6)
        return { name: fmtDate(s), value: ev.filter((x) => x.date >= s && x.date <= e).reduce((a, x) => a + x.amount, 0) }
      })
    }
    const start = monthStart(today())
    return Array.from({ length: 6 }, (_, i) => {
      const s = addMonths(start, -(5 - i))
      const e = addDays(addMonths(s, 1), -1)
      const name = new Date(s + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short' })
      return { name, value: ev.filter((x) => x.date >= s && x.date <= e).reduce((a, x) => a + x.amount, 0) }
    })
  }, [state, chartMode])

  const byOffer = revenueByOffer(state, r.start, r.end)
  const fu = followupsToday(state)
  const pq = pendingQuotes(state)
  const com = commissionsToPay(state)
  const comOverdue = com.some(commissionOverdue)
  const periodWord = r.label

  return (
    <Page title={<>Bonjour, {me.name} 👋</>} subtitle={`Voici où en est l’agence ${periodWord}.`} actions={<PeriodSelector />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard primary label={`CA encaissé ${periodWord}`} value={revenue} format={fmtEur} variation={variation(revenue, revenuePrev)} sub={r.prevLabel} onClick={() => nav('/clients')} />
        <KpiCard label="Devis envoyés" value={quotes} variation={variation(quotes, quotesPrev)} sub={r.prevLabel} onClick={() => nav('/devis')} />
        <KpiCard label="Ventes signées" value={sales} variation={variation(sales, salesPrev)} sub={r.prevLabel} onClick={() => nav('/pipeline')} />
        <KpiCard label="Contacts sortants" value={contacts} variation={variation(contacts, contactsPrev)} sub={r.prevLabel} onClick={() => nav('/kpi')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-4">
        <Card className="xl:col-span-3">
          <SectionTitle right={<Segmented value={chartMode} onChange={setChartMode} options={[{ value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }]} />}>Chiffre d’affaires encaissé</SectionTitle>
          <Bars data={chart} />
        </Card>
        <Card className="xl:col-span-2">
          <SectionTitle>Répartition du CA par offre</SectionTitle>
          <Donut data={byOffer.map((o) => ({ name: o.name, value: o.value, color: o.color }))} center={fmtEur(revenue)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <ActionCard n={fu.length} label={`relance${fu.length > 1 ? 's' : ''} à faire aujourd’hui`} onClick={() => nav('/relances?filter=today')} />
        <ActionCard n={pq.length} label={`devis en attente de réponse`} onClick={() => nav('/devis?status=pending')} />
        <ActionCard n={com.length} label={`commission${com.length > 1 ? 's' : ''} apporteur${com.length > 1 ? 's' : ''} à payer`} danger={comOverdue} hint={comOverdue ? 'Une commission dépasse 7 jours après encaissement' : undefined} onClick={() => nav('/apporteurs?filter=due')} />
      </div>

      <div className="card fade-up mt-4 p-6 flex flex-col md:flex-row md:items-center gap-4 border-brand/40 bg-gradient-to-r from-brand/10 to-transparent">
        <div className="shrink-0">
          <div className="label mb-1">Cap du mois</div>
          <div className="text-xs text-muted flex items-center gap-1"><Pencil size={11} /> Texte éditable</div>
        </div>
        <div className="text-lg md:text-xl font-semibold text-white leading-snug flex-1">
          <Editable value={settings.capMessage} onChange={(capMessage) => setSettings({ capMessage })} multiline />
        </div>
      </div>
    </Page>
  )
}

function ActionCard({ n, label, onClick, danger, hint }: { n: number; label: string; onClick: () => void; danger?: boolean; hint?: string }) {
  return (
    <button onClick={onClick} className={cx('card fade-up p-6 text-left flex items-center justify-between gap-4 hover:border-muted/50', danger && 'border-danger/60 bg-danger/10')}>
      <div>
        <div className="flex items-baseline gap-2">
          <span className={cx('text-4xl font-extrabold tracking-tight', danger ? 'text-danger' : 'text-white')}>{n}</span>
          <span className="text-sm text-txt/90">{label}</span>
        </div>
        {hint && <div className="text-xs text-danger mt-1.5">{hint}</div>}
      </div>
      <span className={cx('w-9 h-9 rounded-pill grid place-content-center shrink-0', danger ? 'bg-danger/20 text-danger' : 'bg-card2 text-muted')}><ArrowRight size={16} /></span>
    </button>
  )
}
