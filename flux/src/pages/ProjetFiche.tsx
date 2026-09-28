import { Link, useParams } from 'react-router-dom'
import { Archive, ArrowDownLeft, ArrowLeft, ArrowUpRight, Pencil } from 'lucide-react'
import { useFlux } from '../store'
import { USERS } from '../types'
import { clientName, projetStats, statutOf } from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { fdate } from '../lib/dates'
import { cx, eur, pct } from '../lib/format'
import { Avatar, Bar, Card, CardHead, Empty, Money, Notice, Page, StatutBadge, Tag } from '../components/ui'
import { openEditor } from '../components/editors'

export default function ProjetFiche() {
  const { id } = useParams()
  const p = useFlux((s) => s.projets.find((x) => x.id === id))
  const d = useFluxData()
  if (!p)
    return (
      <Card>
        <Empty icon={<ArrowLeft size={22} />} title="Projet introuvable" action={<Link to="/projets" className="btn-ghost">Retour aux projets</Link>} />
      </Card>
    )
  const st = projetStats(p, d)
  const client = d.clients.find((c) => c.id === p.clientId)
  const cat = (cid: string) => d.categories.find((c) => c.id === cid)?.nom ?? '—'

  return (
    <Page
      title={p.nom}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/projets" className="inline-flex items-center gap-1 text-accent font-medium"><ArrowLeft size={14} /> Projets</Link>
          <span>·</span> {clientName(client)} <span>·</span> {p.type} <Tag>{p.statut}</Tag>
          {p.archived && <Tag tone="danger">Archivé</Tag>}
        </span>
      }
      actions={
        !p.archived && (
          <>
            <button className="btn-ghost" onClick={() => openEditor('archive', { id: p.id, coll: 'projets' })}><Archive size={15} /></button>
            <button className="btn-ghost" onClick={() => openEditor('projet', { id: p.id })}><Pencil size={15} /> Modifier</button>
          </>
        )
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
        <Stat label="Montant prévu" value={p.montantPrevu} />
        <Stat label="Encaissé" value={st.encaisse} accent sub={`${pct(st.avancement * 100)} du prévu`} />
        <Stat label="Reste à encaisser" value={st.reste} sub={st.enAttente ? `${eur(st.enAttente)} facturés en attente` : undefined} />
        <Stat label="Dépenses liées" value={st.depenses} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3 md:gap-4 mb-4">
        <div className="card lg:col-span-2 p-6 hero-grad relative overflow-hidden fade-up">
          <div className="absolute inset-0 mosaic pointer-events-none" />
          <div className="relative">
            <p className="text-sm text-muted">Marge réelle</p>
            <div className="flex items-end gap-4 flex-wrap">
              <Money value={st.marge} className={cx('big text-[44px]', st.marge < 0 && 'text-danger')} />
              <span className="pill bg-accent text-ink mb-2">{pct(st.margePct * 100, 1)}</span>
            </div>
            <p className="text-sm text-muted mt-2 tnum">
              {eur(st.encaisse)} encaissés − {eur(st.depenses)} de dépenses liées. Après cotisations estimées ({eur(st.cotisations)}) : <b className="text-txt">{eur(st.margeNette)}</b>.
            </p>
            <div className="mt-5">
              <Bar value={st.avancement} />
            </div>
          </div>
        </div>
        <Card>
          <CardHead title="Part de chaque associé" sub="Sur la marge après cotisations" />
          {(['jeremy', 'matheis'] as const).map((who) => {
            const share = who === 'jeremy' ? p.partJeremy : 100 - p.partJeremy
            const val = who === 'jeremy' ? st.partJeremy : st.partMatheis
            return (
              <div key={who} className="flex items-center gap-3 py-2.5">
                <Avatar name={USERS[who].nom} size={34} tone={who === 'jeremy' ? 'accent' : 'muted'} />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{USERS[who].prenom}</span>
                  <span className="block text-xs text-muted">{share} %</span>
                </span>
                <span className="font-bold tnum">{eur(val)}</span>
              </div>
            )
          })}
          <div className="h-2 rounded-pill overflow-hidden flex mt-3">
            <span className="bg-accent" style={{ width: `${p.partJeremy}%` }} />
            <span className="bg-expense" style={{ width: `${100 - p.partJeremy}%` }} />
          </div>
        </Card>
      </div>

      {st.marge < 0 && <div className="mb-4"><Notice tone="warn">Ce projet coûte plus qu’il n’a rapporté pour l’instant.</Notice></div>}

      <div className="grid lg:grid-cols-2 gap-3 md:gap-4">
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 pt-5 flex items-center justify-between">
            <CardHead title="Recettes du projet" />
            {!p.archived && (
              <button className="btn-ghost !py-1.5 text-xs mb-4" onClick={() => openEditor('recette', { prefill: { clientId: p.clientId, projetId: p.id, libelle: `${p.type} — ${p.nom}` } })}>
                <ArrowDownLeft size={14} /> Ajouter
              </button>
            )}
          </div>
          {st.recettes.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">Aucune recette liée.</p>
          ) : (
            st.recettes.map((r) => (
              <button key={r.id} onClick={() => openEditor('recette', { id: r.id })} className="row w-full flex items-center gap-3 px-5 py-3 text-left">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{r.numeroFacture || r.libelle}</span>
                  <span className="block text-xs text-muted">{fdate(r.dateEncaissement || r.dateFacture)}</span>
                </span>
                <StatutBadge statut={statutOf(r)} />
                <span className="text-sm font-semibold tnum w-24 text-right">{eur(r.montant)}</span>
              </button>
            ))
          )}
        </Card>
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 pt-5 flex items-center justify-between">
            <CardHead title="Dépenses liées" />
            {!p.archived && (
              <button className="btn-ghost !py-1.5 text-xs mb-4" onClick={() => openEditor('depense', { prefill: { projetId: p.id } })}>
                <ArrowUpRight size={14} /> Ajouter
              </button>
            )}
          </div>
          {st.depensesListe.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">Aucune dépense liée (sous-traitance, hébergement, cartes NFC…).</p>
          ) : (
            st.depensesListe.map((x) => (
              <button key={x.id} onClick={() => openEditor('depense', { id: x.id })} className="row w-full flex items-center gap-3 px-5 py-3 text-left">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{x.fournisseur}</span>
                  <span className="block text-xs text-muted">{fdate(x.date)} · {cat(x.categorieId)}</span>
                </span>
                <span className="text-sm font-semibold tnum w-24 text-right">{eur(x.montant)}</span>
              </button>
            ))
          )}
        </Card>
      </div>
      <p className="text-xs text-muted mt-4">
        Début {fdate(p.dateDebut)} · livraison {fdate(p.dateLivraison)} · créé par {USERS[p.createdBy]?.prenom}
      </p>
    </Page>
  )
}

function Stat({ label, value, accent, sub }: { label: string; value: number; accent?: boolean; sub?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs text-muted">{label}</p>
      <Money value={value} cents={false} className={cx('text-[22px] font-bold tracking-tight', accent && 'text-accent')} />
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </Card>
  )
}
