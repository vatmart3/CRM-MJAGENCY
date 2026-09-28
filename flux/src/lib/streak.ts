import { useEffect } from 'react'
import { alive, useFlux } from '../store'
import { today } from './dates'
import { serieJours } from './finance'

/**
 * Série « jours sans justificatif manquant ».
 * Elle démarre le jour où plus aucune dépense ne manque de pièce, et retombe à zéro
 * dès qu'une dépense sans justificatif apparaît (la meilleure série est gardée).
 */
export function useStreakTracker() {
  const depenses = useFlux((s) => s.depenses)
  const stats = useFlux((s) => s.stats)
  const setStats = useFlux((s) => s.setStats)
  useEffect(() => {
    const live = alive(depenses)
    if (!live.length) return
    const missing = live.some((d) => !d.justificatif)
    if (!missing && !stats.sansManquantDepuis) setStats({ sansManquantDepuis: today() })
    else if (missing && stats.sansManquantDepuis)
      setStats({ sansManquantDepuis: '', meilleureSerie: Math.max(stats.meilleureSerie, serieJours(stats.sansManquantDepuis)) })
  }, [depenses, stats.sansManquantDepuis, stats.meilleureSerie, setStats])
}
