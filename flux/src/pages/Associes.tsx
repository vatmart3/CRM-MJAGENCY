import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { PeriodFilter } from '../store'
import { USERS, UserId } from '../types'
import { acreActive, clientName, isEncaissee, projetStats, rangeFor, repartition, tauxTotal } from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { inRange, today } from '../lib/dates'
import { cx, eur, pct, round2 } from '../lib/format'
import { Avatar, Card, CardHead, Money, Page, Tag } from '../components/ui'
import { PeriodPicker } from '../components/PeriodPicker'

export default function Associes() {
  const d = useFluxData()
  const [period, setPeriod] = useState<PeriodFilter>(() => rangeFor('annee', today()))
  const rep = useMemo(() => repartition(d, period.from, period.to), [d, period])
  const total = rep.jeremy.ca + rep.matheis.ca

  const parProjet = useMemo(() => {
    const out = d.projets
      .map((p) => {
        const ca = round2(d.recettes.filter((r) => r.projetId === p.id && isEncaissee(r) && inRange(r.dateEncaissement, period.from, period.to)).reduce((a, r) => a + r.montant, 0))
        return { p, ca, st: projetStats(p, d) }
      })
      .filter((x) => x.ca > 0)
      .sort((a, b) => b.ca - a.ca)
    const sansProjet = round2(d.recettes.filter((r) => !r.projetId && isEncaissee(r) && inRange(r.dateEncaissement, period.from, period.to)).reduce((a, r) => a + r.montant, 0))
    return { out, sansProjet }
  }, [d, period])

  return (
    <Page title="Répartition associés" subtitle="Selon la répartition de chaque projet, et la répartition par défaut pour le reste." actions={<PeriodPicker value={period} onChange={setPeriod} />}>
      <div className="grid md:grid-cols-2 gap-3 md:gap-4 mb-4">
        {(['jeremy', 'matheis'] as UserId[]).map((who) => {
          const r = rep[who]
          return (
            <div key={who} className={cx('card p-6 fade-up relative overflow-hidden', who === 'jeremy' && 'hero-grad')}>
              {who === 'jeremy' && <div className="absolute inset-0 mosaic pointer-events-none" />}
              <div className="relative">
                <div className="flex items-center gap-3">
                  <Avatar name={USERS[who].nom} size={44} tone={who === 'jeremy' ? 'accent' : 'muted'} />
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {USERS[who].nom}
                      {acreActive(d.settings, who) ? <Tag tone="accent">ACRE</Tag> : <Tag>Sans ACRE</Tag>}
                    </p>
                    <p className="text-xs text-muted">{total > 0 ? `${Math.round((r.ca / total) * 100)} % du CA de la période` : 'Aucun encaissement sur la période'}</p>
                  </div>
                </div>
                <p className="text-sm text-muted mt-6">Solde net</p>
                <Money value={r.solde} className={cx('big text-[40px]', r.solde < 0 && 'text-danger')} />
                <div className="mt-5 space-y-2 text-sm">
                  <Row label="Part de CA générée" value={r.ca} />
                  <Row label={`− Ses cotisations URSSAF (${pct(tauxTotal(d.settings, who), 1)})`} value={-r.cotisations} />
                  <Row label="− Part des dépenses" value={-r.depenses} />
                  <div className="border-t border-line/60 pt-2"><Row label="= Résultat attribuable" value={r.resultat} strong /></div>
                  <Row label="+ Notes de frais à lui rembourser" value={r.du} accent={r.du > 0} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Card className="!p-0 overflow-hidden mb-4">
        <div className="px-5 pt-5">
          <CardHead title="Détail par projet" sub="CA encaissé sur la période et part de chacun" />
        </div>
        {parProjet.out.length === 0 && parProjet.sansProjet === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Aucun encaissement sur la période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="th pl-5">Projet</th>
                  <th className="th">Répartition</th>
                  <th className="th text-right">CA</th>
                  <th className="th text-right">Jérémy</th>
                  <th className="th pr-5 text-right">Matheis</th>
                </tr>
              </thead>
              <tbody>
                {parProjet.out.map(({ p, ca }) => (
                  <tr key={p.id} className="row">
                    <td className="td pl-5">
                      <Link to={`/projets/${p.id}`} className="font-medium hover:text-accent">{p.nom}</Link>
                      <span className="block text-[11px] text-muted">{clientName(d.clients.find((c) => c.id === p.clientId))}</span>
                    </td>
                    <td className="td">
                      <div className="w-24 h-1.5 rounded-pill overflow-hidden flex">
                        <span className="bg-accent" style={{ width: `${p.partJeremy}%` }} />
                        <span className="bg-expense" style={{ width: `${100 - p.partJeremy}%` }} />
                      </div>
                      <span className="text-[11px] text-muted tnum">{p.partJeremy} / {100 - p.partJeremy}</span>
                    </td>
                    <td className="td text-right tnum">{eur(ca)}</td>
                    <td className="td text-right tnum">{eur((ca * p.partJeremy) / 100)}</td>
                    <td className="td pr-5 text-right tnum">{eur((ca * (100 - p.partJeremy)) / 100)}</td>
                  </tr>
                ))}
                {parProjet.sansProjet > 0 && (
                  <tr className="row">
                    <td className="td pl-5 text-muted">Recettes sans projet</td>
                    <td className="td text-[11px] text-muted tnum">{d.settings.partDefautJeremy} / {100 - d.settings.partDefautJeremy} (défaut)</td>
                    <td className="td text-right tnum">{eur(parProjet.sansProjet)}</td>
                    <td className="td text-right tnum">{eur((parProjet.sansProjet * d.settings.partDefautJeremy) / 100)}</td>
                    <td className="td pr-5 text-right tnum">{eur((parProjet.sansProjet * (100 - d.settings.partDefautJeremy)) / 100)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted flex items-start gap-2 max-w-2xl">
        <Info size={14} className="shrink-0 mt-0.5" />
        Chacun déclare sa part du CA encaissé et paie ses cotisations à son propre taux (ACRE réglable dans Réglages) ; les dépenses liées à un projet suivent sa répartition, les autres la répartition par défaut ({d.settings.partDefautJeremy} / {100 - d.settings.partDefautJeremy}, modifiable dans Réglages). Les notes de frais dues ne dépendent pas de la période.
      </p>
    </Page>
  )
}

function Row({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', strong ? 'font-semibold' : 'text-muted')}>
      <span>{label}</span>
      <span className={cx('tnum', strong && 'text-txt', accent && 'text-accent font-semibold')}>{eur(value)}</span>
    </div>
  )
}
