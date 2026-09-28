import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, ArrowDownLeft, Building2, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react'
import { alive, useFlux } from '../store'
import { Client } from '../types'
import { aEncaisser, clientName, isEncaissee, statutOf } from '../lib/finance'
import { fdate } from '../lib/dates'
import { eur, eur0, normalize, round2 } from '../lib/format'
import { Avatar, Card, Empty, Page, Sheet, StatutBadge, Tag } from '../components/ui'
import { FilterBar } from '../components/ListTools'
import { openEditor } from '../components/editors'

export default function Clients() {
  const s = useFlux()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tri, setTri] = useState<'ca' | 'nom'>('ca')
  const selected = params.get('id')

  const rows = useMemo(() => {
    const n = normalize(q)
    const retard = new Set(aEncaisser(s.recettes).filter((x) => x.statut === 'En retard').map((x) => x.r.clientId))
    return alive(s.clients)
      .filter((c) => !n || normalize(`${c.nom} ${c.entreprise} ${c.activite} ${c.ville} ${c.email}`).includes(n))
      .map((c) => {
        const rs = alive(s.recettes).filter((r) => r.clientId === c.id)
        return { c, ca: round2(rs.filter(isEncaissee).reduce((a, r) => a + r.montant, 0)), nb: rs.length, retard: retard.has(c.id) }
      })
      .sort((a, b) => (tri === 'ca' ? b.ca - a.ca : clientName(a.c).localeCompare(clientName(b.c))))
  }, [s.clients, s.recettes, q, tri])

  return (
    <Page title="Clients" subtitle={`${rows.length} client${rows.length > 1 ? 's' : ''}`} actions={<button className="btn-primary" onClick={() => openEditor('client')}><Plus size={16} /> Nouveau client</button>}>
      {alive(s.clients).length === 0 ? (
        <Card>
          <Empty
            icon={<Building2 size={24} />}
            title="Ajoute ton premier client"
            text="Tu peux aussi le créer directement en saisissant une recette."
            action={<button className="btn-primary" onClick={() => openEditor('client')}><Plus size={16} /> Nouveau client</button>}
          />
        </Card>
      ) : (
        <>
          <FilterBar
            q={q}
            onQ={setQ}
            placeholder="Nom, entreprise, activité, ville…"
            active={0}
            onReset={() => undefined}
            right={
              <select className="input !w-auto !rounded-pill !py-2" value={tri} onChange={(e) => setTri(e.target.value as 'ca' | 'nom')} aria-label="Trier">
                <option value="ca">Par CA</option>
                <option value="nom">Par nom</option>
              </select>
            }
          />
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {rows.map(({ c, ca, nb, retard }) => (
              <Card key={c.id} className="!p-4" onClick={() => setParams({ id: c.id })}>
                <div className="flex items-center gap-3">
                  <Avatar name={clientName(c)} size={42} tone="muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{clientName(c)}</p>
                    <p className="text-xs text-muted truncate">{[c.entreprise && c.nom, c.activite, c.ville].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  {retard && <Tag tone="danger">retard</Tag>}
                </div>
                <div className="flex items-end justify-between mt-4">
                  <div>
                    <p className="text-[11px] text-muted">Encaissé au total</p>
                    <p className="text-lg font-bold tnum">{eur0(ca)}</p>
                  </div>
                  <p className="text-xs text-muted">{nb} facture{nb > 1 ? 's' : ''}</p>
                </div>
              </Card>
            ))}
          </div>
          {rows.length === 0 && <p className="text-sm text-muted text-center py-8">Aucun client ne correspond.</p>}
        </>
      )}
      {selected && <ClientDetail id={selected} onClose={() => setParams({})} />}
    </Page>
  )
}

function ClientDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useFlux()
  const c = s.clients.find((x) => x.id === id)
  if (!c) return null
  const recettes = alive(s.recettes)
    .filter((r) => r.clientId === id)
    .sort((a, b) => (b.dateEncaissement || b.dateFacture).localeCompare(a.dateEncaissement || a.dateFacture))
  const projets = alive(s.projets).filter((p) => p.clientId === id)
  const ca = round2(recettes.filter(isEncaissee).reduce((a, r) => a + r.montant, 0))
  const attente = round2(recettes.filter((r) => ['En attente', 'En retard'].includes(statutOf(r))).reduce((a, r) => a + r.montant, 0))
  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={clientName(c)}
      wide
      footer={
        !c.archived && (
          <>
            <button className="btn-ghost" onClick={go(() => openEditor('archive', { id: c.id, coll: 'clients' }))}><Archive size={15} /> Archiver</button>
            <button className="btn-ghost" onClick={go(() => openEditor('client', { id: c.id }))}><Pencil size={15} /> Modifier</button>
            <button className="btn-primary" onClick={go(() => openEditor('recette', { prefill: { clientId: c.id } }))}><ArrowDownLeft size={15} /> Nouvelle recette</button>
          </>
        )
      }
    >
      <Contact c={c} />
      <div className="grid grid-cols-3 gap-2.5 my-4">
        <div className="card-2 px-3.5 py-3"><p className="text-[11px] text-muted">Encaissé</p><p className="font-bold tnum text-accent">{eur(ca)}</p></div>
        <div className="card-2 px-3.5 py-3"><p className="text-[11px] text-muted">En attente</p><p className="font-bold tnum">{eur(attente)}</p></div>
        <div className="card-2 px-3.5 py-3"><p className="text-[11px] text-muted">Projets</p><p className="font-bold tnum">{projets.length}</p></div>
      </div>
      {projets.length > 0 && (
        <div className="mb-4">
          <p className="label mb-2">Projets</p>
          <div className="flex flex-wrap gap-2">
            {projets.map((p) => (
              <Link key={p.id} to={`/projets/${p.id}`} onClick={onClose} className="chip hover:bg-line/60">{p.nom} · {p.statut}</Link>
            ))}
          </div>
        </div>
      )}
      <p className="label mb-2">Factures</p>
      {recettes.length === 0 ? (
        <p className="text-sm text-muted">Aucune facture pour ce client.</p>
      ) : (
        <div className="-mx-1">
          {recettes.map((r) => (
            <button key={r.id} onClick={go(() => openEditor('recette', { id: r.id }))} className="row w-full flex items-center gap-3 px-1 py-2.5 text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{r.numeroFacture || r.libelle}</span>
                <span className="block text-xs text-muted truncate">{fdate(r.dateEncaissement || r.dateFacture)} · {r.libelle}</span>
              </span>
              <StatutBadge statut={statutOf(r)} />
              <span className="text-sm font-semibold tnum w-24 text-right">{eur(r.montant)}</span>
            </button>
          ))}
        </div>
      )}
      {c.notes && <p className="text-sm text-muted mt-4 whitespace-pre-line">{c.notes}</p>}
    </Sheet>
  )
}

function Contact({ c }: { c: Client }) {
  return (
    <div className="flex flex-wrap gap-2">
      {c.email && <a href={`mailto:${c.email}`} className="chip"><Mail size={13} /> {c.email}</a>}
      {c.telephone && <a href={`tel:${c.telephone.replace(/\s/g, '')}`} className="chip"><Phone size={13} /> {c.telephone}</a>}
      {c.ville && <span className="chip"><MapPin size={13} /> {c.ville}</span>}
      {c.activite && <span className="chip">{c.activite}</span>}
      {!c.email && !c.telephone && <span className="text-xs text-muted">Pas encore de coordonnées : complète la fiche pour pouvoir relancer par e-mail.</span>}
    </div>
  )
}
