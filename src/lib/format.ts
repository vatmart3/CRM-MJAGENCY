const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eurDec = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('fr-FR')
export const fmtEur = (n: number) => eur.format(n || 0)
export const fmtEurDec = (n: number) => eurDec.format(n || 0)
export const fmtNum = (n: number) => num.format(n || 0)
export const fmtPct = (n: number, digits = 1) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`
export const variation = (cur: number, prev: number): number | null => {
  if (!prev && !cur) return null
  if (!prev) return 100
  return ((cur - prev) / prev) * 100
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
