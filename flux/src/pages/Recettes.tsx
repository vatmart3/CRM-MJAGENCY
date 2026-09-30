import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArrowDownLeft, Check, FileText, Mail, MoreHorizontal, Paperclip, Pencil, Plus } from 'lucide-react'
import { alive, PeriodFilter, useFlux, useIsAdmin } from '../store'
import { MODES_REGLEMENT, Recette, RECETTE_STATUTS, RecetteStatut } from '../types'
import { aMettreDeCote, clientName, joursDeRetard, statutOf } from '../lib/finance'
import { fdate, inRange, today } from '../lib/dates'
import { cx, eur, normalize, plural, round2 } from '../lib/format'
import { marquerEncaissee } from '../lib/actions'
import { openFile } from '../lib/files'
import { Avatar, Card, Empty, Menu, Page, StatutBadge, toast, Toggle, useIsDesktop } from '../components/ui'
import { FilterBar, FilterSelect, ListPeriod, Totals } from '../components/ListTools'
import { openEditor } from '../components/editors'
import { openRelance } from '../components/Relance'

const dateOf = (r: Recette) => r.dateEncaissement || r.dateFacture

export default function Recettes() {
  const s = useFlux()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [statut, setStatut] = useState(params.get('statut') ?? '')
  const [client, setClient] = useState(params.get('client') ?? '')
  const [projet, setProjet] = useState(params.get('projet') ?? '')
  const [mode, setMode] = useState('')
  const [period, setPeriod] = useState<PeriodFilter | null>(null)
  const [archived, setArchived] = useState(false)
  const desktop = useIsDesktop()

  const clients = alive(s.clients)
  const projets = alive(s.projets)

  const list = useMemo(() => {
    const n = normalize(q)
    return (archived ? s.recettes.filter((r) => r.archived) : alive(s.recettes))
      .map((r) => ({ r, statut: statutOf(r), client: s.clients.find((c) => c.id === r.clientId), projet: s.projets.find((p) => p.id === r.projetId) }))
      .filter(({ r, statut: st, client: c, projet: p }) => {
        if (statut === 'a-encaisser' ? !(st === 'En attente' || st === 'En retard') : statut && st !== statut) return false
        if (client && r.clientId !== client) return false
        if (projet && r.projetId !== projet) return false
        if (mode && r.mode !== mode) return false
        if (period && !inRange(dateOf(r), period.from, period.to)) return false
        if (n && !normalize(`${r.numeroFacture} ${r.libelle} ${clientName(c)} ${c?.nom ?? ''} ${p?.nom ?? ''} ${r.montant}`).includes(n)) return false
        return true
      })
      .sort((a, b) => dateOf(b.r).localeCompare(dateOf(a.r)))
  }, [s.recettes, s.clients, s.projets, q, statut, client, projet, mode, period, archived])

  const sum = (f: (x: (typeof list)[number]) => boolean) => round2(list.filter(f).reduce((a, x) => a + x.r.montant, 0))
  const active = [statut, client, projet, mode, period ? 'p' : '', archived ? 'a' : ''].filter(Boolean).length
  const reset = () => {
    setStatut('')
    setClient('')
    setProjet('')
    setMode('')
    setPeriod(null)
    setArchived(false)
    setParams({})
  }

  return (
    <Page
      title="Recettes"
      subtitle="Les cotisations se calculent sur la date d’encaissement réel."
      actions={
        <button className="btn-primary" onClick={() => openEditor('recette')}>
          <Plus size={16} /> Nouvelle recette
        </button>
      }
    >
      <Totals
        items={[
          { label: 'Encaissé', value: eur(sum((x) => x.statut === 'Encaissée')), tone: 'accent' },
          { label: 'En attente', value: eur(sum((x) => x.statut === 'En attente')) },
          { label: 'En retard', value: eur(sum((x) => x.statut === 'En retard')), tone: sum((x) => x.statut === 'En retard') > 0 ? 'danger' : undefined },
          { label: 'Factures', value: list.length },
        ]}
      />

      <FilterBar q={q} onQ={setQ} placeholder="N° de facture, client, prestation…" active={active} onReset={reset}>
        <label className="min-w-[140px] flex-1 sm:flex-none">
          <span className="block text-[11px] text-muted mb-1">Statut</span>
          <select className="input !py-2 !text-[13px]" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous</option>
            <option value="a-encaisser">À encaisser (attente + retard)</option>
            {RECETTE_STATUTS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <FilterSelect label="Client" value={client} onChange={setClient} options={clients.map((c) => ({ value: c.id, label: clientName(c) }))} />
        <FilterSelect label="Projet" value={projet} onChange={setProjet} options={projets.map((p) => ({ value: p.id, label: p.nom }))} />
        <FilterSelect label="Règlement" value={mode} onChange={setMode} options={MODES_REGLEMENT.map((m) => ({ value: m, label: m }))} />
        <ListPeriod value={period} onChange={setPeriod} />
        <div className="py-2">
          <Toggle checked={archived} onChange={setArchived} label="Archivées" />
        </div>
      </FilterBar>

      {list.length === 0 ? (
        <Card>
          {alive(s.recettes).length === 0 && !archived ? (
            <Empty
              icon={<ArrowDownLeft size={24} />}
              title="Ajoute ta première recette"
              text="Montant, client, c’est parti : moins de 10 secondes. FLUX calcule ensuite ce qu’il faut mettre de côté pour l’URSSAF."
              action={<button className="btn-primary" onClick={() => openEditor('recette')}><Plus size={16} /> Nouvelle recette</button>}
            />
          ) : (
            <Empty icon={<FileText size={22} />} title="Aucune recette ne correspond" text="Change les filtres ou la recherche." action={<button className="btn-ghost" onClick={reset}>Réinitialiser les filtres</button>} />
          )}
        </Card>
      ) : desktop ? (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th pl-5">Date</th>
                <th className="th">Client & prestation</th>
                <th className="th">Facture</th>
                <th className="th">Statut</th>
                <th className="th text-right">Montant</th>
                <th className="th w-12" />
              </tr>
            </thead>
            <tbody>
              {list.map(({ r, statut: st, client: c }) => (
                <tr key={r.id} className="row cursor-pointer" onClick={() => !r.archived && openEditor('recette', { id: r.id })}>
                  <td className="td pl-5 whitespace-nowrap">
                    <span className="block tnum">{fdate(dateOf(r))}</span>
                    <span className="block text-[11px] text-muted">{r.dateEncaissement ? r.mode : `échéance ${fdate(r.dateEcheance)}`}</span>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar name={clientName(c)} size={32} tone="muted" />
                      <span className="min-w-0">
                        <span className="block font-medium truncate max-w-[260px]">{clientName(c)}</span>
                        <span className="block text-xs text-muted truncate max-w-[260px]">{r.libelle}</span>
                      </span>
                    </div>
                  </td>
                  <td className="td text-muted whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {r.numeroFacture || '—'}
                      {r.justificatif && <Paperclip size={12} />}
                    </span>
                  </td>
                  <td className="td">
                    <StatutBadge statut={st} />
                    {st === 'En retard' && <span className="block text-[11px] text-danger mt-1">{joursDeRetard(r)} j{r.relances?.length ? ` · relancé ${r.relances.length}×` : ''}</span>}
                    {r.archived && <span className="block text-[11px] text-muted mt-1">Archivée : {r.archived.motif}</span>}
                  </td>
                  <td className={cx('td text-right font-semibold tnum whitespace-nowrap', st === 'Annulée' && 'line-through text-muted')}>{eur(r.montant)}</td>
                  <td className="td pr-4" onClick={(e) => e.stopPropagation()}>
                    <RowMenu r={r} statut={st} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {list.map(({ r, statut: st, client: c }) => (
            <Card key={r.id} className="!p-4" onClick={() => !r.archived && openEditor('recette', { id: r.id })}>
              <div className="flex items-start gap-3">
                <Avatar name={clientName(c)} size={38} tone={st === 'En retard' ? 'warn' : 'muted'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{clientName(c)}</p>
                    <p className={cx('font-bold tnum whitespace-nowrap', st === 'Annulée' && 'line-through text-muted')}>{eur(r.montant)}</p>
                  </div>
                  <p className="text-xs text-muted truncate">{r.libelle}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatutBadge statut={st} />
                    <span className="text-[11px] text-muted">{st === 'Encaissée' ? fdate(r.dateEncaissement) : st === 'En retard' ? `${joursDeRetard(r)} j de retard` : `échéance ${fdate(r.dateEcheance)}`}</span>
                    <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      <RowMenu r={r} statut={st} />
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {list.length > 0 && <p className="text-xs text-muted text-center mt-4">{plural(list.length, 'recette')}</p>}
    </Page>
  )
}

function RowMenu({ r, statut }: { r: Recette; statut: RecetteStatut }) {
  const restore = useFlux((s) => s.restore)
  const isAdmin = useIsAdmin()
  const settings = useFlux((s) => s.settings)
  const projets = useFlux((s) => s.projets)
  const pending = statut === 'En attente' || statut === 'En retard'
  return (
    <Menu
      trigger={<button className="btn-icon !w-8 !h-8" aria-label="Actions"><MoreHorizontal size={16} /></button>}
      items={
        r.archived
          ? [{ label: 'Restaurer', icon: <Check size={15} />, onClick: () => restore('recettes', r.id), hidden: !isAdmin }]
          : [
              { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => openEditor('recette', { id: r.id }) },
              { label: `Marquer encaissée (${eur(aMettreDeCote({ ...r, dateEncaissement: today() }, { projets, settings }))} de côté)`, icon: <Check size={15} />, onClick: () => marquerEncaissee(r), hidden: !pending },
              { label: 'Relancer par e-mail', icon: <Mail size={15} />, onClick: () => openRelance(r.id), hidden: !pending },
              {
                label: 'Voir la facture',
                icon: <FileText size={15} />,
                onClick: () => openFile(r.justificatif!).catch((e: Error) => toast({ title: 'Ouverture impossible', text: e.message, tone: 'error' })),
                hidden: !r.justificatif,
              },
              { label: 'Archiver', icon: <Archive size={15} />, onClick: () => openEditor('archive', { id: r.id, coll: 'recettes' }), danger: true },
            ]
      }
    />
  )
}
