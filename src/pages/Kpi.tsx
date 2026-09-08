import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Settings2 } from 'lucide-react'
import { useStore } from '../store'
import { KpiTargets, KpiWeek } from '../store/types'
import { Bars, Lines } from '../components/charts'
import { Card, Checkbox, ConfirmDelete, Empty, Field, KpiCard, Modal, Page, Pagination, RowMenu, SectionTitle, Segmented, Table, Td, Th, cx, usePagination } from '../components/ui'
import { diagnose } from '../lib/selectors'
import { fmtDate, mondayOf, today, weekLabel } from '../lib/dates'
import { fmtEur, fmtNum, fmtPct, variation } from '../lib/format'

type NumKey = Exclude<keyof KpiWeek, 'id' | 'weekStart' | 'note'>
type Group = 'acq' | 'conv' | 'rev' | 'content'
const IND: { key: NumKey; label: string; short: string }[] = [
  { key: 'contacts', label: 'Contacts sortants', short: 'Contacts' },
  { key: 'conversations', label: 'Conversations', short: 'Conv.' },
  { key: 'meetings', label: 'RDV réalisés', short: 'RDV' },
  { key: 'quotes', label: 'Devis envoyés', short: 'Devis' },
  { key: 'sales', label: 'Ventes signées', short: 'Ventes' },
  { key: 'revenue', label: 'CA encaissé (€)', short: 'CA' },
  { key: 'delivered', label: 'Sites livrés', short: 'Livrés' },
  { key: 'posts', label: 'Publications', short: 'Posts' },
  { key: 'partners', label: 'Apporteurs signés', short: 'Apporteurs' },
]
const hasTarget = (k: NumKey): k is keyof KpiTargets => k !== 'revenue' && k !== 'delivered'
const targetOf = (t: KpiTargets, k: NumKey) => (hasTarget(k) ? t[k] : null)
const SENTENCE = 'Les ventes sont un résultat, pas un levier — on n’agit jamais dessus directement.'
const TONE: Record<ReturnType<typeof diagnose>['tone'], string> = { danger: '#FF453A', warn: '#FF9F0A', ok: '#30D158', muted: '#8A8A93' }
const GROUPS: { value: Group; label: string; keys: { key: NumKey; label: string; color: string }[] }[] = [
  { value: 'acq', label: 'Acquisition', keys: [{ key: 'contacts', label: 'Contacts', color: '#0071E3' }, { key: 'conversations', label: 'Conversations', color: '#4DA3FF' }, { key: 'meetings', label: 'RDV', color: '#BF5AF2' }] },
  { value: 'conv', label: 'Conversion', keys: [{ key: 'quotes', label: 'Devis', color: '#0071E3' }, { key: 'sales', label: 'Ventes', color: '#4DA3FF' }] },
  { value: 'rev', label: 'CA encaissé', keys: [{ key: 'revenue', label: 'CA', color: '#0071E3' }] },
  { value: 'content', label: 'Contenu & apporteurs', keys: [{ key: 'posts', label: 'Publications', color: '#0071E3' }, { key: 'partners', label: 'Apporteurs', color: '#BF5AF2' }] },
]
const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)

