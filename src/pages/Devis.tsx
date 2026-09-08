import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Printer, Search, Settings2 } from 'lucide-react'
import { useStore } from '../store'
import { Quote, QUOTE_STATUSES, QuoteStatus } from '../store/types'
import { QuoteForm } from '../components/forms'
import { Card, Checkbox, Empty, FilterChips, Modal, Page, Pagination, RowMenu, SectionTitle, StatusPill, Table, Td, Th, cx, statusColor, usePagination } from '../components/ui'
import { quoteTotal } from '../lib/selectors'
import { addDays, fmtDate, fmtDateFull, today } from '../lib/dates'
import { fmtEur, uid } from '../lib/format'

type Filter = QuoteStatus | 'pending' | 'all'
const isStatus = (s: string | null): s is QuoteStatus => QUOTE_STATUSES.some((x) => x === s)
const matchFilter = (q: Quote, f: Filter) => f === 'all' || (f === 'pending' ? q.status === 'Envoyé' || q.status === 'Relancé' : q.status === f)
const nextNumber = (quotes: Quote[]) => {
  const nums = quotes.map((q) => Number(q.number.split('-').pop())).filter((n) => !isNaN(n))
  return `DEV-${new Date().getFullYear()}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

export default function Devis() {
  const { quotes, offers, prospects, settings, add, patch, remove, moveProspect } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [form, setForm] = useState<{ open: boolean; initial: Quote | null }>({ open: false, initial: null })
  const [preview, setPreview] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    const s = params.get('status')
    if (s === 'pending' || isStatus(s)) setFilter(s)
    const open = params.get('open')
    const q = open ? quotes.find((x) => x.id === open) : undefined
    if (q) setForm({ open: true, initial: q })
    if (s || open) setParams({}, { replace: true })
  }, [params, quotes, setParams])

  const setStatus = (q: Quote, status: QuoteStatus) => {
    const t = today()
    const pr = q.prospectId ? prospects.find((p) => p.id === q.prospectId) : undefined
    const next: Partial<Quote> = { status }
    if (status === 'Envoyé') {
      next.sentAt = q.sentAt ?? t
      next.nextFollowup = addDays(t, 1)
      if (pr && pr.stage !== 'Gagné') moveProspect(pr.id, 'Devis envoyé')
    }
    if (status === 'Relancé') { next.sentAt = q.sentAt ?? t; next.nextFollowup = addDays(t, 3) }
    if (status === 'Signé') { next.signedAt = q.signedAt ?? t; next.nextFollowup = null; if (pr) moveProspect(pr.id, 'Gagné') }
    if (status === 'Refusé' || status === 'Expiré') next.nextFollowup = null
    if (status === 'Refusé' && pr) moveProspect(pr.id, 'Perdu')
    patch('quotes', q.id, next)
  }
  const duplicate = (q: Quote) =>
    add('quotes', { ...q, id: uid(), number: nextNumber(quotes), status: 'Brouillon', sentAt: null, nextFollowup: null, signedAt: null, createdAt: today(), lines: q.lines.map((l) => ({ ...l, id: uid() })) })

  const filtered = useMemo(() => {
    const n = search.trim().toLowerCase()
    return quotes
      .filter((q) => matchFilter(q, filter) && (!n || [q.number, q.client, q.clientAddress].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt))
  }, [quotes, filter, search])
  const pg = usePagination(filtered, 10)
  const allChecked = pg.slice.length > 0 && pg.slice.every((q) => selected.includes(q.id))
  const offerName = (id: string | null) => offers.find((o) => o.id === id)?.name ?? '—'
  const chips = [
    ...(filter !== 'all' ? [{ key: 'status', label: filter === 'pending' ? 'Statut : en attente de réponse' : `Statut : ${filter}` }] : []),
    ...(search.trim() ? [{ key: 'search', label: `Recherche : « ${search.trim()} »` }] : []),
  ]
  const a = settings.agency

  return (
    <Page title="Devis & facturation" subtitle="Un devis sort dans les 24 h après chaque rendez-vous. Toute promesse est écrite dedans." actions={<button className="btn-primary" onClick={() => setForm({ open: true, initial: null })}><Plus size={15} /> Devis</button>}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {QUOTE_STATUSES.map((s) => {
          const list = quotes.filter((q) => q.status === s)
          const c = statusColor(s)
          return (
            <Card key={s} accent={c} onClick={() => setFilter(filter === s ? 'all' : s)} className={cx('!p-5', filter === s && '!border-brand')}>
              <div className="flex items-center justify-between gap-2">
                <span className="label truncate">{s}</span>
                <span className="w-1.5 h-1.5 rounded-pill shrink-0" style={{ background: c }} />
              </div>
              <div className="text-[32px] font-extrabold tracking-tight leading-none text-white mt-3">{list.length}</div>
              <div className="text-xs text-muted mt-2.5 truncate">{fmtEur(list.reduce((t, q) => t + quoteTotal(q), 0))} HT</div>
            </Card>
          )
        })}
      </div>

      {quotes.length === 0 ? (
        <Card className="mt-6"><Empty text="Aucun devis. Un devis sort dans les 24 h après chaque RDV." action="Devis" onAction={() => setForm({ open: true, initial: null })} /></Card>
      ) : (
        <>
          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-card2 border border-line rounded-pill px-4 h-10 w-full sm:w-64">
                <Search size={15} className="text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Numéro, client, ville…" className="bg-transparent outline-none text-sm w-full placeholder:text-muted/70" />
              </div>
              <select className="input !w-auto !rounded-pill !py-2" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente de réponse</option>
                {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <FilterChips chips={chips} onRemove={(k) => (k === 'status' ? setFilter('all') : setSearch(''))} onClear={() => { setFilter('all'); setSearch('') }} />
              {selected.length > 0 && (
                <div className="flex items-center gap-2 ml-auto text-xs text-muted">
                  <span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>
                  <button className="btn-danger !py-1.5" onClick={() => { selected.forEach((id) => remove('quotes', id)); setSelected([]) }}>Supprimer</button>
                </div>
              )}
            </div>

            <Table head={<>
              <Th className="w-10"><Checkbox checked={allChecked} onChange={(v) => setSelected(v ? pg.slice.map((q) => q.id) : [])} /></Th>
              <Th>Numéro</Th><Th>Client</Th><Th>Offre</Th><Th>Montant HT</Th><Th>Envoyé le</Th><Th>Relance suivante</Th><Th>Statut</Th><Th className="w-12" />
            </>}>
              {pg.slice.length === 0 && <tr><td colSpan={9} className="td text-center text-muted py-10">Aucun devis ne correspond à ce filtre.</td></tr>}
              {pg.slice.map((q) => {
                const pending = q.status === 'Envoyé' || q.status === 'Relancé'
                const late = pending && !!q.nextFollowup && q.nextFollowup < today()
                return (
                  <tr key={q.id} className="tr cursor-pointer" onClick={() => setForm({ open: true, initial: q })}>
                    <Td><Checkbox checked={selected.includes(q.id)} onChange={(v) => setSelected((s) => (v ? [...s, q.id] : s.filter((x) => x !== q.id)))} /></Td>
                    <Td className="font-mono text-[13px] text-white whitespace-nowrap">{q.number}</Td>
                    <Td><div className="font-medium text-txt whitespace-nowrap">{q.client}</div>{q.clientAddress && <div className="text-xs text-muted mt-0.5">{q.clientAddress}</div>}</Td>
                    <Td className="whitespace-nowrap">{offerName(q.offerId)}</Td>
                    <Td className="font-semibold text-white whitespace-nowrap">{fmtEur(quoteTotal(q))}</Td>
                    <Td className="text-muted whitespace-nowrap">{fmtDate(q.sentAt)}</Td>
                    <Td className={cx('whitespace-nowrap', late ? 'text-danger font-medium' : pending ? 'text-txt' : 'text-muted')}>{pending ? fmtDate(q.nextFollowup) : '—'}{late && <span className="ml-1.5 text-[11px]">en retard</span>}</Td>
                    <Td><StatusPill status={q.status} /></Td>
                    <Td className="text-right">
                      <RowMenu items={[
                        { label: 'Modifier', onClick: () => setForm({ open: true, initial: q }) },
                        { label: 'Aperçu & imprimer', onClick: () => setPreview(q.id) },
                        { label: 'Marquer envoyé', onClick: () => setStatus(q, 'Envoyé') },
                        { label: 'Marquer relancé', onClick: () => setStatus(q, 'Relancé') },
                        { label: 'Marquer signé', onClick: () => setStatus(q, 'Signé') },
                        { label: 'Marquer refusé', onClick: () => setStatus(q, 'Refusé') },
                        { label: 'Dupliquer', onClick: () => duplicate(q) },
                        { label: 'Supprimer', onClick: () => remove('quotes', q.id), danger: true },
                      ]} />
                    </Td>
                  </tr>
                )
              })}
            </Table>
            <div className="mt-3"><Pagination page={pg.page} pages={pg.pages} onChange={pg.setPage} total={pg.total} /></div>
          </div>

          <Card className="mt-6">
            <SectionTitle right={<button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => nav('/reglages')}><Settings2 size={13} /> Modifier dans les réglages</button>}>Informations légales sur le devis</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div><div className="text-white font-semibold">{a.name}</div><div className="text-muted">{a.address}</div></div>
              <Legal label="SIRET">{a.siret}</Legal>
              <Legal label="Contact">{a.email} — {a.phone}</Legal>
              <Legal label="TVA">{a.vat}</Legal>
              <Legal label="Conditions">{a.terms}</Legal>
              <Legal label="Révisions">{a.revisions}</Legal>
            </div>
            <p className="text-xs text-muted mt-5 pt-4 border-t border-line">Ces mentions apparaissent sur chaque devis généré. Un devis signé vaut bon de commande : 40 % encaissés avant le premier pixel.</p>
          </Card>
        </>
      )}

      <QuoteForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} initial={form.initial} />
      <QuotePreview quote={preview ? quotes.find((q) => q.id === preview) ?? null : null} onClose={() => setPreview(null)} onEdit={(q) => { setPreview(null); setForm({ open: true, initial: q }) }} />
    </Page>
  )
}

function Legal({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label mb-0.5">{label}</div><div className="text-txt/90">{children}</div></div>
}

// ——— Aperçu imprimable : la seule zone claire de l’application (elle imite une page PDF) ———
const PRINT_CSS = `@page { margin: 14mm }
@media print {
  #root { display: none !important }
  body { overflow: visible !important; background: #fff !important }
  body > .fixed, body > .fixed * { visibility: hidden; position: static !important; overflow: visible !important; max-height: none !important; transform: none !important; animation: none !important; backdrop-filter: none !important }
  .print-area, .print-area * { visibility: visible !important }
  .print-area { padding: 0 !important; border-radius: 0 !important; max-width: none !important }
}`

function QuotePreview({ quote, onClose, onEdit }: { quote: Quote | null; onClose: () => void; onEdit: (q: Quote) => void }) {
  const a = useStore((s) => s.settings.agency)
  const total = quote ? quoteTotal(quote) : 0
  return (
    <Modal open={!!quote} onClose={onClose} title="Aperçu du devis" width="max-w-3xl"
      footer={<><button className="btn-ghost" onClick={onClose}>Fermer</button>{quote && <button className="btn-ghost" onClick={() => onEdit(quote)}><Pencil size={14} /> Modifier</button>}<button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Imprimer / PDF</button></>}>
      <style>{PRINT_CSS}</style>
      {quote && (
        <div className="print-area bg-white text-[#111] rounded-2xl p-10 text-[13px] leading-relaxed" style={{ fontFeatureSettings: '"tnum"' }}>
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <div className="text-[26px] font-extrabold tracking-tight leading-none">{a.name}</div>
              <div className="text-[#555] mt-3 whitespace-pre-line">{a.address}</div>
              <div className="text-[#555]">SIRET {a.siret}</div>
              <div className="text-[#555]">{a.email} — {a.phone}</div>
              <div className="text-[#555]">{a.vat}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#777] font-semibold">Devis</div>
              <div className="text-xl font-bold mt-0.5">n° {quote.number}</div>
              <div className="text-[#555] mt-3">Date : {fmtDateFull(quote.sentAt ?? quote.createdAt)}</div>
              <div className="text-[#555]">Valable {quote.validityDays} jours</div>
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-[#F5F5F7] px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#777] font-semibold">Client</div>
            <div className="font-semibold text-[15px] mt-1">{quote.client}</div>
            {quote.clientAddress && <div className="text-[#555]">{quote.clientAddress}</div>}
            {quote.clientEmail && <div className="text-[#555]">{quote.clientEmail}</div>}
          </div>

          <table className="w-full mt-8 border-collapse">
            <thead>
              <tr className="border-b-2 border-[#111] text-[10px] uppercase tracking-[0.12em] text-[#777]">
                <th className="text-left py-2 font-semibold">Désignation</th>
                <th className="text-right py-2 font-semibold w-14">Qté</th>
                <th className="text-right py-2 font-semibold w-28">PU HT</th>
                <th className="text-right py-2 font-semibold w-28">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => (
                <tr key={l.id} className="border-b border-[#E5E5EA] align-top">
                  <td className="py-3 pr-4">{l.label || <span className="text-[#999]">—</span>}</td>
                  <td className="py-3 text-right">{l.qty}</td>
                  <td className="py-3 text-right">{fmtEur(l.unitPrice)}</td>
                  <td className="py-3 text-right font-medium">{fmtEur(l.qty * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
            <div className="w-72">
              <div className="flex items-center justify-between text-lg font-bold border-b-2 border-[#111] pb-2"><span>Total HT</span><span>{fmtEur(total)}</span></div>
              <div className="text-[#777] text-xs mt-2 text-right">TVA non applicable, art. 293 B du CGI</div>
            </div>
          </div>

          <div className="mt-8 text-[#333]"><span className="font-semibold">Conditions : </span>{a.terms} {a.revisions}</div>
          {quote.notes && <div className="mt-3 text-[#333] whitespace-pre-line">{quote.notes}</div>}

          <div className="mt-10 flex justify-end">
            <div className="w-72 h-32 rounded-xl border border-[#111] p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-[#777] font-semibold">Bon pour accord</div>
              <div className="text-xs text-[#555] mt-1">Date & signature</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
