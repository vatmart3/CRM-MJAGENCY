import { useState } from 'react'
import { Archive, CalendarClock, Check, MoreHorizontal, Pencil, Plus, Repeat, SkipForward, TrendingDown } from 'lucide-react'
import { alive, useFlux } from '../store'
import { Abonnement, PAYE_PAR_LABEL } from '../types'
import { coutAnnuel, coutMensuel, echeancesAConfirmer } from '../lib/finance'
import { fdate, relDays, today } from '../lib/dates'
import { cx, eur, round2 } from '../lib/format'
import { confirmerPrelevement, ignorerPrelevement } from '../lib/actions'
import { Card, CardHead, Empty, Menu, Money, Notice, Page, Segmented, Tag } from '../components/ui'
import { openEditor } from '../components/editors'

export default function Abonnements() {
  const s = useFlux()
  const [vue, setVue] = useState<'actifs' | 'inactifs'>('actifs')
  const all = alive(s.abonnements)
  const actifs = all.filter((a) => a.actif)
  const list = (vue === 'actifs' ? actifs : all.filter((a) => !a.actif)).sort((a, b) => a.prochainPrelevement.localeCompare(b.prochainPrelevement))
  const mensuel = round2(actifs.reduce((x, a) => x + coutMensuel(a), 0))
  const annuel = round2(actifs.reduce((x, a) => x + coutAnnuel(a), 0))
  const inutiles = actifs.filter((a) => !a.utilise)
  const economie = round2(inutiles.reduce((x, a) => x + coutAnnuel(a), 0))
  const aConfirmer = echeancesAConfirmer(all)
  const cat = (id: string) => s.categories.find((c) => c.id === id)?.nom ?? ''

  return (
    <Page
      title="Abonnements"
      subtitle="Chaque échéance devient une dépense, confirmée en un clic."
      actions={<button className="btn-primary" onClick={() => openEditor('abonnement')}><Plus size={16} /> Nouvel abonnement</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-4">
        <Card>
          <p className="text-sm text-muted">Coût mensuel</p>
          <Money value={mensuel} className="big text-[30px] md:text-[36px]" />
          <p className="text-xs text-muted mt-1">{actifs.length} abonnement{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Coût annuel</p>
          <Money value={annuel} className="big text-[30px] md:text-[36px]" />
          <p className="text-xs text-muted mt-1">soit {eur(annuel / 12)} par mois lissé</p>
        </Card>
        <Card className={cx('col-span-2 lg:col-span-1', inutiles.length > 0 && '!border-warn/50')}>
          <p className="text-sm text-muted flex items-center gap-1.5"><TrendingDown size={15} className="text-warn" /> Pistes d’économie</p>
          <Money value={economie} className={cx('big text-[30px] md:text-[36px]', inutiles.length > 0 && 'text-warn')} />
          <p className="text-xs text-muted mt-1">{inutiles.length ? `par an en coupant ${inutiles.map((a) => a.nom).join(', ')}` : 'Marque « utilisé : non » un abonnement qui dort.'}</p>
        </Card>
      </div>

      {aConfirmer.length > 0 && (
        <Card className="mb-4">
          <CardHead title="Prélèvements à confirmer" sub="L’échéance est passée : confirme pour créer la dépense, ou ignore si rien n’a été prélevé." />
          <div className="space-y-2.5">
            {aConfirmer.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 card-2 px-4 py-3">
                <CalendarClock size={18} className="text-accent" />
                <span className="flex-1 min-w-[160px]">
                  <span className="block text-sm font-semibold">{a.nom}</span>
                  <span className="block text-xs text-muted">Échéance du {fdate(a.prochainPrelevement)} · {a.montant ? eur(a.montant) : 'montant à compléter'}</span>
                </span>
                <button className="btn-ghost !py-2 text-xs" onClick={() => ignorerPrelevement(a)}><SkipForward size={14} /> Ignorer</button>
                {a.montant > 0 ? (
                  <button className="btn-primary !py-2 text-xs" onClick={() => confirmerPrelevement(a)}><Check size={14} /> Confirmer {eur(a.montant)}</button>
                ) : (
                  <button className="btn-primary !py-2 text-xs" onClick={() => openEditor('abonnement', { id: a.id })}><Pencil size={14} /> Compléter le montant</button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {inutiles.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {inutiles.length === 1 ? `${inutiles[0]!.nom} est marqué comme non utilisé` : `${inutiles.length} abonnements sont marqués comme non utilisés`} : {eur(economie)} par an à économiser en les coupant.
          </Notice>
        </div>
      )}

      <div className="mb-4">
        <Segmented value={vue} onChange={setVue} options={[{ value: 'actifs', label: `Actifs (${actifs.length})` }, { value: 'inactifs', label: `Arrêtés (${all.length - actifs.length})` }]} />
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty
            icon={<Repeat size={24} />}
            title={vue === 'actifs' ? 'Aucun abonnement actif' : 'Aucun abonnement arrêté'}
            text="Base44, Figma, Claude, noms de domaine, hébergement : ajoute-les pour ne plus rien oublier."
            action={vue === 'actifs' && <button className="btn-primary" onClick={() => openEditor('abonnement')}><Plus size={16} /> Nouvel abonnement</button>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {list.map((a) => (
            <AboCard key={a.id} a={a} cat={cat(a.categorieId)} />
          ))}
        </div>
      )}
    </Page>
  )
}

function AboCard({ a, cat }: { a: Abonnement; cat: string }) {
  const update = useFlux((s) => s.update)
  const t = today()
  const due = a.actif && a.prochainPrelevement <= t
  return (
    <div className={cx('card p-5 fade-up', !a.utilise && a.actif && '!border-warn/60 bg-warn/[0.06]')}>
      <div className="flex items-start gap-3">
        <span className={cx('w-11 h-11 rounded-2xl grid place-content-center font-bold text-sm shrink-0', a.actif ? 'bg-accent text-ink' : 'bg-card2 text-muted')}>
          {a.nom.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{a.nom}</p>
            {!a.utilise && a.actif && <Tag tone="warn">non utilisé</Tag>}
            {!a.montant && <Tag tone="warn">montant à compléter</Tag>}
          </div>
          <p className="text-xs text-muted">{cat} · {PAYE_PAR_LABEL[a.payePar]}</p>
        </div>
        <Menu
          trigger={<button className="btn-icon !w-8 !h-8" aria-label="Actions"><MoreHorizontal size={16} /></button>}
          items={[
            { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => openEditor('abonnement', { id: a.id }) },
            { label: a.utilise ? 'Marquer non utilisé' : 'Marquer utilisé', icon: <TrendingDown size={15} />, onClick: () => update('abonnements', a.id, { utilise: !a.utilise }) },
            { label: a.actif ? 'Arrêter l’abonnement' : 'Réactiver', icon: <Repeat size={15} />, onClick: () => update('abonnements', a.id, { actif: !a.actif }) },
            { label: 'Archiver', icon: <Archive size={15} />, onClick: () => openEditor('archive', { id: a.id, coll: 'abonnements' }), danger: true },
          ]}
        />
      </div>
      <div className="flex items-end justify-between mt-4">
        <div>
          <p className="text-2xl font-bold tracking-tight tnum">{a.montant ? eur(a.montant) : '—'}</p>
          <p className="text-xs text-muted">{a.frequence === 'mensuel' ? 'par mois' : `par an · ${eur(coutMensuel(a))}/mois`}</p>
        </div>
        {a.actif && (
          <div className="text-right">
            <p className={cx('text-xs font-semibold', due ? 'text-warn' : 'text-muted')}>{due ? 'À confirmer' : 'Prochain prélèvement'}</p>
            <p className="text-sm font-medium">{fdate(a.prochainPrelevement)} <span className="text-muted text-xs">({relDays(a.prochainPrelevement)})</span></p>
          </div>
        )}
      </div>
      {a.notes && <p className="text-xs text-muted mt-3">{a.notes}</p>}
    </div>
  )
}
