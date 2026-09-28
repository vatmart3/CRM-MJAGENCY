import { ReactNode, useMemo, useState } from 'react'
import {
  AlertTriangle, BookOpen, Database, Download, FileSpreadsheet, FileText, FolderKanban, History, Info, Landmark, Loader2, Receipt, Repeat, Sparkles, Tags,
  Users, Wallet,
} from 'lucide-react'
import { PeriodFilter, PeriodKind, useFlux } from '../store'
import { periodLabel, rangeFor, shiftPeriod, synthese, tauxTotal } from '../lib/finance'
import { useFluxData } from '../lib/alerts'
import { addMonths, cap, endOfMonth, monthLabel, startOfMonth, today } from '../lib/dates'
import { cx, pct, plural } from '../lib/format'
import {
  ExportState, TABLE_LABEL, TABLE_NAMES, TableName, describePeriod, exportAllCSV, exportLivreRecettes, exportRapportMensuel, exportRegistreDepenses,
  exportTableCSV, livreRecettesRows, registreDepensesRows,
} from '../lib/exports'
import { Card, CardHead, Delta, Field, Money, Page, Segmented, Stepper, toast, variation } from '../components/ui'

/** Les données complètes au moment du clic (éléments archivés compris, pour résoudre les noms). */
const snapshot = (): ExportState => useFlux.getState()

