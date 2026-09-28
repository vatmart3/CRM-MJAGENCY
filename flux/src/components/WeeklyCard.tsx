import { CalendarDays, RefreshCw, Sparkles } from 'lucide-react'
import { Rapport } from '../types'
import { useWeeklyReport } from '../lib/weekly'
import { isoWeekLabel } from '../lib/finance'
import { ago, cap } from '../lib/dates'
import { cx } from '../lib/format'
import { Card, CardHead, Empty, Tag, useReducedMotion } from './ui'

/** Badge de provenance d'un texte : rédigé par l'IA ou calculé dans le navigateur. */
export function SourceTag({ source }: { source: Rapport['source'] }) {
  return source === 'ia' ? (
    <Tag tone="accent">
      <Sparkles size={11} />
      IA
    </Tag>
  ) : (
    <Tag>Calcul local</Tag>
  )
}

/** Liste des recommandations, présentée comme une petite liste de tâches. */
export function Recommandations({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-2" aria-label="Recommandations">
      {items.map((r, i) => (
        <li key={i} className="card-2 flex items-start gap-3 px-3.5 py-3 text-sm leading-snug">
          <span aria-hidden className="mt-px w-[18px] h-[18px] rounded-md border-2 border-accent/80 grid place-content-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-pill bg-accent" />
          </span>
          <span className="min-w-0">{r}</span>
        </li>
      ))}
    </ul>
  )
}

/** Carte du tableau de bord : le dernier résumé hebdomadaire et ses actions. */
export function WeeklyCard({ className, delay }: { className?: string; delay?: number }) {
  const { latest, regenerate, busy } = useWeeklyReport()
  const reduced = useReducedMotion()
  const spin = busy && !reduced ? 'animate-spin' : ''

  if (!latest)
    return (
      <Card className={className} delay={delay}>
        <CardHead title="Résumé de la semaine" />
        <Empty
          icon={<CalendarDays size={22} />}
          title={busy ? 'Rédaction du résumé…' : 'Ton premier résumé arrivera lundi prochain'}
          text="Chaque lundi, FLUX résume la semaine écoulée et te propose jusqu’à trois actions concrètes."
          action={
            <button className="btn-primary" onClick={() => void regenerate()} disabled={busy}>
              <RefreshCw size={15} className={spin} />
              Générer maintenant
            </button>
          }
        />
      </Card>
    )

  return (
    <Card className={className} delay={delay}>
      <CardHead title="Résumé de la semaine" sub={cap(isoWeekLabel(latest.semaine))} right={<SourceTag source={latest.source} />} />
      <p className={cx('text-[15px] leading-relaxed transition-opacity', busy && 'opacity-50')} aria-live="polite">
        {latest.resume}
      </p>
      {latest.recommandations.length > 0 && (
        <div className={cx('mt-4 transition-opacity', busy && 'opacity-50')}>
          <p className="label mb-2">À faire cette semaine</p>
          <Recommandations items={latest.recommandations} />
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted truncate">Rédigé {ago(latest.updatedAt ?? latest.createdAt)}</span>
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void regenerate()} disabled={busy} aria-label="Régénérer le résumé de la semaine">
          <RefreshCw size={14} className={spin} />
          {busy ? 'Rédaction…' : 'Régénérer'}
        </button>
      </div>
    </Card>
  )
}

export default WeeklyCard
