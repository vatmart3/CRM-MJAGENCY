const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eurRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** 1 234,56 € — espace fine insécable remplacée par une espace normale pour les PDF et CSV. */
export const eur = (n: number) => eurFmt.format(Number.isFinite(n) ? n : 0)
export const eur0 = (n: number) => eurRound.format(Number.isFinite(n) ? Math.round(n) : 0)
/** Version compacte pour les petits espaces : 12,4 k€. */
export const eurK = (n: number) => {
  const a = Math.abs(n)
  if (a >= 100000) return numFmt.format(Math.round(n / 1000)) + ' k€'
  if (a >= 10000) return numFmt.format(Math.round(n / 100) / 10) + ' k€'
  return eur0(n)
}
export const num = (n: number) => numFmt.format(n)
export const pct = (n: number, digits = 0) => `${(Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`

/** Texte sans espaces insécables, pour les exports. */
export const plain = (s: string) => s.replace(/[  ]/g, ' ')

/** Lit un montant saisi à la française : « 1 234,5 », « 1234.50 », « 12€ ». */
export const parseAmount = (raw: string): number => {
  if (!raw) return 0
  let s = raw.replace(/[\s  €]/g, '')
  if (s.includes(',') && s.includes('.')) {
    // Le dernier séparateur est le séparateur décimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else s = s.replace(',', '.')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** Arrondi au centime. */
export const round2 = (n: number) => Math.round(n * 100) / 100

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export const cx = (...c: (string | false | null | undefined | 0)[]) => c.filter(Boolean).join(' ')

export const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n > 1 || n === 0 ? many : one}`

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