/** Lance un export avec état de chargement et notification. */
function useRunner() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<void> | void, title: string, text?: string) => {
    if (busy) return
    setBusy(key)
    // Laisse le temps au bouton d'afficher son indicateur avant la génération.
    await new Promise((r) => setTimeout(r, 40))
    try {
      await fn()
      toast({ title, text, tone: 'success' })
    } catch (e) {
      console.error(e)
      toast({ title: 'Export impossible', text: e instanceof Error ? e.message : 'Une erreur inattendue est survenue. Réessaie dans un instant.', tone: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

function RunButton({ busy, onClick, icon, children, variant = 'primary', disabled, className }: {
  busy: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; variant?: 'primary' | 'outline' | 'ghost'; disabled?: boolean; className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className={cx(variant === 'primary' ? 'btn-primary' : variant === 'outline' ? 'btn-outline' : 'btn-ghost', className)}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

export default function Exports() {
  return (
    <Page title="Exports & rapports" subtitle="Rapport mensuel, registres de la micro-entreprise et sauvegarde complète de tes données.">
      <div className="space-y-4 md:space-y-5">
        <RapportCard />
        <div className="grid gap-4 md:gap-5 md:grid-cols-2">
          <RegistreCard kind="recettes" delay={80} />
          <RegistreCard kind="depenses" delay={140} />
        </div>
        <DonneesCard />
      </div>
    </Page>
  )
}

// ── Rapport mensuel ─────────────────────────────────────────────────────────

const defaultMonth = () => {
  const t = today()
  // En début de mois, c'est le mois qui vient de se terminer qui intéresse.
  return Number(t.slice(8, 10)) <= 10 ? addMonths(startOfMonth(t), -1) : startOfMonth(t)
}

function RapportCard() {
  const d = useFluxData()
  const { busy, run } = useRunner()
  const [month, setMonth] = useState(defaultMonth)
  const current = startOfMonth(today())
  const prevMonth = addMonths(month, -1)
  const prevNom = monthLabel(prevMonth).split(' ')[0]!
  const k = useMemo(() => ({ cur: synthese(d, month, endOfMonth(month)), prev: synthese(d, prevMonth, endOfMonth(prevMonth)) }), [d, month, prevMonth])
  const empty = k.cur.ca === 0 && k.cur.depenses === 0
  const label = cap(monthLabel(month))

  return (
    <div className="card fade-up relative overflow-hidden hero-grad p-5 md:p-7">
      <div className="absolute inset-0 mosaic pointer-events-none" />
      <div className="relative grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center">
        <div className="min-w-0">
          <span className="pill bg-accent text-ink">
            <Sparkles size={12} /> Rapport mensuel
          </span>
          <h2 className="text-2xl md:text-[30px] font-semibold tracking-tight mt-4 leading-tight">Ton mois, en un PDF prêt à partager.</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed max-w-md">
            Synthèse, évolution sur 12 mois, dépenses par catégorie, provision URSSAF, factures à encaisser et seuils. Le rapport est généré automatiquement à
            partir de tes données, rien à remplir.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <Stepper label={label} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => month < current && setMonth(addMonths(month, 1))} />
            <RunButton
              busy={busy === 'rapport'}
              icon={<Download size={16} />}
              onClick={() => run('rapport', () => exportRapportMensuel(snapshot(), month), 'Rapport mensuel téléchargé', `${label} · PDF`)}
            >
              Télécharger le PDF
            </RunButton>
          </div>
          {month === current && <p className="text-xs text-muted mt-3">Mois en cours : les chiffres sont arrêtés à aujourd’hui.</p>}
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2.5 md:gap-3">
            <Figure label="CA encaissé" value={k.cur.ca} foot={<Trend cur={k.cur.ca} prev={k.prev.ca} prevNom={prevNom} />} />
            <Figure label="Dépenses" value={k.cur.depenses} foot={<Trend cur={k.cur.depenses} prev={k.prev.depenses} prevNom={prevNom} invert />} />
            <Figure label="Cotisations URSSAF" value={k.cur.cotisations} foot={<span className="block text-xs text-muted leading-snug">Estimées à {pct(tauxTotal(d.settings), 1)} du CA</span>} />
            <Figure
              hero
              label="Ce que tu gardes vraiment"
              value={k.cur.resultat}
              foot={<Trend cur={k.cur.resultat} prev={k.prev.resultat} prevNom={prevNom} />}
            />
          </div>
          {empty && (
            <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
              <Info size={13} className="shrink-0" /> Aucune recette ni dépense en {monthLabel(month)} : le rapport sera généré avec des sections vides.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Variation vs le mois précédent ; « Stable » quand rien ne bouge, pas de pourcentage quand le mois précédent est à zéro. */
function Trend({ cur, prev, prevNom, invert }: { cur: number; prev: number; prevNom: string; invert?: boolean }) {
  if (cur === prev) return <span className="text-xs text-muted">Stable vs {prevNom}</span>
  const v = prev !== 0 ? (cur - prev) / Math.abs(prev) : variation(cur, prev)
  if (v === null) return <span className="text-xs text-muted">Rien en {prevNom}</span>
  return <Delta value={v} suffix={`vs ${prevNom}`} invert={invert} />
}

function Figure({ label, value, foot, hero }: { label: string; value: number; foot: ReactNode; hero?: boolean }) {
  return (
    <div className={cx('rounded-2xl p-3.5 md:p-4 min-w-0', hero ? 'bg-accent/12 ring-1 ring-accent/30' : 'bg-card2/80')}>
      <p className={cx('text-[11px] font-medium leading-tight', hero ? 'text-accent' : 'text-muted')}>{label}</p>
      <Money value={value} className={cx('big block mt-2 text-[22px] md:text-[26px] truncate', value < 0 && 'text-danger')} />
      <div className="mt-2 min-h-[18px] [&>span]:flex-wrap [&>span]:gap-x-1.5 [&>span>span]:whitespace-nowrap">{foot}</div>
    </div>
  )
}

// ── Livre des recettes / registre des dépenses ─────────────────────────────

const KIND_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: 'annee', label: 'Année' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'mois', label: 'Mois' },
  { value: 'perso', label: 'Personnalisé' },
]

function RegistreCard({ kind, delay }: { kind: 'recettes' | 'depenses'; delay: number }) {
  const d = useFluxData()
  const { busy, run } = useRunner()
  const [period, setPeriod] = useState<PeriodFilter>(() => rangeFor('annee', today()))
  const invalid = !period.from || !period.to || period.from > period.to
  const isLivre = kind === 'recettes'

  const stats = useMemo(() => {
    if (invalid) return { nb: 0, total: 0, manquants: 0 }
    if (isLivre) {
      const rows = livreRecettesRows(d, period.from, period.to)
      return { nb: rows.length, total: rows.reduce((a, r) => a + r.montant, 0), manquants: 0 }
    }
    const rows = registreDepensesRows(d, period.from, period.to)
    return { nb: rows.length, total: rows.reduce((a, r) => a + r.montant, 0), manquants: rows.filter((r) => !r.justificatif).length }
  }, [d, period, invalid, isLivre])

  const setKind = (k: PeriodKind) => {
    if (k === 'perso') setPeriod({ ...period, kind: 'perso' })
    else setPeriod(rangeFor(k, period.kind === 'perso' ? period.from || today() : period.ref))
  }

  const title = isLivre ? 'Livre des recettes' : 'Registre des dépenses'
  const exportFn = isLivre ? exportLivreRecettes : exportRegistreDepenses
  const doExport = (format: 'pdf' | 'csv') =>
    run(format, () => exportFn(snapshot(), period.from, period.to, format), `${title} téléchargé`, `${describePeriod(period.from, period.to).label} · ${format.toUpperCase()}`)

  return (
    <Card delay={delay} className="flex flex-col">
      <CardHead
        title={
          <span className="inline-flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-card2 grid place-content-center text-accent shrink-0">
              {isLivre ? <BookOpen size={16} /> : <Receipt size={16} />}
            </span>
            {title}
          </span>
        }
        sub={isLivre ? 'Registre obligatoire des encaissements' : 'Toutes les dépenses, avec sous-totaux par catégorie'}
      />

      <div className="space-y-3">
        <Segmented size="sm" value={period.kind} onChange={setKind} options={KIND_OPTIONS} />
        {period.kind === 'perso' ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Du">
              <input type="date" className="input" value={period.from} max={period.to || undefined} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
            </Field>
            <Field label="Au">
              <input type="date" className="input" value={period.to} min={period.from || undefined} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
            </Field>
          </div>
        ) : (
          <Stepper label={periodLabel(period)} onPrev={() => setPeriod(shiftPeriod(period, -1))} onNext={() => setPeriod(shiftPeriod(period, 1))} />
        )}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="label">{isLivre ? 'Total encaissé' : 'Total TTC'}</p>
          <Money value={invalid ? 0 : stats.total} className="big block text-[30px] md:text-[34px] mt-1.5" />
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold tnum">
            {invalid ? '—' : stats.nb ? plural(stats.nb, isLivre ? 'encaissement' : 'dépense') : isLivre ? 'Aucun encaissement' : 'Aucune dépense'}
          </p>
          {!isLivre && !invalid && stats.nb > 0 && (
            <p className={cx('text-xs mt-0.5', stats.manquants ? 'text-warn' : 'text-muted')}>
              {stats.manquants ? `${plural(stats.manquants, 'justificatif manquant', 'justificatifs manquants')}` : 'Tous les justificatifs sont là'}
            </p>
          )}
        </div>
      </div>

      {invalid ? (
        <p className="mt-4 text-xs text-danger flex items-center gap-1.5">
          <AlertTriangle size={13} /> La date de début doit précéder la date de fin.
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted leading-relaxed flex gap-1.5">
          <Info size={13} className="shrink-0 mt-[1px]" />
          {isLivre
            ? 'Chronologique, à la date d’encaissement : identité du client, nature de la prestation, montant, mode de règlement et référence de la facture.'
            : 'Chronologique : fournisseur, catégorie, montant TTC, mode de paiement, payeur, justificatif et projet.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mt-auto pt-5">
        <RunButton busy={busy === 'pdf'} disabled={invalid || !!busy} icon={<FileText size={16} />} onClick={() => doExport('pdf')}>
          PDF
        </RunButton>
        <RunButton busy={busy === 'csv'} disabled={invalid || !!busy} variant="outline" icon={<FileSpreadsheet size={16} />} onClick={() => doExport('csv')}>
          CSV
        </RunButton>
      </div>
    </Card>
  )
}

// ── Toutes les données ──────────────────────────────────────────────────────

const TABLE_ICON: Record<TableName, ReactNode> = {
  clients: <Users size={16} />,
  projets: <FolderKanban size={16} />,
  recettes: <Wallet size={16} />,
  depenses: <Receipt size={16} />,
  abonnements: <Repeat size={16} />,
  declarations: <Landmark size={16} />,
  categories: <Tags size={16} />,
  journal: <History size={16} />,
}

const TABLE_DONE: Record<TableName, string> = {
  clients: 'Clients exportés',
  projets: 'Projets exportés',
  recettes: 'Recettes exportées',
  depenses: 'Dépenses exportées',
  abonnements: 'Abonnements exportés',
  declarations: 'Déclarations URSSAF exportées',
  categories: 'Catégories exportées',
  journal: 'Journal exporté',
}

function DonneesCard() {
  const s = useFlux()
  const { busy, run } = useRunner()
  const counts: Record<TableName, number> = {
    clients: s.clients.length,
    projets: s.projets.length,
    recettes: s.recettes.length,
    depenses: s.depenses.length,
    abonnements: s.abonnements.length,
    declarations: s.declarations.length,
    categories: s.categories.length,
    journal: s.journal.length,
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <Card delay={200}>
      <CardHead
        title={
          <span className="inline-flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-card2 grid place-content-center text-accent shrink-0">
              <Database size={16} />
            </span>
            Toutes les données (CSV)
          </span>
        }
        sub="Pour Excel ou ton comptable : lignes archivées comprises, avec l’auteur et la date de chaque saisie."
        right={
          <RunButton
            busy={busy === 'all'}
            disabled={!!busy}
            className="hidden sm:inline-flex"
            icon={<Download size={16} />}
            onClick={() => run('all', () => exportAllCSV(snapshot()), 'Toutes les données exportées', `${TABLE_NAMES.length} fichiers CSV · ${plural(total, 'ligne')}`)}
          >
            Tout exporter
          </RunButton>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABLE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            disabled={!!busy}
            onClick={() => run(name, () => exportTableCSV(name, snapshot()), TABLE_DONE[name], `${plural(counts[name], 'ligne')} · CSV`)}
            className="card-2 flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-line/60 active:scale-[0.98] disabled:opacity-50 min-w-0"
          >
            <span className="text-accent shrink-0">{busy === name ? <Loader2 size={16} className="animate-spin" /> : TABLE_ICON[name]}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">{TABLE_LABEL[name]}</span>
              <span className="block text-[11px] text-muted tnum">{plural(counts[name], 'ligne')}</span>
            </span>
          </button>
        ))}
      </div>
      <RunButton
        busy={busy === 'all'}
        disabled={!!busy}
        className="w-full mt-3 sm:hidden"
        icon={<Download size={16} />}
        onClick={() => run('all', () => exportAllCSV(snapshot()), 'Toutes les données exportées', `${TABLE_NAMES.length} fichiers CSV · ${plural(total, 'ligne')}`)}
      >
        Tout exporter
      </RunButton>
      <p className="text-[11px] text-muted mt-3">
        Séparateur point-virgule, montants à virgule et dates JJ/MM/AAAA : les fichiers s’ouvrent directement dans Excel.
      </p>
    </Card>
  )
}
