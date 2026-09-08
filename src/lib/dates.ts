export const toISO = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const today = () => toISO(new Date())
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const daysBetween = (a: string, b: string) => {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((db - da) / 86400000)
}
export const daysSince = (iso: string | null | undefined) => (iso ? daysBetween(iso, today()) : null)
export const mondayOf = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return toISO(d)
}
export const monthStart = (iso: string) => iso.slice(0, 7) + '-01'
export const quarterStart = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3) * 3
  return toISO(new Date(d.getFullYear(), q, 1))
}
export const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return toISO(d)
}

const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtFull = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
export const fmtDate = (iso: string | null | undefined) => (iso ? fmtShort.format(new Date(iso + 'T00:00:00')) : '—')
export const fmtDateLong = (iso: string | null | undefined) => (iso ? fmtLong.format(new Date(iso + 'T00:00:00')) : '—')
export const fmtDateFull = (iso: string | null | undefined) => (iso ? fmtFull.format(new Date(iso + 'T00:00:00')) : '—')
export const todayLabel = () => {
  const s = fmtLong.format(new Date())
  return 'Aujourd’hui, ' + s
}
export const weekLabel = (mondayIso: string) => `Sem. du ${fmtDate(mondayIso)}`
