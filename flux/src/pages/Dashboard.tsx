import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, CalendarClock, Flame, Landmark, Mail, MoreVertical, PiggyBank, Receipt, ScanLine, Send, Sparkles, Star, Target, Wallet,
} from 'lucide-react'
import { useFlux, useIsAdmin } from '../store'
import { USERS } from '../types'
import {
  aEncaisser, clientName, depensesParCategorie, douzeMois, echeancesAConfirmer, echeancesAVenir, joursDeRetard, previousPeriod, provisionUrssaf,
  serieJours, seuils, synthese, tauxTotal, topClients, tresorerie, urssafPeriods,
} from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { cap, diffDays, endOfMonth, endOfYear, fdate, fdateShort, monthLabel, MOIS, startOfMonth, startOfYear, today, addMonths } from '../lib/dates'
import { cx, eur, eur0, eurK, pct } from '../lib/format'
import { confirmerPrelevement, marquerEncaissee } from '../lib/actions'
import { useThemeColors } from '../lib/theme'
import { Avatar, Card, CardHead, CountUp, Delta, Empty, Menu, Money, Notice, variation } from '../components/ui'
import { Donut, HalfGauge, Legend, Sparkbars, ThresholdBar, TwelveMonths } from '../components/charts'
import { PeriodPicker } from '../components/PeriodPicker'
import { openEditor } from '../components/editors'
import { openRelance } from '../components/Relance'
import { WeeklyCard } from '../components/WeeklyCard'

const LiquidSphere = lazy(() => import('../components/LiquidSphere'))

