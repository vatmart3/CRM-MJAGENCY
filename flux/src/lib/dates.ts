// Dates manipulées en « AAAA-MM-JJ », calculées en heure locale (pas en UTC,
// sinon une saisie à 0 h 30 bascule au jour précédent).

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}
export const today = () => toISO(new Date())
export const nowISO = () => new Date().toISOString()

export const addDays = (s: string, n: number) => {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
/** Ajoute des mois en restant sur le dernier jour si le mois cible est plus court (31/01 + 1 mois = 28/02). */
export const addMonths = (s: string, n: number) => {
  const d = fromISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toISO(d)
}
export const diffDays = (a: string, b: string) => Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000)

export const startOfMonth = (s: string) => s.slice(0, 7) + '-01'
export const endOfMonth = (s: string) => {
  const d = fromISO(s)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
export const startOfYear = (s: string) => s.slice(0, 4) + '-01-01'
export const endOfYear = (s: string) => s.slice(0, 4) + '-12-31'
export const quarterOf = (s: string) => Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1
export const startOfQuarter = (s: string) => `${s.slice(0, 4)}-${pad((quarterOf(s) - 1) * 3 + 1)}-01`
export const endOfQuarter = (s: string) => endOfMonth(`${s.slice(0, 4)}-${pad(quarterOf(s) * 3)}-01`)
/** Lundi de la semaine de la date. */
export const startOfWeek = (s: string) => {
  const d = fromISO(s)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toISO(d)
}

export const inRange = (s: string | undefined, from: string, to: string) => !!s && s >= from && s <= to

/** JJ/MM/AAAA */
export const fdate = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')
/** JJ/MM */
export const fdateShort = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')
export const fdatetime = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${fdate(toISO(d))} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const monthLabel = (s: string) => `${MOIS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
export const monthShort = (s: string) => MOIS_COURT[Number(s.slice(5, 7)) - 1]!
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « il y a 3 min », « hier », « le 12/09/2026 » */
export const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} jours`
  return `le ${fdate(toISO(new Date(iso)))}`
}

/** « dans 3 jours », « aujourd’hui », « il y a 2 jours » */
export const relDays = (s: string, ref = today()) => {
  const d = diffDays(s, ref)
  if (d === 0) return 'aujourd’hui'
  if (d === 1) return 'demain'
  if (d === -1) return 'hier'
  if (d > 0) return `dans ${d} jours`
  return `il y a ${-d} jours`
}
