import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { useStore } from '../store'
import { Partner, PARTNER_STATUSES } from '../store/types'
import { PartnerForm } from '../components/forms'
import { Callout, Card, Checkbox, Editable, Empty, FilterChips, Page, Pagination, RowMenu, SectionTitle, Segmented, Stars, StatusPill, Table, Td, Th, cx, usePagination } from '../components/ui'
import { commissionOverdue, partnerNeedsFollowup } from '../lib/selectors'
import { fmtDate, today } from '../lib/dates'
import { fmtEur, fmtNum, uid } from '../lib/format'

type Seg = 'all' | 'followup' | 'due'
const BRAND = '#0071E3', WARN = '#FF9F0A', DANGER = '#FF453A'
const segFromParam = (v: string | null): Seg => (v === 'due' || v === 'followup' ? v : 'all')

export default function Apporteurs() {
  const { partners, partnerProfiles, commissionRules, partnerRules, partnerWarning, add, patch, remove, setPartnerWarning } = useStore()
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState<{ open: boolean; initial?: Partner | null; defaults?: Partial<Partner> }>({ open: false })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [seg, setSeg] = useState<Seg>(segFromParam(params.get('filter')))
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => setSeg(segFromParam(params.get('filter'))), [params])
  useEffect(() => {
    const id = params.get('open')
    if (!id) return
    const p = partners.find((x) => x.id === id)
    if (p) setForm({ open: true, initial: p })
    params.delete('open')
    setParams(params, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = partners.filter((p) => p.status === 'Actif').length
  const revenue = partners.reduce((a, p) => a + p.revenueGenerated, 0)
  const due = partners.reduce((a, p) => a + p.commissionsDue, 0)
  const anyOverdue = partners.some(commissionOverdue)
  const toFollow = partners.filter(partnerNeedsFollowup).length

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return partners.filter((p) => {
      if (needle && ![p.name, p.profile, p.notes].some((v) => v.toLowerCase().includes(needle))) return false
      if (status && p.status !== status) return false
      if (seg === 'followup' && !partnerNeedsFollowup(p)) return false
      if (seg === 'due' && p.commissionsDue <= 0) return false
      return true
    })
  }, [partners, q, status, seg])
  const pg = usePagination(filtered, 10)

  const chips = [
    q && { key: 'q', label: `Recherche : ${q}` },
    status && { key: 'status', label: `Statut : ${status}` },
    seg !== 'all' && { key: 'seg', label: seg === 'due' ? 'Commission due' : 'À relancer' },
  ].filter((c): c is { key: string; label: string } => !!c)
  const removeChip = (k: string) => { if (k === 'q') setQ(''); if (k === 'status') setStatus(''); if (k === 'seg') setSeg('all') }
  const clearAll = () => { setQ(''); setStatus(''); setSeg('all') }

  const openNew = () => setForm({ open: true, initial: null })
  const openEdit = (p: Partner) => setForm({ open: true, initial: p })
  const markFollowed = (id: string) => patch('partners', id, { lastFollowup: today() })
  const markPaid = (p: Partner) => patch('partners', p.id, { commissionsPaid: p.commissionsPaid + p.commissionsDue, commissionsDue: 0, dueSince: null })
  const toggleSel = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const allSel = pg.slice.length > 0 && pg.slice.every((p) => selected.has(p.id))
  const selIds = [...selected].filter((id) => partners.some((p) => p.id === id))

  return (
    <Page title="Apporteurs d’affaires" subtitle="Le réseau qui nous amène des clients, et ce qu’on lui doit." actions={<button className="btn-primary" onClick={openNew}><Plus size={15} /> Apporteur</button>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Apporteurs actifs" value={fmtNum(active)} sub={`${partners.length} au total`} accent={BRAND} onClick={() => { setStatus('Actif'); setSeg('all') }} />
        <Stat label="CA généré" value={fmtEur(revenue)} sub="Cumul des ventes apportées" accent={BRAND} />
        <Stat label="Commissions dues" value={fmtEur(due)} sub={anyOverdue ? 'Une commission dépasse 7 jours' : 'À payer sous 7 jours après encaissement'} accent={anyOverdue ? DANGER : WARN} tone={anyOverdue ? 'danger' : due > 0 ? 'warn' : undefined} onClick={() => setSeg('due')} />
        <Stat label="À relancer" value={fmtNum(toFollow)} sub="Sans nouvelles depuis 30 jours" accent={WARN} tone={toFollow ? 'warn' : undefined} onClick={() => setSeg('followup')} />
      </div>

      {/* ——— Bloc A : Répertoire ——— */}
      <div className="mt-10">
        <SectionTitle right={<Segmented<Seg> value={seg} onChange={setSeg} options={[{ value: 'all', label: 'Tous' }, { value: 'followup', label: 'À relancer' }, { value: 'due', label: 'Commission due' }]} />}>Répertoire</SectionTitle>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-10" placeholder="Rechercher un apporteur, un profil…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {PARTNER_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <FilterChips chips={chips} onRemove={removeChip} onClear={clearAll} />
          {selIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted">
              <span>{selIds.length} sélectionné{selIds.length > 1 ? 's' : ''}</span>
              <button className="btn-ghost !py-1.5" onClick={() => { selIds.forEach(markFollowed); setSelected(new Set()) }}>Relancés aujourd’hui</button>
              <button className="btn-danger !py-1.5" onClick={() => { selIds.forEach((id) => remove('partners', id)); setSelected(new Set()) }}>Supprimer</button>
            </div>
          )}
        </div>

        {partners.length === 0 ? (
          <Card><Empty text="Aucun apporteur pour l’instant. Le réseau commence par un premier contact." action="Apporteur" onAction={openNew} /></Card>
        ) : filtered.length === 0 ? (
          <Card><Empty text="Aucun apporteur ne correspond à ces filtres." action="Effacer les filtres" onAction={clearAll} /></Card>
        ) : (
          <>
            <Table className="[&_.td]:px-2 [&_.th]:px-2 [&_.td:first-child]:pl-4 [&_.th:first-child]:pl-4 [&_.td:last-child]:pr-3" head={<>
              <Th className="w-10"><Checkbox checked={allSel} onChange={(v) => setSelected((s) => { const n = new Set(s); pg.slice.forEach((p) => (v ? n.add(p.id) : n.delete(p.id))); return n })} /></Th>
              <Th>Nom</Th><Th>Structure</Th><Th>Priorité</Th><Th>Statut</Th><Th>Taux</Th><Th className="text-right">Contacts</Th><Th className="text-right">CA généré</Th>
              <Th className="text-right">Comm. dues / payées</Th><Th>Relance</Th><Th>Alertes</Th><Th className="w-12" />
            </>}>
              {pg.slice.map((p) => {
                const overdue = commissionOverdue(p)
                const follow = partnerNeedsFollowup(p)
                return (
                  <tr key={p.id} className="tr cursor-pointer" onClick={() => openEdit(p)}>
                    <Td><Checkbox checked={selected.has(p.id)} onChange={(v) => toggleSel(p.id, v)} /></Td>
                    <Td>
                      <div className="font-medium text-white leading-snug">{p.name}</div>
                      <div className="text-xs text-muted mt-0.5">{p.profile || '—'}</div>
                    </Td>
                    <Td>{p.canInvoice ? <span className="pill bg-ok/15 text-ok">Peut facturer</span> : <span className="pill bg-white/5 text-muted border border-line">Ne facture pas</span>}</Td>
                    <Td><Stars n={p.priority} /></Td>
                    <Td><StatusPill status={p.status} /></Td>
                    <Td className="text-muted whitespace-nowrap">{p.commissionRate} %</Td>
                    <Td className="text-right">{fmtNum(p.contactsBrought)}</Td>
                    <Td className="text-right text-white font-medium">{fmtEur(p.revenueGenerated)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <span className={cx('font-semibold', p.commissionsDue > 0 ? 'text-warn' : 'text-muted')}>{fmtEur(p.commissionsDue)}</span>
                      <span className="text-muted"> / {fmtEur(p.commissionsPaid)}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className={cx(!p.lastFollowup && 'text-muted')}>{fmtDate(p.lastFollowup)}</span>
                        {follow && <span className="pill bg-warn/15 text-warn">à relancer</span>}
                      </div>
                    </Td>
                    <Td>{overdue ? <span className="pill bg-danger/15 text-danger">Commission &gt; 7 j</span> : <span className="text-muted">—</span>}</Td>
                    <Td className="text-right">
                      <RowMenu items={[
                        { label: 'Modifier', onClick: () => openEdit(p) },
                        { label: 'Relancé aujourd’hui', onClick: () => markFollowed(p.id) },
                        { label: 'Marquer commission payée', onClick: () => markPaid(p) },
                        { label: 'Supprimer', onClick: () => remove('partners', p.id), danger: true },
                      ]} />
                    </Td>
                  </tr>
                )
              })}
            </Table>
            <div className="mt-3"><Pagination page={pg.page} pages={pg.pages} onChange={pg.setPage} total={pg.total} /></div>
          </>
        )}
      </div>

      {/* ——— Profils cibles ——— */}
      <div className="mt-10">
        <SectionTitle right={<button className="btn-ghost !py-1.5" onClick={() => add('partnerProfiles', { id: uid(), label: 'Nouveau profil', priority: 2 })}><Plus size={14} /> Profil</button>}>Profils cibles</SectionTitle>
        {partnerProfiles.length === 0 ? (
          <Card><Empty text="Aucun profil cible. Qui parle à nos clients avant nous ?" action="Profil" onAction={() => add('partnerProfiles', { id: uid(), label: 'Nouveau profil', priority: 2 })} /></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {partnerProfiles.map((pp) => (
              <div key={pp.id} className="card-2 p-4 fade-up flex flex-col gap-3 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-white leading-snug min-w-0 flex-1">
                    <Editable value={pp.label} onChange={(label) => patch('partnerProfiles', pp.id, { label })} placeholder="Nom du profil" />
                  </div>
                  <button className="btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100 -mr-1.5 -mt-1" title="Supprimer" onClick={() => remove('partnerProfiles', pp.id)}><X size={14} /></button>
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <Stars n={pp.priority} onChange={(priority) => patch('partnerProfiles', pp.id, { priority })} />
                  <button className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setForm({ open: true, initial: null, defaults: { profile: pp.label, priority: pp.priority } })}><Plus size={12} /> Créer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ——— Bloc B : Grille de commissions ——— */}
      <div className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <SectionTitle right={<button className="btn-ghost !py-1.5" onClick={() => add('commissionRules', { id: uid(), sold: 'Nouvelle prestation', commission: '—' })}><Plus size={14} /> Ligne</button>}>Grille de commissions</SectionTitle>
          {commissionRules.length === 0 ? (
            <Card><Empty text="Aucune règle de commission. Un apporteur doit savoir ce qu’il gagne." action="Ligne" onAction={() => add('commissionRules', { id: uid(), sold: 'Nouvelle prestation', commission: '—' })} /></Card>
          ) : (
            <Table className="[&_table]:min-w-0" head={<><Th>Vendu</Th><Th>Commission</Th><Th className="w-12" /></>}>
              {commissionRules.map((r) => (
                <tr key={r.id} className="tr">
                  <Td className="text-white"><Editable value={r.sold} onChange={(sold) => patch('commissionRules', r.id, { sold })} /></Td>
                  <Td className="text-brandLight font-semibold whitespace-nowrap"><Editable value={r.commission} onChange={(commission) => patch('commissionRules', r.id, { commission })} /></Td>
                  <Td className="text-right"><RowMenu items={[{ label: 'Supprimer', onClick: () => remove('commissionRules', r.id), danger: true }]} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle right={<button className="btn-ghost !py-1.5" onClick={() => add('partnerRules', { id: uid(), text: 'Nouvelle règle' })}><Plus size={14} /> Règle</button>}>Les {partnerRules.length} règles</SectionTitle>
            {partnerRules.length === 0 ? (
              <p className="text-sm text-muted">Aucune règle. Trois suffisent : payer, informer, relancer.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {partnerRules.map((r, i) => (
                  <li key={r.id} className="flex items-start gap-3 group">
                    <span className="w-7 h-7 rounded-pill bg-brand/15 text-brandLight text-xs font-bold grid place-content-center shrink-0">{i + 1}</span>
                    <span className="text-sm text-txt leading-relaxed flex-1 pt-1"><Editable value={r.text} onChange={(text) => patch('partnerRules', r.id, { text })} /></span>
                    <button className="btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100" title="Supprimer" onClick={() => remove('partnerRules', r.id)}><X size={14} /></button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Callout tone="warn" title="Avertissement">
            <Editable value={partnerWarning} onChange={setPartnerWarning} multiline placeholder="Ajouter un avertissement" />
          </Callout>
        </div>
      </div>

      <PartnerForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} initial={form.initial} defaults={form.defaults} />
    </Page>
  )
}

function Stat({ label, value, sub, accent, tone, onClick }: { label: string; value: string; sub?: string; accent: string; tone?: 'warn' | 'danger'; onClick?: () => void }) {
  return (
    <Card accent={accent} onClick={onClick} className="min-h-[132px] flex flex-col justify-between">
      <div className="label">{label}</div>
      <div className={cx('text-3xl font-extrabold tracking-tight mt-3', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-white')}>{value}</div>
      {sub && <div className={cx('text-xs mt-2', tone === 'danger' ? 'text-danger/80' : 'text-muted')}>{sub}</div>}
    </Card>
  )
}
