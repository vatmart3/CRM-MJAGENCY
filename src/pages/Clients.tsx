import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, Plus, Search } from 'lucide-react'
import { useStore } from '../store'
import { CITIES, Project, UserId } from '../store/types'
import { Callout, Card, Checkbox, ConfirmDelete, Dot, Empty, Field, Modal, Page, Pagination, Progress, RowMenu, Segmented, Table, Td, Th, Toggle, cx, usePagination } from '../components/ui'
import { projectAlert, projectProgress } from '../lib/selectors'
import { fmtDate, today } from '../lib/dates'
import { fmtEur, uid } from '../lib/format'

type Filter = 'all' | 'active' | 'delivered' | 'alerts'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tous' }, { value: 'active', label: 'En cours' }, { value: 'delivered', label: 'Livrés' }, { value: 'alerts', label: 'Alertes' },
]
const isFilter = (s: string | null): s is Filter => FILTERS.some((f) => f.value === s)
const matchFilter = (p: Project, f: Filter) => f === 'all' || (f === 'active' ? !p.deliveredAt : f === 'delivered' ? !!p.deliveredAt : projectAlert(p))
const balanceOf = (p: Project) => Math.round(p.amount * 0.6)

export default function Clients() {
  const { projects, offers, settings, patch, remove } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sheet, setSheet] = useState<string | null>(null) // project id, or 'new'
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    const f = params.get('filter')
    if (isFilter(f)) setFilter(f)
    const open = params.get('open')
    if (open && projects.some((p) => p.id === open)) setSheet(open)
    if (f || open) setParams({}, { replace: true })
  }, [params, projects, setParams])

  const active = projects.filter((p) => !p.deliveredAt)
  const delivered = projects.filter((p) => !!p.deliveredAt)
  const balance = projects.filter((p) => !p.balancePaid).reduce((a, p) => a + balanceOf(p), 0)
  const alerts = projects.filter(projectAlert)

  const filtered = useMemo(() => {
    const n = search.trim().toLowerCase()
    return projects
      .filter((p) => matchFilter(p, filter) && (!n || [p.client, p.contact, p.city, p.domain].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => Number(!!a.deliveredAt) - Number(!!b.deliveredAt) || (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999'))
  }, [projects, filter, search])
  const pg = usePagination(filtered, 10)
  const offerName = (id: string) => offers.find((o) => o.id === id)?.name ?? '—'
  const toggleSel = (id: string, v: boolean) => setSelected((s) => (v ? [...s, id] : s.filter((x) => x !== id)))
  const allChecked = pg.slice.length > 0 && pg.slice.every((p) => selected.includes(p.id))
  const markDelivered = (p: Project) => patch('projects', p.id, { deliveredAt: today(), deliveryDate: p.deliveryDate ?? today() })
  const current = sheet && sheet !== 'new' ? projects.find((p) => p.id === sheet) ?? null : null

  return (
    <Page title="Clients & projets" subtitle="Chaque client signé, son avancement et ce qu’il reste à encaisser." actions={<button className="btn-primary" onClick={() => setSheet('new')}><Plus size={15} /> Client / projet</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Projets en cours" value={String(active.length)} accent="#0071E3" sub={`${fmtEur(active.reduce((a, p) => a + p.amount, 0))} en production`} active={filter === 'active'} onClick={() => setFilter(filter === 'active' ? 'all' : 'active')} />
        <Stat label="Livrés" value={String(delivered.length)} accent="#30D158" sub={`${fmtEur(delivered.reduce((a, p) => a + p.amount, 0))} livrés au total`} active={filter === 'delivered'} onClick={() => setFilter(filter === 'delivered' ? 'all' : 'delivered')} />
        <Stat label="Solde à encaisser" value={fmtEur(balance)} accent="#FF9F0A" sub={`${projects.filter((p) => !p.balancePaid).length} solde${projects.filter((p) => !p.balancePaid).length > 1 ? 's' : ''} de 60 % en attente`} />
        <Stat label="Alertes" value={String(alerts.length)} accent={alerts.length ? '#FF453A' : '#3A3A40'} danger={alerts.length > 0} sub={alerts.length ? 'Livré sans avis ou sans reco' : 'Aucun projet livré sans suite'} active={filter === 'alerts'} onClick={() => setFilter(filter === 'alerts' ? 'all' : 'alerts')} />
      </div>

      {projects.length === 0 ? (
        <Card className="mt-6"><Empty text="Aucun client signé pour l’instant. Le premier arrive du pipeline." action="Voir le pipeline" onAction={() => nav('/pipeline')} /></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mt-8 mb-4">
            <div className="flex items-center gap-2 bg-card2 border border-line rounded-pill px-4 h-10 w-full sm:w-72">
              <Search size={15} className="text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, contact, ville, domaine…" className="bg-transparent outline-none text-sm w-full placeholder:text-muted/70" />
            </div>
            <Segmented value={filter} onChange={setFilter} options={FILTERS} />
            {selected.length > 0 && (
              <div className="flex items-center gap-2 ml-auto text-xs text-muted">
                <span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
                <button className="btn-ghost !py-1.5" onClick={() => { projects.filter((p) => selected.includes(p.id) && !p.deliveredAt).forEach(markDelivered); setSelected([]) }}>Marquer livrés</button>
                <button className="btn-danger !py-1.5" onClick={() => { selected.forEach((id) => remove('projects', id)); setSelected([]) }}>Supprimer</button>
              </div>
            )}
          </div>

          <Table head={<>
            <Th className="w-10"><Checkbox checked={allChecked} onChange={(v) => setSelected(v ? pg.slice.map((p) => p.id) : [])} /></Th>
            <Th>Client</Th><Th>Offre</Th><Th>Montant</Th><Th>Acompte</Th><Th>Solde</Th><Th>Livraison prévue</Th><Th className="min-w-[160px]">Avancement</Th><Th>Avis / Reco</Th><Th className="w-12" />
          </>}>
            {pg.slice.length === 0 && <tr><td colSpan={10} className="td text-center text-muted py-10">Aucun projet ne correspond à ce filtre.</td></tr>}
            {pg.slice.map((p) => {
              const alert = projectAlert(p)
              const pct = projectProgress(p.steps, settings.productionSteps)
              return (
                <tr key={p.id} className={cx('tr cursor-pointer', alert && 'shadow-[inset_3px_0_0_#FF453A]')} onClick={() => setSheet(p.id)}>
                  <Td><Checkbox checked={selected.includes(p.id)} onChange={(v) => toggleSel(p.id, v)} /></Td>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{p.client}</span>
                      {alert && <span className="pill bg-danger/15 text-danger">Livré sans avis / reco</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5">{p.city}{p.contact && ` · ${p.contact}`}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{offerName(p.offerId)}</Td>
                  <Td className="font-semibold text-white whitespace-nowrap">{fmtEur(p.amount)}</Td>
                  <Td><PaidPill paid={p.depositPaid} /></Td>
                  <Td><PaidPill paid={p.balancePaid} /></Td>
                  <Td className={cx('whitespace-nowrap', p.deliveredAt ? 'text-muted' : 'text-txt')}>{p.deliveredAt ? `Livré le ${fmtDate(p.deliveredAt)}` : fmtDate(p.deliveryDate)}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="flex-1" color={pct === 100 ? '#30D158' : undefined} />
                      <span className={cx('text-xs w-11 text-right tabular-nums whitespace-nowrap', pct === 100 ? 'text-ok' : 'text-muted')}>{pct} %</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <span title={p.reviewAsked ? 'Avis Google demandé' : 'Avis Google non demandé'}><Dot color={p.reviewAsked ? '#30D158' : p.deliveredAt ? '#FF453A' : '#3A3A40'} /></span>
                      <span title={p.referralObtained ? 'Recommandation obtenue' : 'Recommandation non obtenue'}><Dot color={p.referralObtained ? '#30D158' : p.deliveredAt ? '#FF453A' : '#3A3A40'} /></span>
                    </span>
                  </Td>
                  <Td className="text-right">
                    <RowMenu items={[
                      { label: 'Ouvrir la fiche', onClick: () => setSheet(p.id) },
                      { label: 'Marquer livré aujourd’hui', onClick: () => markDelivered(p) },
                      { label: 'Supprimer', onClick: () => remove('projects', p.id), danger: true },
                    ]} />
                  </Td>
                </tr>
              )
            })}
          </Table>
          <div className="mt-3"><Pagination page={pg.page} pages={pg.pages} onChange={pg.setPage} total={pg.total} /></div>
        </>
      )}

      <ProjectSheet open={sheet !== null} onClose={() => setSheet(null)} initial={current} />
    </Page>
  )
}

function Stat({ label, value, accent, sub, active, danger, onClick }: { label: string; value: string; accent: string; sub?: string; active?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <Card accent={accent} onClick={onClick} className={cx('!p-5', active && '!border-brand')}>
      <div className="label">{label}</div>
      <div className={cx('text-[32px] font-extrabold tracking-tight leading-none mt-3', danger ? 'text-danger' : 'text-white')}>{value}</div>
      {sub && <div className="text-xs text-muted mt-2.5 truncate">{sub}</div>}
    </Card>
  )
}

function PaidPill({ paid }: { paid: boolean }) {
  return <span className={cx('pill', paid ? 'bg-ok/15 text-ok' : 'bg-white/5 text-muted')}>{paid ? '✓ Encaissé' : 'En attente'}</span>
}

// ——— Fiche projet : checklist de production + champs ———
function ProjectSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Project | null }) {
  const { add, patch, remove, settings, offers, addons, partners, prospects, users } = useStore()
  const empty = (): Project => ({
    id: uid(), client: '', contact: '', phone: '', email: '', city: 'Sète', offerId: offers[0]?.id ?? 'essentiel', amount: offers[0]?.price ?? 990, depositPaid: false, balancePaid: false,
    deliveryDate: null, deliveredAt: null, domain: '', url: '', reviewAsked: false, referralObtained: false, addons: [], steps: {}, assignee: 'jeremy', partnerId: null, paidAt: null, notes: '', createdAt: today(),
  })
  const [p, setP] = useState<Project>(initial ?? empty())
  const [fromProspect, setFromProspect] = useState('')
  useEffect(() => { if (open) { setP(initial ?? empty()); setFromProspect('') } }, [open, initial?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Project, v: unknown) => setP((x) => ({ ...x, [k]: v }))
  const steps = settings.productionSteps
  const done = steps.filter((s) => p.steps[s.id]).length
  const pct = projectProgress(p.steps, steps)
  const won = prospects.filter((x) => x.stage === 'Gagné')
  const tick = (id: string, v: boolean) => {
    const next = { ...p.steps, [id]: v }
    setP((x) => ({ ...x, steps: next }))
    if (initial) patch('projects', p.id, { steps: next })
  }
  const pickProspect = (id: string) => {
    setFromProspect(id)
    const pr = won.find((x) => x.id === id)
    if (!pr) return
    const offer = offers.find((o) => o.id === pr.offerId)
    setP((x) => ({ ...x, client: pr.business, city: pr.city, contact: `${pr.contactFirst} ${pr.contactLast}`.trim(), phone: pr.phone, email: pr.email, offerId: offer?.id ?? x.offerId, amount: pr.amount || offer?.price || x.amount, assignee: pr.assignee, partnerId: pr.partnerId }))
  }
  const save = () => {
    if (!p.client.trim()) return
    if (initial) patch('projects', p.id, p); else add('projects', p)
    onClose()
  }
  const url = p.url && !/^https?:\/\//.test(p.url) ? `https://${p.url}` : p.url

  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" title={initial ? <span>{initial.client} <span className="text-muted font-normal text-sm ml-2">{initial.city}</span></span> : 'Nouveau client / projet'}
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('projects', p.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!p.client.trim()} onClick={save}>Enregistrer</button></>}>
      {initial && projectAlert(p) && <div className="mb-5"><Callout tone="danger" title="Après-vente incomplet">Projet livré sans avis Google demandé / sans recommandation obtenue.</Callout></div>}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-2">
          <div className="card-2 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="label">Avancement</div>
                <div className="big !text-[40px] mt-2">{pct} %</div>
              </div>
              <div className="text-xs text-muted text-right">{done} / {steps.length} étapes</div>
            </div>
            <Progress value={pct} className="mt-4" color={pct === 100 ? '#30D158' : undefined} />
          </div>
          <div className="mt-3 space-y-0.5">
            {steps.map((s, i) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.03] cursor-pointer">
                <Checkbox checked={!!p.steps[s.id]} onChange={(v) => tick(s.id, v)} />
                <span className="text-[11px] text-muted w-4 text-right tabular-nums">{i + 1}</span>
                <span className={cx('text-sm leading-snug', p.steps[s.id] ? 'text-muted line-through' : 'text-txt')}>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {!initial && won.length > 0 && (
            <Field label="Depuis un prospect gagné" className="sm:col-span-2" hint="Pré-remplit le client, la ville, l’offre et l’assigné.">
              <select className="input" value={fromProspect} onChange={(e) => pickProspect(e.target.value)}><option value="">— Saisie libre —</option>{won.map((x) => <option key={x.id} value={x.id}>{x.business} · {x.city}</option>)}</select>
            </Field>
          )}
          <Field label="Client" className="sm:col-span-2"><input className="input" autoFocus={!initial} value={p.client} onChange={(e) => set('client', e.target.value)} placeholder="Nom du commerce" /></Field>
          <Field label="Contact"><input className="input" value={p.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
          <Field label="Ville"><input className="input" list="pj-cities" value={p.city} onChange={(e) => set('city', e.target.value)} /><datalist id="pj-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Téléphone"><input className="input" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Offre"><select className="input" value={p.offerId} onChange={(e) => { const o = offers.find((x) => x.id === e.target.value); setP((x) => ({ ...x, offerId: e.target.value, amount: o ? o.price : x.amount })) }}>{offers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.priceLabel}</option>)}</select></Field>
          <Field label="Montant (€)"><input className="input" type="number" value={p.amount} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
          <div className="sm:col-span-2 grid grid-cols-2 gap-4 card-2 p-4">
            <Toggle checked={p.depositPaid} onChange={(v) => set('depositPaid', v)} label={`Acompte 40 % (${fmtEur(Math.round(p.amount * 0.4))})`} />
            <Toggle checked={p.balancePaid} onChange={(v) => setP((x) => ({ ...x, balancePaid: v, paidAt: v ? x.paidAt ?? today() : x.paidAt }))} label={`Solde 60 % (${fmtEur(balanceOf(p))})`} />
            {p.balancePaid && <Field label="Encaissé le" className="col-span-2 sm:col-span-1"><input className="input" type="date" value={p.paidAt ?? ''} onChange={(e) => set('paidAt', e.target.value || null)} /></Field>}
          </div>
          <Field label="Livraison prévue"><input className="input" type="date" value={p.deliveryDate ?? ''} onChange={(e) => set('deliveryDate', e.target.value || null)} /></Field>
          <Field label="Livré le">
            <div className="flex items-center gap-3">
              <input className="input" type="date" value={p.deliveredAt ?? ''} onChange={(e) => set('deliveredAt', e.target.value || null)} />
              <Toggle checked={!!p.deliveredAt} onChange={(v) => set('deliveredAt', v ? p.deliveredAt ?? today() : null)} label="Livré" />
            </div>
          </Field>
          <Field label="Nom de domaine"><input className="input" value={p.domain} onChange={(e) => set('domain', e.target.value)} placeholder="commerce-sete.fr" /></Field>
          <Field label="URL du site">
            <div className="flex items-center gap-2">
              <input className="input" value={p.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
              {p.url && <a href={url} target="_blank" rel="noreferrer" className="btn-icon shrink-0 !text-brandLight" title="Ouvrir le site"><ExternalLink size={16} /></a>}
            </div>
          </Field>
          <div className="sm:col-span-2 grid grid-cols-2 gap-4 card-2 p-4">
            <Toggle checked={p.reviewAsked} onChange={(v) => set('reviewAsked', v)} label="Avis Google demandé" />
            <Toggle checked={p.referralObtained} onChange={(v) => set('referralObtained', v)} label="Recommandation obtenue" />
          </div>
          <div className="sm:col-span-2">
            <div className="label mb-2">Options vendues</div>
            <div className="flex flex-wrap gap-2">
              {addons.map((a) => {
                const on = p.addons.includes(a.name)
                return <button key={a.id} type="button" onClick={() => set('addons', on ? p.addons.filter((x) => x !== a.name) : [...p.addons, a.name])} className={cx('chip', on ? '!bg-brand/15 !border-brand/60 !text-white' : 'text-muted hover:border-muted/60')}>{on ? '✓ ' : ''}{a.name} <span className="text-muted">· {a.price}</span></button>
              })}
            </div>
          </div>
          <Field label="Assigné"><select className="input" value={p.assignee} onChange={(e) => set('assignee', e.target.value as UserId)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Apporteur"><select className="input" value={p.partnerId ?? ''} onChange={(e) => set('partnerId', e.target.value || null)}><option value="">Aucun</option>{partners.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className="input" value={p.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Promesses faites, accès, contenus reçus…" /></Field>
        </div>
      </div>
    </Modal>
  )
}
