import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, Plus, Search } from 'lucide-react'
import { useStore } from '../store'
import { CITIES, Prospect, SOURCES, User } from '../store/types'
import { UserFilter } from '../components/Layout'
import { ProspectForm } from '../components/forms'
import { Avatar, Card, Checkbox, ConfirmDelete, Dot, Empty, FilterChips, Page, Pagination, RowMenu, Segmented, StatusPill, Table, Td, Th, cx, statusColor, usePagination } from '../components/ui'
import { prospectStale } from '../lib/selectors'
import { fmtEur, fmtPct, variation } from '../lib/format'
import { addMonths, fmtDate, monthStart, today } from '../lib/dates'

type View = 'kanban' | 'table'
const STALE_TIP = 'Aucun contact depuis plus de 7 jours'

export default function Pipeline() {
  const { prospects, offers, users, settings, moveProspect, remove } = useStore()
  const uf = useStore((s) => s.ui.userFilter)
  const stages = settings.pipelineStages
  const [sp, setSp] = useSearchParams()
  const stageParam = sp.get('stage') ?? ''
  const openId = sp.get('open')
  const [view, setView] = useState<View>(stageParam ? 'table' : 'kanban')
  const [form, setForm] = useState<{ open: boolean; initial: Prospect | null }>({ open: false, initial: null })
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [city, setCity] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    setSp(n, { replace: true })
  }
  useEffect(() => {
    if (!openId) return
    const p = useStore.getState().prospects.find((x) => x.id === openId)
    if (p) setForm({ open: true, initial: p })
  }, [openId])
  const openForm = (initial: Prospect | null = null) => setForm({ open: true, initial })
  const closeForm = () => { setForm((f) => ({ ...f, open: false })); if (openId) setParam('open', '') }
  const selectStage = (stage: string) => { setParam('stage', stageParam === stage ? '' : stage); setView('table') }

  const visible = useMemo(() => prospects.filter((p) => uf === 'all' || p.assignee === uf), [prospects, uf])
  const offerName = (id: string | null) => offers.find((o) => o.id === id)?.name ?? '—'
  const userOf = (id: string) => users.find((u) => u.id === id)
  const nextStage = (stage: string) => {
    const n = stages[stages.indexOf(stage) + 1]
    return n && n !== 'Perdu' ? n : null
  }

  const stats = useMemo(() => {
    const m0 = monthStart(today())
    const m1 = addMonths(m0, -1)
    return stages.map((stage) => {
      const list = visible.filter((p) => p.stage === stage)
      const cur = list.filter((p) => p.createdAt >= m0).length
      const prev = list.filter((p) => p.createdAt >= m1 && p.createdAt < m0).length
      return { stage, count: list.length, amount: list.reduce((a, p) => a + p.amount, 0), variation: variation(cur, prev) }
    })
  }, [stages, visible])

  const cities = useMemo(() => Array.from(new Set([...CITIES, ...prospects.map((p) => p.city)])).sort((a, b) => a.localeCompare(b)), [prospects])
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return visible.filter((p) =>
      (!stageParam || p.stage === stageParam) && (!source || p.source === source) && (!city || p.city === city) &&
      (!n || [p.business, p.contactFirst, p.contactLast, p.city, p.sector, p.phone, p.email].some((v) => v.toLowerCase().includes(n))))
  }, [visible, stageParam, source, city, q])
  const pg = usePagination(filtered, 12)
  const chips = [
    stageParam && { key: 'stage', label: `Statut : ${stageParam}` },
    source && { key: 'source', label: `Source : ${source}` },
    city && { key: 'city', label: `Ville : ${city}` },
    q.trim() && { key: 'q', label: `« ${q.trim()} »` },
  ].filter((c): c is { key: string; label: string } => !!c)
  const removeChip = (k: string) => { if (k === 'stage') setParam('stage', ''); if (k === 'source') setSource(''); if (k === 'city') setCity(''); if (k === 'q') setQ('') }
  const clearChips = () => { setParam('stage', ''); setSource(''); setCity(''); setQ('') }

  const pageIds = pg.slice.map((p) => p.id)
  const allChecked = pageIds.length > 0 && pageIds.every((id) => sel.includes(id))
  const toggleAll = (v: boolean) => setSel(v ? Array.from(new Set([...sel, ...pageIds])) : sel.filter((id) => !pageIds.includes(id)))
  const toggleOne = (id: string, v: boolean) => setSel(v ? [...sel, id] : sel.filter((x) => x !== id))
  const bulkMove = (stage: string) => { sel.forEach((id) => moveProspect(id, stage)); setSel([]) }
  const bulkDelete = () => { sel.forEach((id) => remove('prospects', id)); setSel([]) }

  const onDrop = (stage: string) => { if (dragId) moveProspect(dragId, stage); setDragId(null); setOver(null) }
  const menu = (p: Prospect) => {
    const next = nextStage(p.stage)
    return [
      { label: 'Modifier', onClick: () => openForm(p) },
      ...(next ? [{ label: 'Passer à l’étape suivante', onClick: () => moveProspect(p.id, next) }] : []),
      ...(p.stage !== 'Gagné' ? [{ label: 'Marquer gagné', onClick: () => moveProspect(p.id, 'Gagné') }] : []),
      ...(p.stage !== 'Perdu' ? [{ label: 'Marquer perdu', onClick: () => moveProspect(p.id, 'Perdu') }] : []),
      { label: 'Supprimer', onClick: () => remove('prospects', p.id), danger: true },
    ]
  }

  return (
    <Page
      title="Pipeline"
      subtitle="Chaque prospect, de la première prise de contact à la signature."
      actions={<>
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'kanban', label: 'Kanban' }, { value: 'table', label: 'Tableau' }]} />
        <UserFilter />
        <button className="btn-primary" onClick={() => openForm()}><Plus size={15} /> Prospect</button>
      </>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {stats.map((s) => (
          <Card key={s.stage} accent={statusColor(s.stage)} onClick={() => selectStage(s.stage)} className={cx('!p-4', stageParam === s.stage && view === 'table' && 'ring-1 ring-brand/60')}>
            <div className="label truncate" title={s.stage}>{s.stage}</div>
            <div className="flex items-end justify-between gap-2 mt-3">
              <span className="text-3xl font-extrabold text-white leading-none tracking-tight">{s.count}</span>
              <VarPill v={s.variation} />
            </div>
            <div className="text-xs text-muted mt-2">{fmtEur(s.amount)}</div>
          </Card>
        ))}
      </div>

      {view === 'kanban' && (
        visible.length === 0 ? (
          <div className="card fade-up mt-6"><Empty text="Aucun prospect dans le pipeline. Le terrain commence ici." action="Prospect" onAction={() => openForm()} /></div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 mt-6 items-start">
            {stages.map((stage) => {
              const list = visible.filter((p) => p.stage === stage)
              const total = list.reduce((a, p) => a + p.amount, 0)
              return (
                <div
                  key={stage}
                  onDragOver={(e) => { e.preventDefault(); if (over !== stage) setOver(stage) }}
                  onDragLeave={() => setOver((o) => (o === stage ? null : o))}
                  onDrop={(e) => { e.preventDefault(); onDrop(stage) }}
                  className={cx('w-[280px] shrink-0 rounded-card border p-3 flex flex-col gap-2.5 min-h-[280px] bg-card/60 fade-up', over === stage ? 'border-brand/60 bg-brand/5' : 'border-line')}
                >
                  <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                    <Dot color={statusColor(stage)} />
                    <span className="text-sm font-semibold text-white truncate">{stage}</span>
                    <span className="pill bg-card2 text-muted border border-line">{list.length}</span>
                    <span className="ml-auto text-xs text-muted whitespace-nowrap">{fmtEur(total)}</span>
                  </div>
                  {list.map((p) => (
                    <KanbanCard
                      key={p.id} p={p} offer={offerName(p.offerId)} user={userOf(p.assignee)} stages={stages} dragging={dragId === p.id}
                      onOpen={() => openForm(p)} onMove={(s) => moveProspect(p.id, s)}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id) }}
                      onDragEnd={() => { setDragId(null); setOver(null) }}
                    />
                  ))}
                  {list.length === 0 && <div className="text-xs text-muted text-center py-10">Aucun prospect</div>}
                </div>
              )
            })}
          </div>
        )
      )}

      {view === 'table' && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-card2 border border-line rounded-pill px-4 h-10 w-full sm:w-72">
              <Search size={15} className="text-muted shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un commerce, un contact…" className="bg-transparent outline-none text-sm w-full placeholder:text-muted/70" />
            </div>
            <select className="input !w-auto !rounded-pill !py-2" value={stageParam} onChange={(e) => setParam('stage', e.target.value)}>
              <option value="">Tous les statuts</option>
              {stages.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="input !w-auto !rounded-pill !py-2" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Toutes les sources</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="input !w-auto !rounded-pill !py-2" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Toutes les villes</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <FilterChips chips={chips} onRemove={removeChip} onClear={clearChips} />

          {sel.length > 0 && (
            <div className="card-2 px-4 py-2.5 flex flex-wrap items-center gap-3 fade-up">
              <span className="text-sm font-medium text-white">{sel.length} sélectionné{sel.length > 1 ? 's' : ''}</span>
              <span className="text-muted">·</span>
              <select className="input !w-auto !rounded-pill !py-1.5" value="" onChange={(e) => e.target.value && bulkMove(e.target.value)}>
                <option value="">Changer de statut…</option>
                {stages.map((s) => <option key={s}>{s}</option>)}
              </select>
              <ConfirmDelete onConfirm={bulkDelete} />
              <button className="btn-ghost !py-1.5 ml-auto" onClick={() => setSel([])}>Annuler</button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="card fade-up">
              <Empty text={chips.length ? 'Aucun prospect ne correspond à ces filtres.' : 'Aucun prospect dans le pipeline. Le terrain commence ici.'} action={chips.length ? undefined : 'Prospect'} onAction={() => openForm()} />
            </div>
          ) : (
            <Table head={<>
              <Th className="w-10"><Checkbox checked={allChecked} onChange={toggleAll} /></Th>
              <Th>Commerce</Th><Th>Contact</Th><Th>Source</Th><Th>Offre pressentie</Th><Th>Montant</Th><Th>Assigné</Th><Th>Dernier contact</Th><Th>Prochaine relance</Th><Th>Statut</Th><Th />
            </>}>
              {pg.slice.map((p) => {
                const name = `${p.contactFirst} ${p.contactLast}`.trim()
                return (
                  <tr key={p.id} className="tr cursor-pointer" onClick={() => openForm(p)}>
                    <Td><Checkbox checked={sel.includes(p.id)} onChange={(v) => toggleOne(p.id, v)} /></Td>
                    <Td><div className="text-white font-medium">{p.business}</div><div className="text-xs text-muted">{p.city}</div></Td>
                    <Td>{name ? <div>{name}</div> : <span className="text-muted">—</span>}{p.phone && <div className="text-xs text-muted">{p.phone}</div>}</Td>
                    <Td className="text-muted">{p.source}</Td>
                    <Td>{offerName(p.offerId)}</Td>
                    <Td className="text-white font-medium whitespace-nowrap">{fmtEur(p.amount)}</Td>
                    <Td><Avatar user={userOf(p.assignee)} size={26} /></Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">{fmtDate(p.lastContact)}{prospectStale(p) && <StaleDot />}</span>
                    </Td>
                    <Td className="text-muted whitespace-nowrap">{fmtDate(p.nextFollowup)}</Td>
                    <Td><StatusPill status={p.stage} /></Td>
                    <Td className="text-right"><RowMenu items={menu(p)} /></Td>
                  </tr>
                )
              })}
            </Table>
          )}
          <Pagination page={pg.page} pages={pg.pages} onChange={pg.setPage} total={pg.total} />
        </div>
      )}

      <ProspectForm open={form.open} onClose={closeForm} initial={form.initial} />
    </Page>
  )
}