export default function Kpi() {
  const { kpiWeeks, settings, remove } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState<{ open: boolean; week: KpiWeek | null }>({ open: false, week: null })
  const [group, setGroup] = useState<Group>('acq')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const targets = settings.kpiTargets

  useEffect(() => {
    const id = params.get('open')
    if (!id) return
    const w = kpiWeeks.find((x) => x.id === id)
    if (w) setForm({ open: true, week: w })
    params.delete('open')
    setParams(params, { replace: true })
  }, [params, kpiWeeks, setParams])

  const sorted = useMemo(() => [...kpiWeeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart)), [kpiWeeks])
  const latest: KpiWeek | null = sorted[0] ?? null
  const prev: KpiWeek | null = sorted[1] ?? null
  const diag = diagnose(latest)
  const chart = useMemo(() => sorted.slice(0, 12).reverse().map((w) => {
    const row: Record<string, number | string> = { name: fmtDate(w.weekStart) }
    for (const i of IND) row[i.key] = w[i.key]
    return row
  }), [sorted])
  const g = GROUPS.find((x) => x.value === group) ?? GROUPS[0]
  const pag = usePagination(sorted, 12)
  const openNew = () => setForm({ open: true, week: null })
  const openEdit = (week: KpiWeek) => setForm({ open: true, week })
  const tone = (k: NumKey, v: number) => {
    const t = targetOf(targets, k)
    if (t === null || t <= 0) return ''
    if (v >= t) return 'text-ok'
    if (v < t * 0.5) return 'text-danger'
    return ''
  }
  const kpi = (k: NumKey) => ({ value: latest?.[k] ?? 0, variation: latest ? variation(latest[k], prev?.[k] ?? 0) : null })

  return (
    <Page title="KPI hebdomadaires" subtitle={SENTENCE}
      actions={<button className="btn-primary" onClick={openNew}><Plus size={15} /> Saisir la semaine</button>}>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard primary label="Contacts sortants" {...kpi('contacts')} sub="vs semaine précédente" />
        <KpiCard label="Conversations" {...kpi('conversations')} sub="vs semaine précédente" />
        <KpiCard label="RDV réalisés" {...kpi('meetings')} sub="vs semaine précédente" />
        <KpiCard label="Devis envoyés" {...kpi('quotes')} sub="vs semaine précédente" />
      </div>

      <Card accent={TONE[diag.tone]} className="mt-4">
        <SectionTitle right={latest && <span className="label">{weekLabel(latest.weekStart)}</span>}>Diagnostic automatique</SectionTitle>
        <p className="text-xl font-semibold text-white leading-snug">{diag.text}</p>
        {latest && (
          <div className="flex flex-wrap gap-2 mt-4">
            <RatioPill label="Conversations / contacts" value={ratio(latest.conversations, latest.contacts)} />
            <RatioPill label="RDV / conversations" value={ratio(latest.meetings, latest.conversations)} />
            <RatioPill label="Signatures / devis" value={ratio(latest.sales, latest.quotes)} />
          </div>
        )}
        <p className="text-xs text-muted mt-4">{SENTENCE}</p>
        <p className="text-xs text-muted mt-3 pt-3 border-t border-line leading-relaxed">
          Beaucoup de contacts, peu de conversations → le message · Beaucoup de conversations, peu de RDV → la prise de rendez-vous · Devis envoyés, aucune signature → le prix ou la relance
        </p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card className="xl:col-span-2">
          <SectionTitle right={<Segmented value={group} onChange={setGroup} options={GROUPS.map((x) => ({ value: x.value, label: x.label }))} />}>Graphiques d’évolution</SectionTitle>
          {chart.length === 0 ? (
            <Empty text="Les courbes apparaîtront dès la première semaine saisie." />
          ) : group === 'rev' ? (
            <Bars data={chart.map((c) => ({ name: String(c.name), value: Number(c.revenue) }))} money height={260} />
          ) : (
            <>
              <Lines data={chart} keys={g.keys} height={260} />
              <div className="flex flex-wrap gap-4 mt-3">
                {g.keys.map((k) => <span key={k.key} className="flex items-center gap-1.5 text-xs text-muted"><span className="w-2 h-2 rounded-pill" style={{ background: k.color }} />{k.label}</span>)}
              </div>
            </>
          )}
        </Card>

        <Card>
          <SectionTitle right={<button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => nav('/reglages')}><Settings2 size={13} /> Modifier les cibles</button>}>Cibles hebdo</SectionTitle>
          <ul className="divide-y divide-line">
            {IND.map((i) => {
              const t = targetOf(targets, i.key)
              return (
                <li key={i.key} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-txt/90">{i.label}</span>
                  <span className={cx('tabular-nums font-semibold', t === null ? 'text-muted' : 'text-white')}>{t === null ? '—' : fmtNum(t)}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-10 mb-5">
        <h2 className="text-xl font-bold text-white tracking-tight">Historique</h2>
        <p className="text-xs text-muted mt-1">Vert : cible atteinte · Rouge : moins de la moitié de la cible.</p>
      </div>
      {sorted.length === 0 ? (
        <Card><Empty text="Aucune semaine saisie. La première saisie prend deux minutes." action="Saisir la semaine" onAction={openNew} /></Card>
      ) : (
        <>
          <Table head={<>
            <Th className="w-10" /><Th>Semaine</Th>
            {IND.map((i) => <Th key={i.key} className="text-right">{i.short}</Th>)}
            <Th>Note</Th><Th className="w-12" />
          </>}>
            {pag.slice.map((w) => (
              <tr key={w.id} className="tr cursor-pointer" onClick={() => openEdit(w)}>
                <Td><Checkbox checked={selected.has(w.id)} onChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(w.id) : n.delete(w.id); return n })} /></Td>
                <Td className="text-white whitespace-nowrap font-medium">{weekLabel(w.weekStart)}</Td>
                {IND.map((i) => (
                  <Td key={i.key} className={cx('text-right tabular-nums', tone(i.key, w[i.key]))}>{i.key === 'revenue' ? fmtEur(w.revenue) : fmtNum(w[i.key])}</Td>
                ))}
                <Td className="text-muted max-w-[220px] truncate" >{w.note || '—'}</Td>
                <Td className="text-right"><RowMenu items={[{ label: 'Modifier', onClick: () => openEdit(w) }, { label: 'Supprimer', danger: true, onClick: () => remove('kpiWeeks', w.id) }]} /></Td>
              </tr>
            ))}
          </Table>
          <div className="mt-3"><Pagination page={pag.page} pages={pag.pages} onChange={pag.setPage} total={pag.total} /></div>
        </>
      )}

      <KpiForm open={form.open} onClose={() => setForm({ open: false, week: null })} initial={form.week} />
    </Page>
  )
}

function RatioPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="chip !py-2">
      <span className="text-muted">{label}</span>
      <span className="text-white font-semibold tabular-nums">{fmtPct(value, 0)}</span>
    </span>
  )
}

function KpiForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: KpiWeek | null }) {
  const { kpiWeeks, settings, add, patch, remove } = useStore()
  const empty = (): KpiWeek => ({ id: '', weekStart: mondayOf(today()), contacts: 0, conversations: 0, meetings: 0, quotes: 0, sales: 0, revenue: 0, delivered: 0, posts: 0, partners: 0, note: '' })
  const [k, setK] = useState<KpiWeek>(initial ?? empty())
  useEffect(() => { if (open) setK(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key: keyof KpiWeek, v: string | number) => setK((x) => ({ ...x, [key]: v }))
  const save = () => {
    const existing = kpiWeeks.find((w) => w.weekStart === k.weekStart)
    if (existing) {
      patch('kpiWeeks', existing.id, { ...k, id: existing.id })
      if (initial && initial.id !== existing.id) remove('kpiWeeks', initial.id)
    } else {
      if (initial) remove('kpiWeeks', initial.id)
      add('kpiWeeks', { ...k, id: 'kw-' + k.weekStart })
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? `Modifier — ${weekLabel(initial.weekStart)}` : 'Saisir la semaine'}
      footer={<>
        {initial && <ConfirmDelete onConfirm={() => { remove('kpiWeeks', initial.id); onClose() }} />}
        <span className="flex-1" />
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={save}>Enregistrer</button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Semaine du (lundi)" className="col-span-2 md:col-span-3" hint="La date est ramenée automatiquement au lundi.">
          <input className="input md:max-w-xs" type="date" value={k.weekStart} onChange={(e) => e.target.value && set('weekStart', mondayOf(e.target.value))} />
        </Field>
        {IND.map((i) => {
          const t = targetOf(settings.kpiTargets, i.key)
          return (
            <Field key={i.key} label={i.label} hint={t !== null ? `cible ${fmtNum(t)}` : undefined}>
              <input className="input tabular-nums" type="number" min={0} value={k[i.key]} onChange={(e) => set(i.key, Math.max(0, Number(e.target.value)))} />
            </Field>
          )
        })}
        <Field label="Note" className="col-span-2 md:col-span-3">
          <textarea className="input" rows={3} value={k.note} onChange={(e) => set('note', e.target.value)} placeholder="Ce qui a marché, ce qui a coincé…" />
        </Field>
      </div>
    </Modal>
  )
}
