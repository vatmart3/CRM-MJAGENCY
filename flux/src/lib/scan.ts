import { Categorie } from '../types'
import { callAI, AiUnavailable } from './ai'
import { blobToBase64, compressImage } from './files'
import { normalize, parseAmount } from './format'
import { today } from './dates'

export interface ScanResult {
  fournisseur: string
  date: string
  montant: number
  categorieId: string
  libelle: string
  source: 'ia' | 'ocr'
  /** Ce que le lecteur n'a pas su trouver, à compléter à la main. */
  manquants: string[]
}

/** Propose une catégorie à partir des mots-clés de chaque catégorie. */
export const guessCategory = (text: string, categories: Categorie[]): string => {
  const t = normalize(text)
  let best = { id: '', score: 0 }
  for (const c of categories) {
    const words = normalize(c.motsCles + ' ' + c.nom).split(/[\s,&]+/).filter((w) => w.length > 2)
    const score = words.reduce((s, w) => s + (t.includes(w) ? w.length : 0), 0)
    if (score > best.score) best = { id: c.id, score }
  }
  return best.id || categories.find((c) => normalize(c.nom) === 'autre')?.id || categories[0]?.id || ''
}

// ── Lecture locale (sans IA) ────────────────────────────────────────────────

const MOIS_TXT: Record<string, string> = { janv: '01', fevr: '02', mars: '03', avr: '04', mai: '05', juin: '06', juil: '07', aout: '08', sept: '09', oct: '10', nov: '11', dec: '12' }

/** Trouve date, total et commerçant dans le texte brut d'un ticket. */
export const parseReceiptText = (raw: string) => {
  const text = raw.replace(/\r/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Total : la ligne « TOTAL », « TTC », « À PAYER », « MONTANT » la plus basse ; sinon le plus grand montant.
  const amountRe = /(\d{1,3}(?:[ . ]\d{3})*[,.]\d{2}|\d+[,.]\d{2})\s*(?:€|eur)?/gi
  let montant = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = normalize(lines[i]!)
    if (/(total|ttc|a payer|net a payer|montant|carte|cb)/.test(l) && !/(tva|ht\b|sous-total|remise)/.test(l)) {
      const all = [...lines[i]!.matchAll(amountRe)].map((m) => parseAmount(m[1]!))
      if (all.length) {
        montant = Math.max(...all)
        break
      }
    }
  }
  if (!montant) {
    const all = [...text.matchAll(amountRe)].map((m) => parseAmount(m[1]!)).filter((n) => n < 100000)
    if (all.length) montant = Math.max(...all)
  }

  // Date : JJ/MM/AAAA, JJ-MM-AA, JJ.MM.AAAA ou « 12 sept. 2026 ».
  let date = ''
  const d1 = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (d1) {
    const y = d1[3]!.length === 2 ? '20' + d1[3] : d1[3]!
    const dd = d1[1]!.padStart(2, '0')
    const mm = d1[2]!.padStart(2, '0')
    if (Number(mm) <= 12 && Number(dd) <= 31) date = `${y}-${mm}-${dd}`
  }
  if (!date) {
    const d2 = normalize(text).match(/\b(\d{1,2})\s+(janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})/)
    if (d2) date = `${d2[3]}-${MOIS_TXT[d2[2]!]}-${d2[1]!.padStart(2, '0')}`
  }
  if (date && (date > today() || date < '2000-01-01')) date = ''

  // Commerçant : première ligne « parlante » en haut du ticket.
  const fournisseur =
    lines
      .slice(0, 6)
      .find((l) => /[a-zA-Z]{3,}/.test(l) && !/(ticket|facture|recu|reçu|bienvenue|tel|tél|siret|www|http|date|caisse)/i.test(l))
      ?.replace(/[^\p{L}\p{N}&' .-]/gu, '')
      .trim()
      .slice(0, 60) ?? ''

  return { montant, date, fournisseur }
}

async function ocr(blob: Blob): Promise<string> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(blob, 'fra')
  return data.text
}

/**
 * Lit un ticket ou une facture. L'IA (Claude) est essayée d'abord ; si elle n'est
 * pas configurée, la reconnaissance de caractères tourne dans le navigateur.
 */
export async function scanReceipt(file: File, categories: Categorie[], onStep?: (s: string) => void): Promise<ScanResult> {
  const isPdf = file.type === 'application/pdf'
  const blob = isPdf ? file : await compressImage(file, 1600, 0.85)
  const cats = categories.map((c) => ({ id: c.id, nom: c.nom }))

  try {
    onStep?.('Lecture par l’IA…')
    const data = await callAI<{ result: Omit<ScanResult, 'source' | 'manquants'> }>('scan', {
      media_type: isPdf ? 'application/pdf' : blob.type || 'image/jpeg',
      data: await blobToBase64(blob),
      categories: cats,
      today: today(),
    })
    const r = data.result
    const manquants = [!r.montant && 'montant', !r.date && 'date', !r.fournisseur && 'fournisseur'].filter(Boolean) as string[]
    return {
      ...r,
      categorieId: categories.some((c) => c.id === r.categorieId) ? r.categorieId : guessCategory(r.fournisseur + ' ' + r.libelle, categories),
      date: r.date || today(),
      source: 'ia',
      manquants,
    }
  } catch (e) {
    if (!(e instanceof AiUnavailable)) console.warn('[scan] IA en échec, lecture locale', e)
  }

  if (isPdf) return { fournisseur: '', date: today(), montant: 0, categorieId: guessCategory('', categories), libelle: '', source: 'ocr', manquants: ['montant', 'date', 'fournisseur'] }

  onStep?.('Lecture du ticket dans le navigateur…')
  const text = await ocr(blob)
  const p = parseReceiptText(text)
  const manquants = [!p.montant && 'montant', !p.date && 'date', !p.fournisseur && 'fournisseur'].filter(Boolean) as string[]
  return {
    fournisseur: p.fournisseur,
    date: p.date || today(),
    montant: p.montant,
    categorieId: guessCategory(text, categories),
    libelle: '',
    source: 'ocr',
    manquants,
  }
}