function VarPill({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-muted">—</span>
  const up = v >= 0
  return <span className={cx('pill', up ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger')}>{up ? '▲' : '▼'} {fmtPct(Math.abs(v), 0)}</span>
}

const StaleDot = () => <span title={STALE_TIP} className="inline-block w-2 h-2 rounded-pill bg-danger shrink-0" />

function KanbanCard({ p, offer, user, stages, dragging, onOpen, onMove, onDragStart, onDragEnd }: {
  p: Prospect; offer: string; user?: User; stages: string[]; dragging: boolean
  onOpen: () => void; onMove: (stage: string) => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void
}) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={cx('card-2 p-4 cursor-grab active:cursor-grabbing hover:border-muted/40', dragging && 'opacity-40')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{p.business}</div>
          <div className="text-xs text-muted truncate">{p.city}</div>
        </div>
        {prospectStale(p) && <StaleDot />}
      </div>
      <div className="mt-3 text-xs text-txt/80 truncate">{offer} · <span className="text-white font-medium">{fmtEur(p.amount)}</span></div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={user} size={22} />
          <span className="text-[11px] text-muted truncate">Dernier contact : {p.lastContact ? fmtDate(p.lastContact) : 'jamais'}</span>
        </div>
        <span title="Changer d’étape" onClick={(e) => e.stopPropagation()} className="relative w-7 h-7 rounded-pill grid place-content-center text-muted hover:text-txt hover:bg-white/5 shrink-0">
          <ArrowRightLeft size={13} />
          <select value={p.stage} onChange={(e) => onMove(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer">
            {stages.map((s) => <option key={s}>{s}</option>)}
          </select>
        </span>
      </div>
    </div>
  )
}
