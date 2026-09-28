import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Plus, Trophy } from 'lucide-react'
import { alive, useFlux } from '../store'
import { PROJET_STATUTS, ProjetStatut } from '../types'
import { clientName, projetStats, rentabiliteParType } from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { cx, eur, eur0, normalize, pct } from '../lib/format'
import { fdate } from '../lib/dates'
import { Bar, Card, CardHead, Empty, Page, Segmented, Tag } from '../components/ui'
import { FilterBar } from '../components/ListTools'
import { openEditor } from '../components/editors'

const statutTone: Record<ProjetStatut, 'muted' | 'accent' | 'warn' | 'danger'> = { Devis: 'muted', 'En cours': 'warn', Livré: 'accent', Annulé: 'danger' }

export default function Projets() {
  const d = useFluxData()
  const projets = alive(useFlux((s) => s.projets))
  const [q, setQ] = useState('')
  const [statut, setStatut] = useState<'tous' | ProjetStatut>('tous')
  const [tri, setTri] = useState<'recent' | 'marge' | 'reste'>('recent')

  const rows = useMemo(() => {
    const n = normalize(q)
    return projets
      .map((p) => ({ p, st: projetStats(p, d), client: d.clients.find((c) => c.id === p.clientId) }))
      .filter(({ p, client }) => (statut === 'tous' || p.statut === statut) && (!n || normalize(`${p.nom} ${p.type} ${clientName(client)}`).includes(n)))
      .sort((a, b) => (tri === 'marge' ? b.st.marge - a.st.marge : tri === 'reste' ? b.st.reste - a.st.reste : b.p.dateDebut.localeCompare(a.p.dateDebut)))
  }, [projets, d, q, statut, tri])

  const classement = useMemo(
    () =>
      projets
        .filter((p) => p.statut !== 'Annulé')
        .map((p) => ({ p, st: projetStats(p, d) }))
        .filter((x) => x.st.encaisse > 0)
        .sort((a, b) => b.st.marge - a.st.marge)
        .slice(0, 5),
    [projets, d],
  )
  const types = useMemo(() => rentabiliteParType(d), [d])
  const maxType = Math.max(1, ...types.map((t) => Math.abs(t.marge)))

  return (
    <Page
      title="Projets"
      subtitle="Montant prévu, encaissé, dépenses liées et marge réelle, projet par projet."
      actions={<button className="btn-primary" onClick={() => openEditor('projet')}><Plus size={16} /> Nouveau projet</button>}
    >
      {projets.length === 0 ? (
        <Card>
          <Empty
            icon={<FolderKanban size={24} />}
            title="Crée ton premier projet"
            text="Rattache-lui les recettes et les dépenses : FLUX calcule la marge réelle et la part de chaque associé."
            action={<button className="btn-primary" onClick={() => openEditor('projet')}><Plus size={16} /> Nouveau projet</button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-3 md:gap-4 mb-5">
            <Card className="lg:col-span-2">
              <CardHead title="Types de prestation les plus rentables" sub="Marge = encaissé − dépenses liées" />
              {types.length === 0 ? (
                <p className="text-sm text-muted">Les marges apparaîtront avec les premiers encaissements liés à un projet.</p>
              ) : (
                <div className="space-y-3.5">
                  {types.map((t, i) => (
                    <div key={t.type}>
                      <div className="flex items-baseline justify-between gap-3 mb-1.5 text-sm">
                        <span className="font-medium">
                          {i === 0 && <Trophy size={14} className="inline -mt-0.5 mr-1.5 text-accent" />}
                          {t.type} <span className="text-muted text-xs">· {t.nb} projet{t.nb > 1 ? 's' : ''}</span>
                        </span>
                        <span className="tnum">
                          <b>{eur0(t.marge)}</b> <span className="text-muted text-xs">({pct(t.margePct * 100)})</span>
                        </span>
                      </div>
                      <Bar value={Math.max(0, t.marge) / maxType} tone={t.marge < 0 ? 'danger' : 'accent'} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHead title="Classement des projets" sub="Par marge réelle" />
              {classement.length === 0 ? (
                <p className="text-sm text-muted">Aucun projet encaissé pour l’instant.</p>
              ) : (
                <ol className="space-y-3">
                  {classement.map(({ p, st }, i) => (
                    <li key={p.id}>
                      <Link to={`/projets/${p.id}`} className="flex items-center gap-3 group">
                        <span className={cx('w-7 h-7 rounded-pill grid place-content-center text-xs font-bold shrink-0', i === 0 ? 'bg-accent text-ink' : 'bg-card2 text-muted')}>{i + 1}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate group-hover:text-accent transition-colors">{p.nom}</span>
                          <span className="block text-[11px] text-muted">{p.type}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold tnum">{eur0(st.marge)}</span>
                          <span className="block text-[11px] text-muted tnum">{pct(st.margePct * 100)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <FilterBar
            q={q}
            onQ={setQ}
            placeholder="Projet, client, type…"
            active={0}
            onReset={() => undefined}
            right={
              <select className="input !w-auto !rounded-pill !py-2" value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} aria-label="Trier">
                <option value="recent">Plus récents</option>
                <option value="marge">Meilleure marge</option>
                <option value="reste">Reste à encaisser</option>
              </select>
            }
          />
          <div className="mb-4 -mt-1">
            <Segmented size="sm" value={statut} onChange={setStatut} options={[{ value: 'tous', label: 'Tous' }, ...PROJET_STATUTS.map((s) => ({ value: s, label: s }))]} />
          </div>

          <div className="grid md:grid-cols-2 gap-3 md:gap-4">
            {rows.map(({ p, st, client }) => (
              <Link key={p.id} to={`/projets/${p.id}`} className="card p-5 fade-up hover:border-line transition-colors block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.nom}</p>
                    <p className="text-xs text-muted truncate">
                      {clientName(client)} · {p.type}
                    </p>
                  </div>
                  <Tag tone={statutTone[p.statut]}>{p.statut}</Tag>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <Mini label="Prévu" value={eur0(p.montantPrevu)} />
                  <Mini label="Encaissé" value={eur0(st.encaisse)} accent />
                  <Mini label="Marge" value={eur0(st.marge)} danger={st.marge < 0} />
                </div>
                <div className="mt-4">
                  <Bar value={st.avancement} />
                  <div className="flex justify-between text-[11px] text-muted mt-1.5">
                    <span>{pct(st.avancement * 100)} encaissé</span>
                    <span>{st.reste > 0 ? `reste ${eur(st.reste)}` : p.dateLivraison ? `livraison ${fdate(p.dateLivraison)}` : 'soldé'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {rows.length === 0 && <p className="text-sm text-muted text-center py-8">Aucun projet ne correspond.</p>}
        </>
      )}
    </Page>
  )
}

function Mini({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card-2 px-3 py-2">
      <p className="text-[10.5px] text-muted">{label}</p>
      <p className={cx('text-sm font-bold tnum', accent && 'text-accent', danger && 'text-danger')}>{value}</p>
    </div>
  )
}
