import { useEffect, useState } from 'react'
import { useFlux } from '../store'

// Les graphiques SVG ont besoin de vraies couleurs (pas de var() dans les attributs) :
// on lit les variables CSS du thème courant et on relit à chaque changement de thème.

const read = (name: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  const [r, g, b] = v.split(/\s+/)
  return `rgb(${r}, ${g}, ${b})`
}
const alpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`)

export interface ThemeColors {
  accent: string
  deep: string
  expense: string
  txt: string
  muted: string
  line: string
  card: string
  card2: string
  warn: string
  danger: string
  /** Teintes pour les catégories : dégradé de l'accent puis neutres. */
  palette: string[]
  alpha: (c: string, a: number) => string
}

const PALETTES = {
  nuit: ['#C4F26A', '#E6F9C2', '#8FD14F', '#5E9E2F', '#3D6B1F', '#A9B89A', '#6E7466', '#D6E8B8', '#4B5046', '#9BE07A'],
  jour: ['#0071E3', '#5AA9F5', '#003F80', '#A8D0FA', '#1D1D1F', '#6E6E73', '#2E8BFF', '#C7C7CC', '#00569E', '#8E8E93'],
}

export function useThemeColors(): ThemeColors {
  const theme = useFlux((s) => s.theme)
  const compute = (): ThemeColors => ({
    accent: read('accent'),
    deep: read('accent-deep'),
    expense: read('expense'),
    txt: read('txt'),
    muted: read('muted'),
    line: read('line'),
    card: read('card'),
    card2: read('card2'),
    warn: read('warn'),
    danger: read('danger'),
    palette: PALETTES[theme],
    alpha,
  })
  const [c, setC] = useState(compute)
  useEffect(() => {
    // Le thème est posé sur <html> juste avant : on relit au prochain cadre.
    const t = requestAnimationFrame(() => setC(compute()))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
  return c
}
