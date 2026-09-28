import { useMemo, useState } from 'react'
import { BookOpen, Check, ExternalLink, FileDown, Landmark, Loader2, PiggyBank, Undo2 } from 'lucide-react'
import { useFlux, useIsAdmin } from '../store'
import { DeclarationStatut } from '../types'
import { aMettreDeCote, clientName, isEncaissee, provisionUrssaf, tauxTotal, tresorerie, UrssafPeriod, urssafPeriods } from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { diffDays, endOfYear, fdate, startOfYear, today } from '../lib/dates'
import { cx, eur, pct, round2 } from '../lib/format'
import { exportLivreRecettes, exportRegistreDepenses } from '../lib/exports'
import { Card, CardHead, CountUp, Empty, Money, Notice, Page, Stepper, Tag, toast } from '../components/ui'

const statutTone = { 'À faire': 'warn', Déclarée: 'accent', Payée: 'muted', 'En cours': 'muted' } as const

export default function Urssaf() {
  const d = useFluxData()
  const s = useFlux()
  const isAdmin = useIsAdmin()
  const t = today()
  const periods = useMemo(() => urssafPeriods(d, t), [d, t])
  const current = periods.find((p) => p.statut === 'En cours')
  const next = [...periods].reverse().find((p) => p.statut === 'À faire' || p.statut === 'Déclarée')
  const provision = provisionUrssaf(d, t)
  const taux = tauxTotal(d.settings)
  const treso = tresorerie(d, t)
  const derniere = [...d.recettes].filter(isEncaissee).sort((a, b) => b.dateEncaissement.localeCompare(a.dateEncaissement))[0]

  const setStatut = (p: UrssafPeriod, statut: DeclarationStatut) => {
    const base = {
      periode: p.label,
      debut: p.debut,
      fin: p.fin,
      caDeclare: p.declaration && p.declaration.statut !== 'À faire' ? p.declaration.caDeclare : p.ca,
      cotisations: p.declaration && p.declaration.statut !== 'À faire' ? p.declaration.cotisations : p.detail.total,
      dateLimite: p.dateLimite,
      statut,
      declareeLe: statut === 'À faire' ? '' : p.declaration?.declareeLe || t,
      payeeLe: statut === 'Payée' ? p.declaration?.payeeLe || t : '',
    }
    const details = `${p.label} : ${statut}${statut !== 'À faire' ? ` (CA ${eur(base.caDeclare)}, cotisations ${eur(base.cotisations)})` : ''}`
    if (p.declaration) s.update('declarations', p.key, base, { action: 'déclaration', details })
    else {
      s.create('declarations', { id: p.key, ...base }, { silent: true })
      s.log({ action: 'déclaration', entity: 'declarations', entityId: p.key, label: `Période ${p.label}`, details })
    }
    toast({ title: statut === 'Payée' ? 'Cotisations payées' : statut === 'Déclarée' ? 'Période déclarée' : 'Statut remis à « À faire »', text: details, tone: 'success' })
  }

  return (
    <Page title="URSSAF & obligations" subtitle={`Déclaration ${d.settings.periodicite} · cotisations sur le CA encaissé · ${pct(taux, 1)} au total`}>
      <div className="grid lg:grid-cols-3 gap-3 md:gap-4 mb-4">
        <div className="card lg:col-span-2 p-6 hero-grad relative overflow-hidden fade-up">
          <div className="absolute inset-0 mosaic pointer-events-none" />
          <div className="relative grid sm:grid-cols-2 gap-6">
            <div>
              <span className="pill bg-accent text-ink"><PiggyBank size={12} /> À garder de côté</span>
              <Money value={provision} className="big text-[44px] block mt-4" />
              <p className="text-sm text-muted mt-2">Cotisations calculées et pas encore payées. La trésorerie disponible ({eur(treso.disponible)}) les déduit déjà.</p>
            </div>
            <div className="space-y-3">
              {derniere && (
                <div className="card-2 p-4">
                  <p className="text-xs text-muted">Dernière recette encaissée</p>
                  <p className="text-sm mt-1">
                    {eur(derniere.montant)} de {clientName(d.clients.find((c) => c.id === derniere.clientId))} le {fdate(derniere.dateEncaissement)}
                  </p>
                  <p className="text-sm font-semibold text-accent mt-1">→ Mets {eur(aMettreDeCote(derniere.montant, d.settings))} de côté</p>
                </div>
              )}
              {next ? (
                <div className={cx('card-2 p-4', diffDays(next.dateLimite, t) <= 7 && '!bg-warn/15')}>
                  <p className="text-xs text-muted">Prochaine échéance</p>
                  <p className="text-sm font-semibold mt-1">{next.statut === 'Déclarée' ? 'Payer' : 'Déclarer'} {next.label}</p>
                  <p className="text-sm">
                    avant le {fdate(next.dateLimite)} ·{' '}
                    <span className={cx('font-semibold', diffDays(next.dateLimite, t) < 0 ? 'text-danger' : diffDays(next.dateLimite, t) <= 7 && 'text-warn')}>
                      {diffDays(next.dateLimite, t) < 0 ? `dépassée de ${-diffDays(next.dateLimite, t)} j` : `J-${diffDays(next.dateLimite, t)}`}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="card-2 p-4">
                  <p className="text-xs text-muted">Prochaine échéance</p>
                  <p className="text-sm mt-1">Rien à déclarer pour l’instant.</p>
                </div>
              )}
              <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noreferrer" className="btn-outline w-full">
                Déclarer sur le site de l’URSSAF <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
        <Card>
          <CardHead title="Période en cours" sub={current?.label} />
          {current ? (
            <>
              <p className="text-xs text-muted">CA encaissé</p>
              <p className="big text-[30px]"><CountUp value={current.ca} /></p>
              <div className="mt-4 space-y-2 text-sm">
                <Line label={`Cotisations sociales (${pct(d.settings.tauxCotisations, 1)})`} value={current.detail.sociales} />
                {d.settings.vlActif && <Line label={`Versement libératoire (${pct(d.settings.tauxVL, 1)})`} value={current.detail.vl} />}
                <Line label={`Formation CFP (${pct(d.settings.tauxCFP, 2)})`} value={current.detail.cfp} />
                <div className="border-t border-line/60 pt-2">
                  <Line label="Total estimé" value={current.detail.total} strong />
                </div>
              </div>
              <p className="text-xs text-muted mt-3">À déclarer avant le {fdate(current.dateLimite)}.</p>
            </>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Card>
      </div>

      {!isAdmin && <div className="mb-4"><Notice>Seul Jérémy peut changer le statut des déclarations.</Notice></div>}

      <Card className="!p-0 overflow-hidden mb-4">
        <div className="px-5 pt-5">
          <CardHead title="Déclarations" sub="Calcul automatique par période, figé au moment de la déclaration." />
        </div>
        {periods.length === 0 ? (
          <Empty icon={<Landmark size={22} />} title="Aucune période" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th pl-5">Période</th>
                  <th className="th text-right">CA encaissé</th>
                  <th className="th text-right">Cotisations</th>
                  <th className="th">Date limite</th>
                  <th className="th">Statut</th>
                  <th className="th pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.key} className="row">
                    <td className="td pl-5">
                      <span className="font-medium">{p.label}</span>
                      <span className="block text-[11px] text-muted">{p.nbRecettes} encaissement{p.nbRecettes > 1 ? 's' : ''}</span>
                    </td>
                    <td className="td text-right tnum">{eur(p.ca)}</td>
                    <td className="td text-right tnum font-semibold">{eur(p.detail.total)}</td>
                    <td className="td whitespace-nowrap">
                      {fdate(p.dateLimite)}
                      {p.statut === 'À faire' && diffDays(p.dateLimite, t) < 0 && <span className="block text-[11px] text-danger">dépassée</span>}
                    </td>
                    <td className="td">
                      <Tag tone={statutTone[p.statut]}>{p.statut}</Tag>
                      {p.declaration?.payeeLe && <span className="block text-[11px] text-muted mt-1">le {fdate(p.declaration.payeeLe)}</span>}
                    </td>
                    <td className="td pr-5 text-right whitespace-nowrap">
                      {isAdmin && p.statut === 'À faire' && (
                        <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={() => setStatut(p, 'Déclarée')}><Check size={13} /> Déclarée</button>
                      )}
                      {isAdmin && p.statut === 'Déclarée' && (
                        <span className="inline-flex gap-1.5">
                          <button className="btn-icon !w-8 !h-8" title="Revenir à « À faire »" onClick={() => setStatut(p, 'À faire')}><Undo2 size={14} /></button>
                          <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={() => setStatut(p, 'Payée')}><Check size={13} /> Payée</button>
                        </span>
                      )}
                      {isAdmin && p.statut === 'Payée' && (
                        <button className="btn-icon !w-8 !h-8" title="Annuler le paiement" onClick={() => setStatut(p, 'Déclarée')}><Undo2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Livre />
    </Page>
  )
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', strong ? 'font-semibold' : 'text-muted')}>
      <span>{label}</span>
      <span className={cx('tnum', strong && 'text-txt')}>{eur(value)}</span>
    </div>
  )
}

/** Livre des recettes : généré en continu, classé par date d'encaissement. */
function Livre() {
  const d = useFluxData()
  const [year, setYear] = useState(today().slice(0, 4))
  const [busy, setBusy] = useState('')
  const from = startOfYear(year + '-01-01')
  const to = endOfYear(year + '-01-01')
  const rows = d.recettes.filter((r) => isEncaissee(r) && r.dateEncaissement >= from && r.dateEncaissement <= to).sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement) || a.createdAt.localeCompare(b.createdAt))
  const total = round2(rows.reduce((a, r) => a + r.montant, 0))
  const run = (key: string, fn: () => unknown) => async () => {
    setBusy(key)
    try {
      await fn()
      toast({ title: 'Export prêt', tone: 'success' })
    } catch (e) {
      toast({ title: 'Export impossible', text: (e as Error).message, tone: 'error' })
    } finally {
      setBusy('')
    }
  }
  const Btn = ({ k, label, fn }: { k: string; label: string; fn: () => unknown }) => (
    <button className="btn-ghost !py-2 text-xs" disabled={!!busy} onClick={run(k, fn)}>
      {busy === k ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} {label}
    </button>
  )
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 pt-5 flex flex-wrap items-start justify-between gap-3">
        <CardHead title="Livre des recettes" sub="Date d’encaissement, client, nature, montant, règlement, référence de facture — ordre chronologique." />
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Stepper label={year} onPrev={() => setYear(String(Number(year) - 1))} onNext={() => setYear(String(Number(year) + 1))} />
          <Btn k="lpdf" label="PDF" fn={() => exportLivreRecettes(d, from, to, 'pdf')} />
          <Btn k="lcsv" label="CSV" fn={() => exportLivreRecettes(d, from, to, 'csv')} />
          <Btn k="rpdf" label="Registre des dépenses" fn={() => exportRegistreDepenses(d, from, to, 'pdf')} />
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<BookOpen size={22} />} title={`Aucun encaissement en ${year}`} text="Le livre se remplit tout seul à chaque recette encaissée." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className="th pl-5">Encaissement</th>
                <th className="th">Client</th>
                <th className="th">Nature de la prestation</th>
                <th className="th">Règlement</th>
                <th className="th">Facture</th>
                <th className="th pr-5 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row">
                  <td className="td pl-5 tnum">{fdate(r.dateEncaissement)}</td>
                  <td className="td whitespace-nowrap">{clientName(d.clients.find((c) => c.id === r.clientId))}</td>
                  <td className="td text-muted max-w-[260px] truncate">{r.libelle}</td>
                  <td className="td text-muted">{r.mode}</td>
                  <td className="td text-muted whitespace-nowrap">{r.numeroFacture || '—'}</td>
                  <td className="td pr-5 text-right tnum font-semibold">{eur(r.montant)}</td>
                </tr>
              ))}
              <tr className="row">
                <td className="td pl-5 font-semibold" colSpan={5}>Total {year}</td>
                <td className="td pr-5 text-right tnum font-bold text-accent">{eur(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-3 text-[11px] text-muted border-t border-line/50">Généré le {fdate(today())}. Les recettes archivées n’y figurent pas ; leur trace reste dans le journal.</p>
    </Card>
  )
}
