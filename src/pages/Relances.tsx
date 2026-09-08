import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useStore } from '../store'
import { Followup, UserId } from '../store/types'
import { UserFilter } from '../components/Layout'
import { Avatar, Card, Checkbox, ConfirmDelete, Empty, Field, Modal, Page, Pagination, RowMenu, SectionTitle, Segmented, Table, Td, Th, Toggle, cx, usePagination } from '../components/ui'
import { addDays, daysSince, fmtDateLong, today } from '../lib/dates'
import { uid } from '../lib/format'

type Filter = 'today' | 'late' | 'upcoming' | 'done' | 'all'
const FILTERS: Filter[] = ['today', 'late', 'upcoming', 'done', 'all']
const CHANNELS = ['Mail', 'SMS ou DM', 'Appel', 'DM Instagram', 'Terrain']
const stepLabel = (f: Followup) => f.title.match(/J\+\d+/)?.[0] ?? f.title.split(' — ')[1] ?? f.channel

export default function Relances() {
  const { followups, prospects, users, followupSequence, patch, remove } = useStore()
  const uf = useStore((s) => s.ui.userFilter)
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const raw = sp.get('filter')
  const filter: Filter = FILTERS.includes(raw as Filter) ? (raw as Filter) : 'today'
  const openId = sp.get('open')
  const [modal, setModal] = useState<{ open: boolean; initial: Followup | null }>({ open: false, initial: null })
  const t = today()

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    setSp(n, { replace: true })
  }
  useEffect(() => {
    if (!openId) return
    const f = useStore.getState().followups.find((x) => x.id === openId)
    if (f) setModal({ open: true, initial: f })
  }, [openId])
  const openModal = (initial: Followup | null = null) => setModal({ open: true, initial })
  const closeModal = () => { setModal((m) => ({ ...m, open: false })); if (openId) setParam('open', '') }

  const mine = useMemo(() => followups.filter((f) => uf === 'all' || f.assignee === uf), [followups, uf])
  const counts = {
    today: mine.filter((f) => !f.done && f.dueDate <= t).length,
    late: mine.filter((f) => !f.done && f.dueDate < t).length,
    upcoming: mine.filter((f) => !f.done && f.dueDate > t).length,
  }
  const list = useMemo(() => {
    const match = (f: Followup) =>
      filter === 'today' ? !f.done && f.dueDate <= t
      : filter === 'late' ? !f.done && f.dueDate < t
      : filter === 'upcoming' ? !f.done && f.dueDate > t
      : filter === 'done' ? f.done
      : true
    return mine.filter(match).sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate))
  }, [mine, filter, t])
  const pg = usePagination(list, 12)
  const userOf = (id: string) => users.find((u) => u.id === id)

  const markDone = (f: Followup, done: boolean) => {
    patch('followups', f.id, { done })
    if (done && f.prospectId) patch('prospects', f.prospectId, { lastContact: t })
  }
  const postpone = (f: Followup) => patch('followups', f.id, { dueDate: addDays(f.dueDate < t ? t : f.dueDate, 3) })

  return (
    <Page
      title="Relances"
      subtitle="La séquence J+1 / J+3 / J+7 / J+14 / J+30 se crée automatiquement à chaque devis envoyé."
      actions={<><UserFilter /><button className="btn-primary" onClick={() => openModal()}><Plus size={15} /> Relance</button></>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="À faire aujourd’hui" n={counts.today} accent="#0071E3" sub="retards compris" active={filter === 'today'} onClick={() => setParam('filter', 'today')} />
        <StatCard label="En retard" n={counts.late} accent="#FF453A" tone="danger" sub="à traiter en priorité" active={filter === 'late'} onClick={() => setParam('filter', 'late')} />
        <StatCard label="À venir" n={counts.upcoming} accent="#8A8A93" sub="planifiées" active={filter === 'upcoming'} onClick={() => setParam('filter', 'upcoming')} />
      </div>

      <div className="mt-6 space-y-4">
        <Segmented<Filter> value={filter} onChange={(f) => setParam('filter', f)} options={[
          { value: 'today', label: 'Aujourd’hui' }, { value: 'late', label: 'En retard' }, { value: 'upcoming', label: 'À venir' }, { value: 'done', label: 'Faites' }, { value: 'all', label: 'Toutes' },
        ]} />

        {list.length === 0 ? (
          <div className="card fade-up"><Empty text="Aucune relance pour ce filtre. Le pipeline respire." action="Voir le pipeline" onAction={() => nav('/pipeline')} /></div>
        ) : (
          <Table head={<><Th className="w-10" /><Th>Prospect</Th><Th>Étape</Th><Th>Canal</Th><Th>Message</Th><Th>Échéance</Th><Th>Assigné</Th><Th /></>}>
            {pg.slice.map((f) => {
              const late = !f.done && f.dueDate < t
              const p = prospects.find((x) => x.id === f.prospectId)
              const lateDays = daysSince(f.dueDate) ?? 0
              return (
                <tr key={f.id} className={cx('tr', f.done && 'opacity-50')}>
                  <Td><Checkbox checked={f.done} onChange={(v) => markDone(f, v)} /></Td>
                  <Td>
                    {p ? <Link to={`/pipeline?open=${p.id}`} className="text-white font-medium hover:text-brandLight">{p.business}</Link> : <span className="text-white font-medium">{f.title || '—'}</span>}
                    {p && <div className="text-xs text-muted">{p.city}</div>}
                  </Td>
                  <Td><span className="pill bg-card2 border border-line text-txt">{stepLabel(f)}</span></Td>
                  <Td><span className="chip">{f.channel}</span></Td>
                  <Td className="text-muted max-w-[320px]"><div className="truncate" title={f.message}>{f.message || '—'}</div></Td>
                  <Td className={cx('whitespace-nowrap', late ? 'text-danger font-medium' : 'text-txt')}>
                    {fmtDateLong(f.dueDate)}
                    {late && <div className="text-[11px] text-danger/80 font-normal">{lateDays} jour{lateDays > 1 ? 's' : ''} de retard</div>}
                  </Td>
                  <Td><Avatar user={userOf(f.assignee)} size={26} /></Td>
                  <Td className="text-right">
                    <RowMenu items={[
                      { label: f.done ? 'Marquer à faire' : 'Marquer faite', onClick: () => markDone(f, !f.done) },
                      { label: 'Reporter de 3 jours', onClick: () => postpone(f) },
                      { label: 'Modifier', onClick: () => openModal(f) },
                      { label: 'Supprimer', onClick: () => remove('followups', f.id), danger: true },
                    ]} />
                  </Td>
                </tr>
              )
            })}
          </Table>
        )}
        <Pagination page={pg.page} pages={pg.pages} onChange={pg.setPage} total={pg.total} />
      </div>

      <Card className="mt-6">
        <SectionTitle right={<Link to="/playbook" className="text-xs text-muted hover:text-txt inline-flex items-center gap-1">Modifier dans le Playbook <ArrowUpRight size={13} /></Link>}>Séquence de relance</SectionTitle>
        <div className="divide-y divide-line/70">
          {followupSequence.map((s) => (
            <div key={s.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="pill bg-brand/15 text-brandLight w-14 justify-center shrink-0">{s.moment}</span>
              <span className="chip shrink-0">{s.channel}</span>
              <span className="text-sm text-txt/90">{s.message}</span>
            </div>
          ))}
        </div>
      </Card>

      <FollowupModal open={modal.open} onClose={closeModal} initial={modal.initial} />
    </Page>
  )
}

function StatCard({ label, n, accent, sub, tone, active, onClick }: { label: string; n: number; accent: string; sub: string; tone?: 'danger'; active: boolean; onClick: () => void }) {
  return (
    <Card accent={accent} onClick={onClick} className={cx(active && 'ring-1 ring-brand/60')}>
      <div className="label">{label}</div>
      <div className={cx('text-4xl font-extrabold tracking-tight leading-none mt-4', tone === 'danger' && n > 0 ? 'text-danger' : 'text-white')}>{n}</div>
      <div className="text-xs text-muted mt-3">{sub}</div>
    </Card>
  )
}

function FollowupModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Followup | null }) {
  const { add, patch, remove, prospects, users, settings } = useStore()
  const empty = (): Followup => ({ id: uid(), prospectId: null, quoteId: null, title: '', channel: 'Mail', message: '', dueDate: today(), done: false, assignee: settings.currentUser, createdAt: today() })
  const [f, setF] = useState<Followup>(initial ?? empty())
  useEffect(() => { if (open) setF(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Followup, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const prospect = prospects.find((p) => p.id === f.prospectId)
  const valid = !!(f.title.trim() || prospect) && !!f.dueDate
  const save = () => {
    const item = { ...f, title: f.title.trim() || `${prospect?.business} — relance` }
    if (initial) patch('followups', f.id, item); else add('followups', item)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier la relance' : 'Nouvelle relance'}
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('followups', f.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!valid} onClick={save}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prospect" className="md:col-span-2">
          <select className="input" value={f.prospectId ?? ''} onChange={(e) => { const p = prospects.find((x) => x.id === e.target.value); setF((x) => ({ ...x, prospectId: p?.id ?? null, assignee: p?.assignee ?? x.assignee })) }}>
            <option value="">Aucun (relance libre)</option>
            {prospects.map((p) => <option key={p.id} value={p.id}>{p.business} · {p.city}</option>)}
          </select>
        </Field>
        <Field label="Titre" className="md:col-span-2" hint={prospect && !f.title.trim() ? `Par défaut : « ${prospect.business} — relance »` : undefined}>
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Garage Poussan Auto — J+7" autoFocus />
        </Field>
        <Field label="Canal"><select className="input" value={f.channel} onChange={(e) => set('channel', e.target.value)}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Échéance"><input className="input" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Assigné"><select className="input" value={f.assignee} onChange={(e) => set('assignee', e.target.value as UserId)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <div className="flex items-end pb-2"><Toggle checked={f.done} onChange={(v) => set('done', v)} label="Relance faite" /></div>
        <Field label="Message" className="md:col-span-2"><textarea className="input" value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="Ce qu’on dit, ce qu’on envoie." /></Field>
      </div>
    </Modal>
  )
}