export default function Dashboard() {
  const d = useFluxData()
  const period = useFlux((s) => s.period)
  const setPeriod = useFlux((s) => s.setPeriod)
  const me = USERS[useFlux((s) => s.currentUser)]
  const stats = useFlux((s) => s.stats)
  const isAdmin = useIsAdmin()
  const c = useThemeColors()
  const t = today()

  const k = useMemo(() => {
    const cur = synthese(d, period.from, period.to)
    const prevP = previousPeriod(period)
    const prev = synthese(d, prevP.from, prevP.to)
    const treso = tresorerie(d, t)
    const months = douzeMois(d, t)
    const mois = synthese(d, startOfMonth(t), endOfMonth(t))
    const moisPrec = synthese(d, addMonths(startOfMonth(t), -1), endOfMonth(addMonths(startOfMonth(t), -1)))
    const annee = synthese(d, startOfYear(t), endOfYear(t))
    return { cur, prev, treso, months, mois, moisPrec, annee }
  }, [d, period, t])

  const hasData = d.recettes.length > 0 || d.depenses.length > 0
  const suffix = { mois: 'vs mois dernier', trimestre: 'vs trim. précédent', annee: 'vs an dernier', perso: 'vs avant' }[period.kind]
  const heure = new Date().getHours()

  return (
    <div className="space-y-4 md:space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3 fade-up">
        <div>
          <p className="text-sm text-muted">{heure < 18 ? 'Bonjour' : 'Bonsoir'} {me.prenom} 👋</p>
          <h1 className="text-[26px] md:text-[28px] font-semibold tracking-tight">Vue d’ensemble</h1>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <Motivation mois={k.mois.ca} moisPrec={k.moisPrec.ca} objectif={d.settings.objectifMensuel} />

      {!hasData && <Welcome isAdmin={isAdmin} />}
      {hasData && isAdmin && !d.settings.tauxVerifies && (
        <Notice tone="warn" action={<Link to="/reglages" className="text-xs font-semibold text-warn whitespace-nowrap">Vérifier</Link>}>
          Les taux URSSAF ({pct(tauxTotal(d.settings), 1)}) et les seuils sont des valeurs indicatives : confirme-les dans Réglages.
        </Notice>
      )}

      {/* 4 chiffres clés */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <Kpi label="CA encaissé" value={k.cur.ca} delta={<Delta value={variation(k.cur.ca, k.prev.ca)} suffix={suffix} />} visual={<Sparkbars values={k.months.slice(-7).map((m) => m.recettes)} />} icon={<ArrowDownLeft size={15} />} delay={0} />
        <Kpi label="Dépenses" value={k.cur.depenses} delta={<Delta value={variation(k.cur.depenses, k.prev.depenses)} suffix={suffix} invert />} visual={<Sparkbars tone="expense" values={k.months.slice(-7).map((m) => m.depenses)} />} icon={<ArrowUpRight size={15} />} delay={60} />
        <Kpi
          label="Résultat net estimé"
          value={k.cur.resultat}
          delta={<span className="text-xs text-muted">après {eur0(k.cur.cotisations)} de cotisations</span>}
          icon={<PiggyBank size={15} />}
          delay={120}
          negative={k.cur.resultat < 0}
        />
        <Kpi
          label="Trésorerie disponible"
          value={k.treso.disponible}
          delta={<span className="text-xs text-muted">solde estimé {eur0(k.treso.solde)}</span>}
          icon={<Wallet size={15} />}
          delay={180}
          negative={k.treso.disponible < 0}
          to="/urssaf"
        />
      </div>

      {/* Héros + objectif */}
      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <Hero mois={k.mois} annee={k.annee} treso={k.treso} />
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 md:gap-4 content-start">
          <SmallStat
            icon={<Landmark size={15} />}
            label="Provision URSSAF"
            value={provisionUrssaf(d, t)}
            sub={`${pct(tauxTotal(d.settings), 1)} du CA encaissé`}
            to="/urssaf"
          />
          <SmallStat icon={<Receipt size={15} />} label="À encaisser" value={aEncaisser(d.recettes).reduce((a, x) => a + x.r.montant, 0)} sub={`${aEncaisser(d.recettes).length} facture(s)`} to="/recettes?statut=a-encaisser" />
          <Objectif value={k.mois.ca} objectif={d.settings.objectifMensuel} />
        </div>
      </div>

      {/* Graphique 12 mois + camembert */}
      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <Card className="lg:col-span-2" delay={80}>
          <CardHead
            title="Recettes et dépenses"
            sub="12 derniers mois · résultat après cotisations"
            right={<Legend items={[{ label: 'Recettes', color: c.accent }, { label: 'Dépenses', color: c.expense }, { label: 'Résultat', color: c.txt, line: true }]} />}
          />
          <div className="relative">
            <TwelveMonths data={k.months} />
            {!hasData && <p className="absolute inset-0 grid place-content-center text-sm text-muted">Tes 12 prochains mois se dessineront ici.</p>}
          </div>
        </Card>
        <Categories from={period.from} to={period.to} />
      </div>

      {/* Seuils, à encaisser, échéances */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <Seuils />
        <AEncaisser />
        <Echeances />
      </div>

      {/* Clients, assistant, résumé */}
      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <TopClients from={period.from} to={period.to} />
        <AssistantCard />
      </div>
      <div className="grid lg:grid-cols-3 gap-3 md:gap-4">
        <div className="lg:col-span-2">
          <WeeklyCard />
        </div>
        <Streak depuis={stats.sansManquantDepuis} best={stats.meilleureSerie} />
      </div>
    </div>
  )
}

// ── Cartes ──────────────────────────────────────────────────────────────────

function Kpi({ label, value, delta, visual, icon, delay, negative, to }: {
  label: string; value: number; delta: React.ReactNode; visual?: React.ReactNode; icon: React.ReactNode; delay: number; negative?: boolean; to?: string
}) {
  const nav = useNavigate()
  return (
    <Card delay={delay} className="!p-4 md:!p-5 flex flex-col justify-between min-h-[138px]" onClick={to ? () => nav(to) : undefined}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] md:text-sm font-medium">{label}</span>
        <span className="w-7 h-7 rounded-pill bg-card2 text-muted grid place-content-center shrink-0">{icon}</span>
      </div>
      <div className="flex items-end justify-between gap-2 mt-3">
        <Money value={value} cents={false} className={cx('big text-[24px] md:text-[30px]', negative && 'text-danger')} />
        {visual && <span className="hidden sm:block xl:hidden 2xl:block">{visual}</span>}
      </div>
      <div className="mt-2">{delta}</div>
    </Card>
  )
}

function SmallStat({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: number; sub: string; to: string }) {
  const nav = useNavigate()
  return (
    <Card className="!p-4" onClick={() => nav(to)} delay={120}>
      <span className="w-8 h-8 rounded-xl bg-accent text-ink grid place-content-center mb-3">{icon}</span>
      <p className="text-xs text-muted">{label}</p>
      <Money value={value} cents={false} className="text-xl font-bold tracking-tight" />
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </Card>
  )
}

function Hero({ mois, annee, treso }: { mois: ReturnType<typeof synthese>; annee: ReturnType<typeof synthese>; treso: ReturnType<typeof tresorerie> }) {
  const t = today()
  // Niveau de la sphère : trésorerie disponible rapportée à trois mois de dépenses et de cotisations.
  const d = useFluxData()
  const reference = Math.max(1, ...douzeMois(d, t).slice(-3).map((m) => m.depenses + m.cotisations), d.settings.objectifMensuel * 0.5)
  const level = treso.disponible <= 0 ? 0.04 : Math.min(0.82, 0.08 + treso.disponible / (reference * 4))
  return (
    <div className="card lg:col-span-2 fade-up relative overflow-hidden hero-grad p-5 md:p-7 min-h-[300px]">
      <div className="absolute inset-0 mosaic pointer-events-none" />
      <div className="relative grid sm:grid-cols-[1fr_auto] gap-4 items-center h-full">
        <div className="min-w-0">
          <span className="pill bg-accent text-ink">
            <Sparkles size={12} /> Ce que tu gardes vraiment
          </span>
          <div className="mt-5">
            <p className="text-sm text-muted">{cap(monthLabel(t))}</p>
            <Money value={mois.resultat} className={cx('big text-[44px] md:text-[56px]', mois.resultat < 0 && 'text-danger')} />
          </div>
          <p className="text-[12.5px] text-muted mt-2 leading-relaxed tnum">
            {eur0(mois.ca)} encaissés − {eur0(mois.cotisations)} d’URSSAF − {eur0(mois.depenses)} de dépenses
          </p>
          <div className="mt-5 flex items-end gap-6">
            <div>
              <p className="text-xs text-muted">Depuis janvier</p>
              <Money value={annee.resultat} cents={false} className="text-2xl font-bold tracking-tight" />
            </div>
            <div className="h-10 w-px bg-line" />
            <div>
              <p className="text-xs text-muted">Trésorerie disponible</p>
              <Money value={treso.disponible} cents={false} className="text-2xl font-bold tracking-tight" />
            </div>
          </div>
        </div>
        <div className="mx-auto flex flex-col items-center">
          <div className="relative w-[200px] h-[200px] md:w-[220px] md:h-[220px]">
            <Suspense fallback={<div className="w-full h-full rounded-pill bg-card2/60" />}>
              <LiquidSphere level={level} label={`Trésorerie disponible : ${eur0(treso.disponible)}`} />
            </Suspense>
          </div>
          <span className="mt-1 text-[11px] text-muted">Niveau de trésorerie · {eurK(treso.disponible)}</span>
        </div>
      </div>
    </div>
  )
}

function Objectif({ value, objectif }: { value: number; objectif: number }) {
  const ratio = objectif > 0 ? value / objectif : 0
  const t = today()
  const jours = diffDays(endOfMonth(t), t)
  return (
    <Card className="col-span-2 !p-5" delay={160}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">Objectif de {MOIS[Number(t.slice(5, 7)) - 1]}</p>
          <p className="big text-[30px] mt-2">
            <CountUp value={Math.round(ratio * 100)} format={(n) => `${Math.round(n)} %`} />
          </p>
          <p className="text-xs text-muted mt-1">Objectif : {eur0(objectif)}</p>
        </div>
        <HalfGauge value={ratio} size={124} stroke={11} />
      </div>
      <p className="text-xs mt-3 text-muted">
        {ratio >= 1 ? (
          <span className="text-accent font-semibold">Objectif atteint, bravo ! +{eur0(value - objectif)}</span>
        ) : (
          <>Encore <b className="text-txt">{eur0(objectif - value)}</b> en {jours} jour{jours > 1 ? 's' : ''}.</>
        )}
      </p>
    </Card>
  )
}

function Motivation({ mois, moisPrec, objectif }: { mois: number; moisPrec: number; objectif: number }) {
  const t = today()
  const nom = cap(MOIS[Number(t.slice(5, 7)) - 1]!)
  const prec = MOIS[Number(addMonths(startOfMonth(t), -1).slice(5, 7)) - 1]
  let msg = ''
  if (objectif > 0 && mois >= objectif) msg = `${nom} a déjà atteint l’objectif de ${eur0(objectif)}. Superbe mois !`
  else if (moisPrec > 0 && mois > moisPrec) msg = `${nom} dépasse déjà ${prec} de ${eur0(mois - moisPrec)}. Continue comme ça !`
  if (!msg) return null
  return (
    <div className="fade-up flex items-center gap-3 rounded-2xl bg-accent/12 px-4 py-3 text-sm">
      <span className="text-lg">🎉</span>
      <span className="font-medium">{msg}</span>
    </div>
  )
}

function Welcome({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="card fade-up p-6 md:p-8 hero-grad relative overflow-hidden">
      <div className="absolute inset-0 mosaic pointer-events-none" />
      <div className="relative max-w-xl">
        <span className="pill bg-accent text-ink">Bienvenue dans FLUX</span>
        <h2 className="text-2xl md:text-[30px] font-semibold tracking-tight mt-4 leading-tight">Ajoute ta première recette, FLUX s’occupe du reste.</h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Chaque encaissement calcule tout seul ta part URSSAF, ta trésorerie et ta progression vers les seuils. Aucune donnée fictive ici : tout ce que tu vois vient de tes saisies.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <button className="btn-primary" onClick={() => openEditor('recette')}>
            <ArrowDownLeft size={16} /> Ajoute ta première recette
          </button>
          <button className="btn-ghost" onClick={() => openEditor('depense')}>
            <ArrowUpRight size={16} /> Une dépense
          </button>
          <button className="btn-ghost" onClick={() => openEditor('scan')}>
            <ScanLine size={16} /> Scanner un ticket
          </button>
        </div>
        {isAdmin && (
          <p className="text-xs text-muted mt-5">
            Avant de commencer : <Link to="/reglages" className="text-accent font-semibold">vérifie les taux URSSAF, les seuils et le solde de départ du compte pro</Link>.
          </p>
        )}
      </div>
    </div>
  )
}

function Categories({ from, to }: { from: string; to: string }) {
  const d = useFluxData()
  const c = useThemeColors()
  const cats = depensesParCategorie(d.depenses, d.categories, from, to)
  const total = cats.reduce((a, x) => a + x.total, 0)
  const top = cats.slice(0, 5)
  const rest = cats.slice(5).reduce((a, x) => a + x.total, 0)
  const rows = rest > 0 ? [...top, { id: 'autres', nom: 'Autres', total: rest }] : top
  return (
    <Card delay={120}>
      <CardHead title="Dépenses par catégorie" right={<Link to="/depenses" className="btn-icon !w-8 !h-8"><MoreVertical size={16} /></Link>} />
      <Donut data={rows} center={eurK(total)} sub="dépensés" size={176} />
      {rows.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-5">
          {rows.map((r, i) => (
            <div key={r.id} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-muted truncate">
                <span className="w-2 h-2 rounded-pill shrink-0" style={{ background: c.palette[i % c.palette.length] }} />
                <span className="truncate">{r.nom}</span>
              </p>
              <p className="text-sm font-semibold tnum mt-0.5">{eur(r.total)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted text-center mt-4">Aucune dépense sur la période.</p>
      )}
    </Card>
  )
}

function Seuils() {
  const d = useFluxData()
  const list = seuils(d).filter((s) => s.key !== 'tvaMajore')
  const majore = seuils(d).find((s) => s.key === 'tvaMajore')!
  return (
    <Card delay={60}>
      <CardHead title="Seuils de l’année" sub={`CA encaissé ${new Date().getFullYear()} : ${eur0(list[0]?.ca ?? 0)}`} />
      <div className="space-y-5">
        {list.map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-sm font-medium">{s.label}</span>
              <span className={cx('text-sm font-bold tnum whitespace-nowrap', s.niveau === 'critique' ? 'text-danger' : s.niveau === 'attention' ? 'text-warn' : 'text-accent')}>{pct(s.ratio * 100)}</span>
            </div>
            <ThresholdBar ratio={s.ratio} niveau={s.niveau} />
            <p className="text-[11.5px] text-muted mt-1.5">
              {eur0(s.seuil)} · {s.texte}
            </p>
          </div>
        ))}
        {majore.ratio >= 0.8 && <Notice tone={majore.niveau === 'critique' ? 'danger' : 'warn'}>Seuil majoré ({eur0(majore.seuil)}) : {majore.texte}</Notice>}
      </div>
    </Card>
  )
}

function AEncaisser() {
  const d = useFluxData()
  const list = aEncaisser(d.recettes)
  const total = list.reduce((a, x) => a + x.r.montant, 0)
  return (
    <Card delay={120}>
      <CardHead title="À encaisser" sub={list.length ? `${list.length} facture${list.length > 1 ? 's' : ''} · ${eur(total)}` : undefined} right={<Link to="/recettes?statut=a-encaisser" className="text-xs font-semibold text-accent">Tout voir</Link>} />
      {list.length === 0 ? (
        <Empty icon={<Receipt size={22} />} title="Tout est encaissé" text="Les factures en attente et en retard apparaîtront ici." />
      ) : (
        <div className="space-y-1 -mx-2">
          {list.slice(0, 5).map(({ r, statut }) => {
            const client = d.clients.find((c) => c.id === r.clientId)
            return (
              <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-card2/60 transition-colors">
                <Avatar name={clientName(client)} size={32} tone={statut === 'En retard' ? 'warn' : 'muted'} />
                <button className="flex-1 min-w-0 text-left" onClick={() => openEditor('recette', { id: r.id })}>
                  <p className="text-[13px] font-medium truncate">{clientName(client)}</p>
                  <p className={cx('text-[11px]', statut === 'En retard' ? 'text-danger' : 'text-muted')}>
                    {statut === 'En retard' ? `${joursDeRetard(r)} j de retard` : `échéance ${fdateShort(r.dateEcheance)}`}
                  </p>
                </button>
                <span className="text-[13px] font-semibold tnum">{eur0(r.montant)}</span>
                <Menu
                  trigger={<button className="btn-icon !w-8 !h-8" aria-label="Actions"><MoreVertical size={15} /></button>}
                  items={[
                    { label: 'Relancer par e-mail', icon: <Mail size={15} />, onClick: () => openRelance(r.id) },
                    { label: 'Marquer encaissée', icon: <ArrowDownLeft size={15} />, onClick: () => marquerEncaissee(r) },
                  ]}
                />
              </div>
            )
          })}
          {list[0]?.statut === 'En retard' && (
            <button className="btn-outline w-full mt-2 !py-2 text-xs !whitespace-normal" onClick={() => openRelance(list[0]!.r.id)}>
              <Send size={13} className="shrink-0" /> <span className="truncate">Relancer {clientName(d.clients.find((c) => c.id === list[0]!.r.clientId))}</span>
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

function Echeances() {
  const d = useFluxData()
  const t = today()
  const aConfirmer = echeancesAConfirmer(d.abonnements, t)
  const aVenir = echeancesAVenir(d.abonnements, 15, t)
  const next = urssafPeriods(d, t).find((p) => p.statut === 'À faire' || p.statut === 'Déclarée' || p.statut === 'En cours')
  return (
    <Card delay={180}>
      <CardHead title="Prochaines échéances" sub="URSSAF et abonnements à 15 jours" />
      <div className="space-y-3">
        {next && (
          <Link to="/urssaf" className="flex items-center gap-3 card-2 px-3.5 py-3 hover:bg-line/50 transition-colors">
            <span className="w-9 h-9 rounded-xl bg-accent text-ink grid place-content-center shrink-0"><Landmark size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold">URSSAF · {next.label}</span>
              <span className="block text-[11px] text-muted">
                {next.statut === 'En cours' ? 'En cours · ' : ''}avant le {fdate(next.dateLimite)}
              </span>
              <span className="block text-[13px] font-bold tnum mt-0.5">
                {eur0(next.detail.total)} <span className="text-[11px] font-medium text-muted">· J-{Math.max(0, diffDays(next.dateLimite, t))}</span>
              </span>
            </span>
          </Link>
        )}
        {aConfirmer.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-1">
            <span className="w-9 h-9 rounded-xl bg-warn/15 text-warn grid place-content-center shrink-0"><CalendarClock size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium truncate">{a.nom}</span>
              <span className="block text-[11px] text-muted">prélevé le {fdateShort(a.prochainPrelevement)} · {a.montant ? eur(a.montant) : 'montant à compléter'}</span>
            </span>
            <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => (a.montant ? confirmerPrelevement(a) : openEditor('abonnement', { id: a.id }))}>
              {a.montant ? 'Confirmer' : 'Compléter'}
            </button>
          </div>
        ))}
        {aVenir.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-1">
            <span className="w-9 h-9 rounded-xl bg-card2 text-muted grid place-content-center shrink-0"><CalendarClock size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium truncate">{a.nom}</span>
              <span className="block text-[11px] text-muted">le {fdateShort(a.prochainPrelevement)} · {a.frequence}</span>
            </span>
            <span className="text-[13px] font-semibold tnum">{a.montant ? eur(a.montant) : '—'}</span>
          </div>
        ))}
        {!next && !aConfirmer.length && !aVenir.length && <p className="text-sm text-muted">Rien dans les 15 prochains jours.</p>}
      </div>
    </Card>
  )
}

function TopClients({ from, to }: { from: string; to: string }) {
  const d = useFluxData()
  const [sort, setSort] = useState<'total' | 'nb'>('total')
  const list = topClients(d, from, to).sort((a, b) => b[sort] - a[sort]).slice(0, 6)
  return (
    <Card className="lg:col-span-2 !p-0 overflow-hidden" delay={60}>
      <div className="px-5 pt-5">
        <CardHead title="Meilleurs clients" sub="CA encaissé sur la période" right={<Link to="/clients" className="btn-icon !w-8 !h-8"><MoreVertical size={16} /></Link>} />
      </div>
      {list.length === 0 ? (
        <Empty icon={<Star size={22} />} title="Pas encore de client encaissé" text="Tes clients apparaîtront ici, classés par chiffre d’affaires." action={<button className="btn-primary" onClick={() => openEditor('recette')}>Ajoute ta première recette</button>} />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-t border-line/50">
              <th className="th pl-5">Client</th>
              <th className="th text-center cursor-pointer hidden sm:table-cell" onClick={() => setSort('nb')}>Factures {sort === 'nb' ? '↓' : '↕'}</th>
              <th className="th text-right pr-5 cursor-pointer" onClick={() => setSort('total')}>Encaissé {sort === 'total' ? '↓' : '↕'}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="row">
                <td className="td pl-5">
                  <Link to={`/clients?id=${x.id}`} className="flex items-center gap-3">
                    <Avatar name={clientName(x.client)} size={34} tone="muted" />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium truncate">{clientName(x.client)}</span>
                      <span className="block text-[11px] text-muted truncate">{x.client?.email || x.client?.ville || x.client?.activite || '—'}</span>
                    </span>
                  </Link>
                </td>
                <td className="td text-center tnum hidden sm:table-cell">{x.nb}</td>
                <td className="td text-right pr-5 font-semibold tnum">{eur(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function AssistantCard() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const ask = (question: string) => nav(`/assistant?q=${encodeURIComponent(question)}`)
  return (
    <div className="card fade-up relative overflow-hidden hero-grad p-5 flex flex-col">
      <div className="absolute inset-0 mosaic pointer-events-none" />
      <div className="relative flex items-center justify-between">
        <span className="pill bg-card2 text-txt !py-1.5">
          <span className="w-5 h-5 rounded-pill bg-accent text-ink grid place-content-center"><Sparkles size={11} /></span>
          Assistant IA
        </span>
        <Target size={16} className="text-muted" />
      </div>
      <p className="relative text-[26px] font-semibold tracking-tight leading-tight mt-6">Pose une question à tes chiffres</p>
      <p className="relative text-sm text-muted mt-2">« Quel client m’a rapporté le plus cette année ? »</p>
      <form
        className="relative mt-auto pt-6 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(q.trim() || 'Quel client m’a rapporté le plus cette année ?')
        }}
      >
        <input className="input !rounded-pill !bg-bg/40" placeholder="Combien en logiciels ce trimestre ?" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary flex-1">Demander</button>
          <button type="button" onClick={() => ask('Est-ce que je risque de dépasser le seuil de TVA ?')} className="w-11 h-11 rounded-pill bg-accent/20 text-accent grid place-content-center shrink-0" aria-label="Question sur le seuil de TVA" title="Est-ce que je risque de dépasser le seuil de TVA ?">
            <Star size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}

function Streak({ depuis, best }: { depuis: string; best: number }) {
  const d = useFluxData()
  const manquants = d.depenses.filter((x) => !x.justificatif).length
  const jours = serieJours(depuis)
  const nav = useNavigate()
  return (
    <Card delay={120} className="flex flex-col">
      <CardHead title="Série sans justificatif manquant" />
      <div className="flex items-center gap-4">
        <span className={cx('w-14 h-14 rounded-2xl grid place-content-center', manquants ? 'bg-warn/15 text-warn' : 'bg-accent text-ink')}>
          <Flame size={26} />
        </span>
        <div>
          <p className="big text-[34px]">
            <CountUp value={manquants ? 0 : jours} format={(n) => `${Math.round(n)}`} /> <span className="text-base font-semibold text-muted">jour{jours > 1 ? 's' : ''}</span>
          </p>
          <p className="text-xs text-muted">Record : {Math.max(best, manquants ? 0 : jours)} jours</p>
        </div>
      </div>
      <p className="text-sm mt-4 text-muted">
        {d.depenses.length === 0
          ? 'La série démarre à ta première dépense justifiée.'
          : manquants
            ? `${manquants} dépense${manquants > 1 ? 's' : ''} sans pièce : ajoute-les pour relancer la série.`
            : 'Toutes les dépenses ont leur justificatif. Parfait pour la compta.'}
      </p>
      {manquants > 0 && (
        <button className="btn-outline mt-auto !mt-4 w-full" onClick={() => nav('/depenses?justif=manquant')}>
          Compléter les justificatifs
        </button>
      )}
    </Card>
  )
}
