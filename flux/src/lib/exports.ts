// ─────────────────────────────────────────────────────────────────────────────
// Exports de FLUX : livre des recettes, registre des dépenses, rapport mensuel
// PDF et CSV de toutes les tables. Fonctions pures qui déclenchent un
// téléchargement dans le navigateur.
//
// jsPDF et jspdf-autotable sont chargés à la demande (import dynamique) pour
// ne pas alourdir le bundle principal.
// ─────────────────────────────────────────────────────────────────────────────

import type { jsPDF } from 'jspdf'
import type { UserOptions } from 'jspdf-autotable'
import {
  Categorie, Client, Depense, ENTITY_LABEL, JournalEntry, Meta, PAYE_PAR_LABEL, Projet, Recette, Settings, UserId, USERS,
} from '../types'
import {
  FluxData, ASSOCIES, acreActive, clientName, coutMensuel, depensesParCategorie, douzeMois, isEncaissee, joursDeRetard, periodKey, provisionUrssaf,
  seuils, statutOf, synthese, tauxIdentiques, tauxResume, tauxTotal, topClients, urssafPeriods,
} from './finance'
import {
  addMonths, cap, endOfMonth, endOfQuarter, endOfYear, fdate, fdateShort, inRange, monthLabel, quarterOf, startOfMonth, startOfQuarter, startOfYear,
  toISO, today,
} from './dates'
import { eur, eur0, plain, round2 } from './format'
import { saveBlob } from './download'

export type ExportFormat = 'pdf' | 'csv'

/** Tout ce qu'il faut pour exporter les tables, journal compris. `useFlux.getState()` convient. */
export interface ExportState extends FluxData {
  journal: JournalEntry[]
}

// ── Téléchargement ──────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── Petits formats ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** « JJ/MM/AAAA HH:MM » en heure locale, à partir d'un horodatage ISO. */
const fdt = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${fdate(toISO(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const generatedAt = () => {
  const d = new Date()
  return `${fdate(toISO(d))} à ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const userName = (id?: UserId) => (id ? (USERS[id]?.nom ?? id) : '')
const ouiNon = (b: boolean) => (b ? 'Oui' : 'Non')
const pctTxt = (n: number, digits = 1) => `${(Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`
/** Part d'un total, toujours avec une décimale : « 12,5 % ». */
const partTxt = (v: number, total: number) =>
  `${(total > 0 ? (v / total) * 100 : 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

/** Libellé et suffixe de fichier d'une période : année, trimestre, mois ou dates libres. */
export const describePeriod = (from: string, to: string) => {
  const y = from.slice(0, 4)
  if (from === startOfYear(from) && to === endOfYear(from)) return { label: `Année ${y}`, slug: y, custom: false }
  if (from === startOfQuarter(from) && to === endOfQuarter(from)) {
    const q = quarterOf(from)
    return { label: `${q}${q === 1 ? 'er' : 'e'} trimestre ${y}`, slug: `${y}-T${q}`, custom: false }
  }
  if (from === startOfMonth(from) && to === endOfMonth(from)) return { label: cap(monthLabel(from)), slug: from.slice(0, 7), custom: false }
  return { label: `Du ${fdate(from)} au ${fdate(to)}`, slug: `${from}_${to}`, custom: true }
}

/** Identité du client pour le livre des recettes : entreprise et nom. */
export const clientIdentite = (c?: Client) => {
  if (!c) return 'Client inconnu'
  const e = (c.entreprise ?? '').trim()
  const n = (c.nom ?? '').trim()
  if (e && n && e.toLowerCase() !== n.toLowerCase()) return `${e} (${n})`
  return e || n || 'Client inconnu'
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const csvCell = (v: string | number | null | undefined) => {
  let s: string
  if (typeof v === 'number') s = Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : round2(v).toFixed(2).replace('.', ',')) : ''
  else {
    s = plain(v ?? '')
    if (ISO_DATE.test(s)) s = fdate(s)
    // Évite qu'Excel interprète une saisie comme une formule.
    else if (/^[=+@]/.test(s)) s = `'${s}`
  }
  return /[";\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV pour Excel en français : séparateur « ; », UTF-8 avec BOM, fins de ligne CRLF,
 * nombres à virgule décimale sans séparateur de milliers, dates JJ/MM/AAAA.
 */
export function downloadCSV(filename: string, rows: (string | number)[][]): Promise<void> {
  const body = rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
  return saveBlob(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

// ── Sélections ──────────────────────────────────────────────────────────────

/** Recettes encaissées dont la date d'encaissement est dans la période, dans l'ordre chronologique. */
export const livreRecettesRows = (data: FluxData, from: string, to: string) =>
  data.recettes
    .filter((r) => isEncaissee(r) && inRange(r.dateEncaissement, from, to))
    .sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement) || (a.numeroFacture || '').localeCompare(b.numeroFacture || ''))

/** Dépenses non archivées de la période, dans l'ordre chronologique. */
export const registreDepensesRows = (data: FluxData, from: string, to: string) =>
  data.depenses.filter((d) => !d.archived && inRange(d.date, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

const sumOf = (l: number[]) => round2(l.reduce((a, b) => a + b, 0))

// ── Outils PDF ──────────────────────────────────────────────────────────────

type RGB = [number, number, number]
const C = {
  accent: [0, 113, 227] as RGB,
  accentDeep: [0, 88, 184] as RGB,
  accentSoft: [232, 242, 253] as RGB,
  accentPale: [196, 222, 250] as RGB,
  ink: [29, 29, 31] as RGB,
  panel: [245, 245, 247] as RGB,
  muted: [110, 110, 115] as RGB,
  expense: [58, 58, 60] as RGB,
  warn: [255, 159, 10] as RGB,
  late: [255, 59, 48] as RGB,
  line: [229, 229, 234] as RGB,
  white: [255, 255, 255] as RGB,
}

/** Texte compatible avec les polices standard de jsPDF (encodage WinAnsi). */
export const pdfText = (s: string) =>
  plain(String(s ?? ''))
    .replace(/[     ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/’/g, "'")
    .replace(/≈/g, '~')
    .replace(/[→]/g, '->')

const money = (n: number) => pdfText(eur(n))

type AutoTable = (doc: jsPDF, options: UserOptions) => void

async function loadPdf() {
  const [{ jsPDF: JsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { JsPDF, autoTable: autoTable as unknown as AutoTable }
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0

const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2])
const stroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
const color = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2])
const font = (doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' = 'normal', c: RGB = C.ink) => {
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  color(doc, c)
}
const txt = (doc: jsPDF, s: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center'; charSpace?: number; maxWidth?: number }) =>
  doc.text(pdfText(s), x, y, opts)

/** Coupe un texte trop long avec « … » pour qu'il tienne en largeur. */
const fit = (doc: jsPDF, s: string, maxW: number) => {
  let out = pdfText(s)
  if (doc.getTextWidth(out) <= maxW) return out
  while (out.length > 1 && doc.getTextWidth(out + '…') > maxW) out = out.slice(0, -1)
  return out.trimEnd() + '…'
}

type CellHookArg = Parameters<NonNullable<UserOptions['didParseCell']>>[0]

/**
 * Style commun des cellules : filet fin sous chaque ligne du corps, et alignement
 * des en-têtes et totaux calé sur celui de leur colonne (montants à droite…).
 */
const cellStyle = (columnStyles: UserOptions['columnStyles']) => (h: CellHookArg) => {
  h.cell.styles.lineWidth = h.section === 'body' ? { bottom: 0.1, top: 0, left: 0, right: 0 } : 0
  const cs = (columnStyles as Record<number, { halign?: 'left' | 'right' | 'center' }> | undefined)?.[h.column.index]
  if (h.section !== 'body' && cs?.halign && h.cell.colSpan === 1 && !(h.cell.raw && typeof h.cell.raw === 'object' && 'styles' in h.cell.raw))
    h.cell.styles.halign = cs.halign
}

/** Pied de page (identité + pagination) et bandeau courant à partir de la page 2. */
function decoratePages(doc: jsPDF, s: Settings, running?: string) {
  const n = doc.getNumberOfPages()
  const e = s.entreprise
  const foot = [e.nom || 'MJAGENCY', e.siret ? `SIRET ${e.siret}` : '', e.mentionTVA || 'TVA non applicable, art. 293 B du CGI'].filter(Boolean).join('  ·  ')
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    stroke(doc, C.line)
    doc.setLineWidth(0.25)
    doc.line(16, H - 13, W - 16, H - 13)
    font(doc, 7, 'normal', C.muted)
    txt(doc, fit(doc, foot, W - 60), 16, H - 8.5)
    font(doc, 7, 'bold', C.muted)
    txt(doc, `Page ${i} / ${n}`, W - 16, H - 8.5, { align: 'right' })
    if (running && i > 1) {
      fill(doc, C.accent)
      doc.rect(16, 9.2, 2.2, 2.2, 'F')
      font(doc, 7.5, 'bold', C.ink)
      txt(doc, running, 20.5, 11.2)
      font(doc, 7.5, 'normal', C.muted)
      txt(doc, e.nom || 'MJAGENCY', W - 16, 11.2, { align: 'right' })
      stroke(doc, C.line)
      doc.line(16, 14.5, W - 16, 14.5)
    }
  }
}

// ── Registres légaux (livre des recettes, registre des dépenses) ───────────

interface RegisterSpec {
  title: string
  from: string
  to: string
  settings: Settings
  landscape: boolean
  summary: string[]
  head: string[]
  body: (string | number)[][]
  total: number
  totalCol: number
  empty: string
  columnStyles: UserOptions['columnStyles']
  after?: (doc: jsPDF, y: number, autoTable: AutoTable) => void
  filename: string
}

async function registerPdf(spec: RegisterSpec) {
  const { JsPDF, autoTable } = await loadPdf()
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: spec.landscape ? 'landscape' : 'portrait' })
  const W = doc.internal.pageSize.getWidth()
  const M = 16
  const e = spec.settings.entreprise
  const period = describePeriod(spec.from, spec.to)

  // Bande d'accent fine en haut de page.
  fill(doc, C.accent)
  doc.rect(0, 0, W, 3, 'F')

  // Identité de l'entreprise (mentions obligatoires du registre).
  let y = 17
  font(doc, 16, 'bold', C.ink)
  txt(doc, e.nom || 'MJAGENCY', M, y)
  y += 5.5
  font(doc, 9, 'normal', C.ink)
  if (e.titulaire) {
    txt(doc, `${e.titulaire} - Entrepreneur individuel`, M, y)
    y += 4.4
  }
  font(doc, 8.5, 'normal', C.muted)
  for (const l of [e.siret ? `SIRET ${e.siret}` : '', e.adresse, [e.email, e.telephone].filter(Boolean).join('  ·  ')]) {
    if (!l) continue
    txt(doc, l, M, y)
    y += 4.2
  }
  font(doc, 8.5, 'italic', C.muted)
  txt(doc, e.mentionTVA || 'TVA non applicable, art. 293 B du CGI', M, y)

  // Titre et période, à droite.
  font(doc, 20, 'bold', C.accent)
  txt(doc, spec.title, W - M, 18, { align: 'right' })
  font(doc, 10, 'bold', C.ink)
  txt(doc, period.label, W - M, 24.5, { align: 'right' })
  font(doc, 8.5, 'normal', C.muted)
  if (!period.custom) txt(doc, `Du ${fdate(spec.from)} au ${fdate(spec.to)}`, W - M, 29, { align: 'right' })
  txt(doc, `Généré le ${generatedAt()}`, W - M, period.custom ? 29 : 33.2, { align: 'right' })

  y = Math.max(y, 33.2) + 5
  stroke(doc, C.line)
  doc.setLineWidth(0.3)
  doc.line(M, y, W - M, y)
  y += 6

  // Chiffres clés de la période sous forme de pastilles.
  let x = M
  for (const s of spec.summary) {
    font(doc, 8.5, 'bold', C.ink)
    const w = doc.getTextWidth(pdfText(s)) + 8
    fill(doc, C.panel)
    doc.roundedRect(x, y - 4.3, w, 6.6, 3.3, 3.3, 'F')
    txt(doc, s, x + 4, y)
    x += w + 3
  }
  y += 6

  const cols = spec.head.length
  const body: UserOptions['body'] = spec.body.length
    ? spec.body.map((r) => r.map((c) => (typeof c === 'number' ? money(c) : pdfText(c))))
    : [[{ content: pdfText(spec.empty), colSpan: cols, styles: { halign: 'center', textColor: C.muted, fontStyle: 'italic', cellPadding: 6 } }]]
  const foot: UserOptions['foot'] = [
    [
      { content: 'Total de la période', colSpan: spec.totalCol, styles: { halign: 'right' } },
      { content: money(spec.total), styles: { halign: 'right' } },
      ...(cols - spec.totalCol - 1 > 0 ? [{ content: '', colSpan: cols - spec.totalCol - 1 }] : []),
    ],
  ]

  autoTable(doc, {
    startY: y,
    head: [spec.head.map(pdfText)],
    body,
    foot,
    showFoot: 'lastPage',
    theme: 'plain',
    margin: { left: M, right: M, top: 20, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 8.2, cellPadding: { top: 2.2, bottom: 2.2, left: 2.2, right: 2.2 }, textColor: C.ink, lineColor: C.line, lineWidth: 0, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: C.ink, textColor: C.white, fontStyle: 'bold', fontSize: 7.2 },
    alternateRowStyles: { fillColor: C.panel },
    footStyles: { fillColor: C.accentSoft, textColor: C.ink, fontStyle: 'bold', fontSize: 9 },
    columnStyles: spec.columnStyles,
    didParseCell: cellStyle(spec.columnStyles),
  })

  spec.after?.(doc, lastY(doc), autoTable)
  decoratePages(doc, spec.settings, `${spec.title} · ${period.label}`)
  await saveBlob(doc.output('blob'), spec.filename)
}

/** Livre des recettes : registre chronologique des encaissements (obligatoire en micro-entreprise). */
export async function exportLivreRecettes(data: FluxData, from: string, to: string, format: ExportFormat) {
  const rows = livreRecettesRows(data, from, to)
  const clients = new Map(data.clients.map((c) => [c.id, c]))
  const total = sumOf(rows.map((r) => r.montant))
  const slug = describePeriod(from, to).slug
  const filename = `FLUX-livre-des-recettes-${slug}.${format}`
  const line = (r: Recette) => [fdate(r.dateEncaissement), clientIdentite(clients.get(r.clientId)), r.libelle || '', r.montant, r.mode || '', r.numeroFacture || '']
  const head = ["Date d'encaissement", 'Client', 'Nature de la prestation', 'Montant', 'Mode de règlement', 'Référence de la facture']

  if (format === 'csv') {
    return downloadCSV(filename, [head, ...rows.map(line), ['', '', 'Total de la période', total, '', '']])
    return
  }
  await registerPdf({
    title: 'Livre des recettes',
    from,
    to,
    settings: data.settings,
    landscape: false,
    summary: [rows.length ? `${rows.length} encaissement${rows.length > 1 ? 's' : ''}` : 'Aucun encaissement', `Total encaissé : ${eur(total)}`],
    head,
    body: rows.map(line),
    total,
    totalCol: 3,
    empty: 'Aucun encaissement sur la période.',
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 41 },
      2: { cellWidth: 'auto', minCellWidth: 40 },
      3: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 22 },
      5: { cellWidth: 24 },
    },
    filename,
  })
}

/** Registre des achats et dépenses, avec sous-totaux par catégorie. */
export async function exportRegistreDepenses(data: FluxData, from: string, to: string, format: ExportFormat) {
  const rows = registreDepensesRows(data, from, to)
  const cats = new Map(data.categories.map((c) => [c.id, c.nom]))
  const projets = new Map(data.projets.map((p) => [p.id, p.nom]))
  const total = sumOf(rows.map((d) => d.montant))
  const slug = describePeriod(from, to).slug
  const filename = `FLUX-registre-des-depenses-${slug}.${format}`
  const head = ['Date', 'Fournisseur', 'Libellé', 'Catégorie', 'Montant TTC', 'Mode de paiement', 'Payé par', 'Justificatif', 'Projet']
  const line = (d: Depense) => [
    fdate(d.date),
    d.fournisseur || '',
    d.libelle || '',
    cats.get(d.categorieId) ?? 'Sans catégorie',
    d.montant,
    d.mode || '',
    PAYE_PAR_LABEL[d.payePar] ?? d.payePar,
    ouiNon(!!d.justificatif),
    d.projetId ? (projets.get(d.projetId) ?? '') : '',
  ]
  const parCat = depensesParCategorie(data.depenses, data.categories, from, to).map((c) => ({ ...c, nb: rows.filter((d) => d.categorieId === c.id).length }))

  if (format === 'csv') {
    return downloadCSV(filename, [head, ...rows.map(line), ['', '', '', 'Total de la période', total, '', '', '', '']])
    return
  }
  const manquants = rows.filter((d) => !d.justificatif).length
  await registerPdf({
    title: 'Registre des dépenses',
    from,
    to,
    settings: data.settings,
    landscape: true,
    summary: [
      rows.length ? `${rows.length} dépense${rows.length > 1 ? 's' : ''}` : 'Aucune dépense',
      `Total TTC : ${eur(total)}`,
      ...(rows.length ? [manquants ? `${manquants} justificatif${manquants > 1 ? 's' : ''} manquant${manquants > 1 ? 's' : ''}` : 'Tous les justificatifs sont là'] : []),
    ],
    head,
    body: rows.map(line),
    total,
    totalCol: 4,
    empty: 'Aucune dépense sur la période.',
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 32 },
      2: { cellWidth: 'auto', minCellWidth: 44 },
      3: { cellWidth: 38 },
      4: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 24 },
      6: { cellWidth: 25 },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 32 },
    },
    after: (doc, y, autoTable) => {
      if (!parCat.length) return
      const H = doc.internal.pageSize.getHeight()
      let top = y + 12
      if (top + 20 > H - 20) {
        doc.addPage()
        top = 26
      }
      font(doc, 12, 'bold', C.ink)
      fill(doc, C.accent)
      doc.rect(16, top - 4, 1.4, 5, 'F')
      txt(doc, 'Sous-totaux par catégorie', 20, top)
      const subCols: UserOptions['columnStyles'] = { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 22 } }
      autoTable(doc, {
        startY: top + 4,
        head: [['Catégorie', 'Nombre', 'Montant TTC', 'Part']],
        body: parCat.map((c) => [pdfText(c.nom), String(c.nb), money(c.total), partTxt(c.total, total)]),
        foot: [['Total', String(rows.length), money(total), '100,0 %']],
        showFoot: 'lastPage',
        theme: 'plain',
        tableWidth: 150,
        margin: { left: 16, right: 16, top: 20, bottom: 18 },
        styles: { fontSize: 8.5, cellPadding: 2.2, textColor: C.ink, lineColor: C.line },
        headStyles: { fillColor: C.ink, textColor: C.white, fontStyle: 'bold', fontSize: 7.6 },
        alternateRowStyles: { fillColor: C.panel },
        footStyles: { fillColor: C.accentSoft, fontStyle: 'bold' },
        columnStyles: subCols,
        didParseCell: cellStyle(subCols),
      })
    },
    filename,
  })
}

// ── Rapport mensuel ─────────────────────────────────────────────────────────

const niceStep = (range: number, n: number) => {
  const raw = range / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}
const axisEur = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(n).toLocaleString('fr-FR')} €`

/** Variation relative, null quand la comparaison n'a pas de sens (mois précédent à zéro). */
const variationOf = (cur: number, prev: number) => (prev !== 0 ? (cur - prev) / Math.abs(prev) : null)

/** Rapport mensuel complet, mis en page aux couleurs de MJAGENCY. `month` au format « AAAA-MM-01 ». */
export async function exportRapportMensuel(data: FluxData, month: string) {
  const { JsPDF, autoTable } = await loadPdf()
  const s = data.settings
  const e = s.entreprise
  const m = startOfMonth(month)
  const fin = endOfMonth(m)
  const now = today()
  // Les états (retards, provision, seuils) sont arrêtés à la fin du mois, ou à aujourd'hui pour le mois en cours.
  const ref = fin < now ? fin : now
  const prevM = addMonths(m, -1)
  const moisNom = cap(monthLabel(m))
  const prevNom = monthLabel(prevM).split(' ')[0]!
  const cur = synthese(data, m, fin)
  const prev = synthese(data, prevM, endOfMonth(prevM))

  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = 210
  const M = 16
  const W = PW - 2 * M
  const BOTTOM = 278
  let y = 0

  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage()
      y = 24
    }
  }
  /** Titre de section ; `need` réserve la place du contenu pour ne pas laisser un titre seul en bas de page. */
  const section = (title: string, sub?: string, need = 16) => {
    ensure(6.5 + need)
    fill(doc, C.accent)
    doc.roundedRect(M, y - 4.2, 1.6, 5.4, 0.8, 0.8, 'F')
    font(doc, 13, 'bold', C.ink)
    txt(doc, title, M + 4.5, y)
    if (sub) {
      font(doc, 8, 'normal', C.muted)
      txt(doc, fit(doc, sub, W - doc.getTextWidth(pdfText(title)) - 30), M + W, y, { align: 'right' })
    }
    y += 6.5
  }
  const emptyBox = (msg: string, h = 14) => {
    ensure(h + 4)
    fill(doc, C.panel)
    doc.roundedRect(M, y, W, h, 3, 3, 'F')
    font(doc, 9, 'italic', C.muted)
    txt(doc, msg, M + W / 2, y + h / 2 + 1.2, { align: 'center' })
    y += h + 9
  }

  // 1. Bandeau de couverture ────────────────────────────────────────────────
  const BAND = 62
  fill(doc, C.accent)
  doc.rect(0, 0, PW, BAND, 'F')
  // Cercles décoratifs, en léger ton sur ton, limités au bandeau.
  doc.saveGraphicsState()
  doc.rect(0, 0, PW, BAND, null)
  doc.clip()
  doc.discardPath()
  fill(doc, [16, 124, 232])
  doc.circle(PW - 18, 6, 44, 'F')
  fill(doc, [30, 134, 236])
  doc.circle(PW - 2, BAND + 4, 30, 'F')
  doc.restoreGraphicsState()
  fill(doc, C.accentDeep)
  doc.rect(0, BAND - 1.4, PW, 1.4, 'F')

  font(doc, 8, 'bold', C.accentPale)
  txt(doc, 'FLUX  —  RAPPORT MENSUEL', M, 16, { charSpace: 0.5 })
  font(doc, 30, 'bold', C.white)
  txt(doc, moisNom, M, 31)
  font(doc, 10, 'normal', C.accentPale)
  txt(doc, `Bilan financier de ${e.nom || 'MJAGENCY'}, du ${fdate(m)} au ${fdate(fin)}`, M, 39)
  font(doc, 7.5, 'normal', C.accentPale)
  txt(doc, `Généré automatiquement le ${generatedAt()} à partir des données FLUX`, M, 52)
  if (ref < fin) txt(doc, `Mois en cours : données arrêtées au ${fdate(ref)}`, M, 56)

  let iy = 16
  font(doc, 11, 'bold', C.white)
  txt(doc, e.nom || 'MJAGENCY', PW - M, iy, { align: 'right' })
  iy += 5.2
  font(doc, 8, 'normal', C.white)
  for (const l of [e.titulaire, e.siret ? `SIRET ${e.siret}` : '', e.adresse, e.mentionTVA]) {
    if (!l) continue
    txt(doc, l, PW - M, iy, { align: 'right' })
    iy += 4.2
  }
  y = BAND + 14

  // 2. Synthèse : quatre chiffres clés ──────────────────────────────────────
  section('Synthèse du mois', `Comparaison avec ${prevNom}`)
  const tiles: { label: string; value: number; caption: string; varia: number | null; goodUp: boolean | null; hero?: boolean }[] = [
    { label: 'CA encaissé', value: cur.ca, caption: 'Recettes encaissées', varia: variationOf(cur.ca, prev.ca), goodUp: true },
    { label: 'Dépenses', value: cur.depenses, caption: 'Toutes catégories, TTC', varia: variationOf(cur.depenses, prev.depenses), goodUp: false },
    {
      label: 'Cotisations URSSAF',
      value: cur.cotisations,
      caption: tauxIdentiques(s, ref) ? `Estimées à ${tauxResume(s, ref)} du CA` : 'Au taux de chacun (ACRE)',
      varia: variationOf(cur.cotisations, prev.cotisations),
      goodUp: null,
    },
    { label: 'Résultat net', value: cur.resultat, caption: 'Ce que tu gardes vraiment', varia: variationOf(cur.resultat, prev.resultat), goodUp: true, hero: true },
  ]
  const TG = 4
  const TW = (W - 3 * TG) / 4
  const TH = 35
  tiles.forEach((t, i) => {
    const x = M + i * (TW + TG)
    fill(doc, t.hero ? C.accent : C.panel)
    doc.roundedRect(x, y, TW, TH, 3.2, 3.2, 'F')
    const main: RGB = t.hero ? C.white : C.ink
    const sub: RGB = t.hero ? C.accentPale : C.muted
    font(doc, 6.8, 'bold', sub)
    txt(doc, t.label.toUpperCase(), x + 4, y + 7, { charSpace: 0.3 })
    let size = 15.5
    font(doc, size, 'bold', t.value < 0 && !t.hero ? C.late : main)
    while (doc.getTextWidth(money(t.value)) > TW - 8 && size > 10) {
      size -= 0.5
      doc.setFontSize(size)
    }
    txt(doc, money(t.value), x + 4, y + 16.5)
    font(doc, 7, 'normal', sub)
    txt(doc, fit(doc, t.caption, TW - 8), x + 4, y + 22)
    // Variation
    let vText: string
    let vColor: RGB
    if (t.varia === null) {
      vText = t.value === 0 ? 'Stable' : 'Nouveau'
      vColor = sub
    } else {
      const up = t.varia >= 0
      vText = `${up ? '+' : '-'}${pctTxt(Math.abs(t.varia * 100))}`
      const good = t.goodUp === null ? null : up === t.goodUp
      vColor = t.hero ? C.white : good === null ? C.ink : good ? C.accent : C.warn
      if (Math.abs(t.varia) < 0.0005) {
        vText = '='
        vColor = sub
      }
    }
    font(doc, 7.5, 'bold', vColor)
    txt(doc, vText, x + 4, y + 29.5)
    const vw = doc.getTextWidth(pdfText(vText))
    font(doc, 7, 'normal', sub)
    txt(doc, fit(doc, ` vs ${prevNom}`, TW - 10 - vw), x + 4 + vw, y + 29.5)
  })
  y += TH + 4.5
  font(doc, 7, 'normal', C.muted)
  txt(doc, 'Résultat net = CA encaissé - dépenses - cotisations URSSAF estimées.', M, y)
  y += 12

  // 3. Graphique sur 12 mois ────────────────────────────────────────────────
  const points = douzeMois(data, m)
  const CH = 58
  section('Évolution sur 12 mois', `${cap(monthLabel(addMonths(m, -11)))} - ${moisNom}`, CH + 20)
  // Légende
  const legend: [string, RGB, 'bar' | 'line'][] = [
    ['Recettes encaissées', C.accent, 'bar'],
    ['Dépenses', C.expense, 'bar'],
    ['Résultat net', C.warn, 'line'],
  ]
  let lx = M
  for (const [label, c, kind] of legend) {
    if (kind === 'bar') {
      fill(doc, c)
      doc.roundedRect(lx, y - 2.4, 3, 3, 0.6, 0.6, 'F')
    } else {
      stroke(doc, c)
      doc.setLineWidth(0.7)
      doc.line(lx - 0.5, y - 0.9, lx + 3.5, y - 0.9)
      fill(doc, C.white)
      doc.circle(lx + 1.5, y - 0.9, 0.9, 'FD')
    }
    font(doc, 7.5, 'normal', C.ink)
    txt(doc, label, lx + 5, y)
    lx += 5 + doc.getTextWidth(pdfText(label)) + 8
  }
  y += 6
  const values = points.flatMap((p) => [p.recettes, p.depenses, p.resultat])
  const hasData = values.some((v) => v !== 0)
  const vmax = Math.max(0, ...values)
  const vmin = Math.min(0, ...points.map((p) => p.resultat))
  const step = niceStep(hasData ? vmax - vmin || Math.abs(vmax) || 1000 : 1000, 4)
  const top = hasData ? Math.max(step, Math.ceil(vmax / step) * step) : step * 4
  const bottom = Math.floor(vmin / step) * step
  const AX = M + 15
  const AW = W - 15
  const cy0 = y
  const yOf = (v: number) => cy0 + CH - ((v - bottom) / (top - bottom)) * CH
  // Mise en évidence du mois du rapport
  const GW = AW / 12
  fill(doc, C.panel)
  doc.roundedRect(AX + 11 * GW + 0.6, cy0 - 3, GW - 1.2, CH + 11, 2, 2, 'F')
  // Grille
  doc.setLineWidth(0.2)
  for (let v = bottom; v <= top + step / 2; v += step) {
    const yy = yOf(v)
    stroke(doc, v === 0 ? C.muted : C.line)
    doc.setLineWidth(v === 0 ? 0.3 : 0.18)
    doc.line(AX, yy, AX + AW, yy)
    font(doc, 6.5, 'normal', C.muted)
    txt(doc, axisEur(v), AX - 2, yy + 1.1, { align: 'right' })
  }
  // Barres
  const BW = Math.min(4.2, (GW - 3) / 2)
  points.forEach((p, i) => {
    const gx = AX + i * GW + GW / 2
    const z = yOf(0)
    const bar = (v: number, x: number, c: RGB) => {
      if (v <= 0) return
      const h = z - yOf(v)
      fill(doc, c)
      doc.rect(x, z - h, BW, Math.max(h, 0.3), 'F')
    }
    bar(p.recettes, gx - BW - 0.4, C.accent)
    bar(p.depenses, gx + 0.4, C.expense)
    const isCur = i === 11
    font(doc, 6.8, isCur ? 'bold' : 'normal', isCur ? C.ink : C.muted)
    const lab = p.key.endsWith('-01') ? `${p.label} ${p.key.slice(2, 4)}` : p.label
    txt(doc, lab, gx, cy0 + CH + 5, { align: 'center' })
  })
  // Courbe du résultat
  if (hasData) {
    stroke(doc, C.warn)
    doc.setLineWidth(0.7)
    for (let i = 1; i < 12; i++) {
      doc.line(AX + (i - 1) * GW + GW / 2, yOf(points[i - 1]!.resultat), AX + i * GW + GW / 2, yOf(points[i]!.resultat))
    }
    fill(doc, C.white)
    points.forEach((p, i) => doc.circle(AX + i * GW + GW / 2, yOf(p.resultat), 0.95, 'FD'))
    // Valeur du résultat du mois
    const last = points[11]!
    font(doc, 6.8, 'bold', last.resultat < 0 ? C.late : C.ink)
    const ly = yOf(Math.max(last.recettes, last.depenses, last.resultat)) - 2.5
    txt(doc, pdfText(eur0(last.resultat)), AX + 11 * GW + GW / 2, Math.max(cy0 + 1, ly), { align: 'center' })
  } else {
    font(doc, 8.5, 'italic', C.muted)
    txt(doc, 'Aucune donnée sur les 12 derniers mois', AX + AW / 2, cy0 + CH / 2, { align: 'center' })
  }
  y = cy0 + CH + 17

  // 4. Dépenses par catégorie ──────────────────────────────────────────────
  const parCat = depensesParCategorie(data.depenses, data.categories, m, fin)
  section('Dépenses par catégorie', parCat.length ? `${money(cur.depenses)} au total` : undefined, Math.min(Math.max(parCat.length, 1), 3) * 7.4 + 4)
  if (!parCat.length) emptyBox('Aucune dépense ce mois-ci.')
  else {
    const maxCat = parCat[0]!.total || 1
    const NAME_W = 56
    const BX = M + NAME_W + 2
    const BWMAX = W - NAME_W - 2 - 44
    for (const c of parCat) {
      ensure(8)
      font(doc, 8.6, 'normal', C.ink)
      txt(doc, fit(doc, c.nom, NAME_W), M, y + 2.6)
      fill(doc, C.panel)
      doc.roundedRect(BX, y, BWMAX, 3.6, 1.8, 1.8, 'F')
      const bw = Math.max(3.6, (c.total / maxCat) * BWMAX)
      fill(doc, C.expense)
      doc.roundedRect(BX, y, bw, 3.6, 1.8, 1.8, 'F')
      font(doc, 8.6, 'bold', C.ink)
      txt(doc, money(c.total), M + W - 14, y + 2.6, { align: 'right' })
      font(doc, 8, 'normal', C.muted)
      txt(doc, pctTxt(cur.depenses > 0 ? (c.total / cur.depenses) * 100 : 0, 0), M + W, y + 2.6, { align: 'right' })
      y += 7.4
    }
    y += 7
  }

  // 5. Top clients et top dépenses ─────────────────────────────────────────
  const tops = topClients(data, m, fin).slice(0, 5)
  const topDeps = data.depenses
    .filter((d) => !d.archived && inRange(d.date, m, fin))
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 5)
  const cats = new Map(data.categories.map((c) => [c.id, c.nom]))
  section('Clients et dépenses du mois', undefined, 52)
  const HW = (W - 6) / 2
  const colY = y
  const tableBase = {
    theme: 'plain' as const,
    showHead: 'firstPage' as const,
    styles: { fontSize: 8.2, cellPadding: { top: 2.1, bottom: 2.1, left: 2.4, right: 2.4 }, textColor: C.ink, lineColor: C.line, overflow: 'ellipsize' as const },
    headStyles: { fillColor: C.panel, textColor: C.muted, fontStyle: 'bold' as const, fontSize: 7 },
  }
  const clientCols: UserOptions['columnStyles'] = {
    1: { halign: 'center', cellWidth: 11 },
    2: { halign: 'right', cellWidth: 25, fontStyle: 'bold' },
    3: { halign: 'right', cellWidth: 13 },
  }
  const depCols: UserOptions['columnStyles'] = { 0: { cellWidth: 12 }, 2: { cellWidth: 27, textColor: C.muted }, 3: { halign: 'right', cellWidth: 24, fontStyle: 'bold' } }
  const subTitle = (label: string, x: number) => {
    font(doc, 9.5, 'bold', C.ink)
    txt(doc, label, x, colY)
  }
  subTitle('Top 5 clients', M)
  subTitle('Top 5 dépenses', M + HW + 6)
  let yL = colY + 3
  let yR = colY + 3
  if (tops.length) {
    autoTable(doc, {
      ...tableBase,
      startY: colY + 3,
      tableWidth: HW,
      margin: { left: M, right: PW - M - HW, top: 20, bottom: 18 },
      head: [['Client', 'Fact.', 'Montant', 'Part']],
      body: tops.map((t) => [pdfText(clientName(t.client)), String(t.nb), money(t.total), pctTxt(cur.ca > 0 ? (t.total / cur.ca) * 100 : 0, 0)]),
      columnStyles: clientCols,
      didParseCell: cellStyle(clientCols),
    })
    yL = lastY(doc)
  } else {
    fill(doc, C.panel)
    doc.roundedRect(M, colY + 3, HW, 14, 3, 3, 'F')
    font(doc, 8.5, 'italic', C.muted)
    txt(doc, 'Aucune recette ce mois-ci.', M + HW / 2, colY + 11.2, { align: 'center' })
    yL = colY + 17
  }
  if (topDeps.length) {
    autoTable(doc, {
      ...tableBase,
      startY: colY + 3,
      tableWidth: HW,
      margin: { left: M + HW + 6, right: M, top: 20, bottom: 18 },
      head: [['Date', 'Fournisseur', 'Catégorie', 'Montant']],
      body: topDeps.map((d) => [fdateShort(d.date), pdfText(d.fournisseur || d.libelle || '-'), pdfText(cats.get(d.categorieId) ?? 'Sans catégorie'), money(d.montant)]),
      columnStyles: depCols,
      didParseCell: cellStyle(depCols),
    })
    yR = lastY(doc)
  } else {
    fill(doc, C.panel)
    doc.roundedRect(M + HW + 6, colY + 3, HW, 14, 3, 3, 'F')
    font(doc, 8.5, 'italic', C.muted)
    txt(doc, 'Aucune dépense ce mois-ci.', M + HW + 6 + HW / 2, colY + 11.2, { align: 'center' })
    yR = colY + 17
  }
  // Les tableaux restent sur la page courante (5 lignes au plus, place réservée par ensure).
  doc.setPage(doc.getNumberOfPages())
  y = Math.max(yL, yR) + 12

  // 6. Provision URSSAF ────────────────────────────────────────────────────
  const periods = urssafPeriods(data, ref)
  const curKey = periodKey(ref, s.periodicite)
  const curP = periods.find((p) => p.key === curKey) ?? periods[0]
  const provision = provisionUrssaf(data, ref)
  section('Provision URSSAF', s.periodicite === 'mensuelle' ? 'Déclaration mensuelle' : 'Déclaration trimestrielle', 50)
  {
    const boxY = y
    const LW = W * 0.6
    const BH = 44
    fill(doc, C.panel)
    doc.roundedRect(M, boxY, LW - 3, BH, 3.2, 3.2, 'F')
    const ca = curP?.ca ?? 0
    const totalCot = curP?.detail.total ?? 0
    font(doc, 7, 'bold', C.muted)
    txt(doc, `PÉRIODE EN COURS · ${(curP?.label ?? '').toUpperCase()}`, M + 5, boxY + 7, { charSpace: 0.2 })
    font(doc, 8.5, 'normal', C.ink)
    txt(doc, 'CA encaissé sur la période', M + 5, boxY + 13.5)
    font(doc, 8.5, 'bold', C.ink)
    txt(doc, money(ca), M + LW - 8, boxY + 13.5, { align: 'right' })
    // Chacun déclare sa part sur son compte URSSAF, à son taux (ACRE comprise).
    const lines: [string, number][] = ASSOCIES.map((w) => [
      `${USERS[w].prenom} : ${money(curP?.parts[w].ca ?? 0)} à déclarer (${pctTxt(tauxTotal(s, w, ref))}${acreActive(s, w, ref) ? ', ACRE' : ''})`,
      curP?.parts[w].cotisations ?? 0,
    ])
    let ly = boxY + 19.5
    for (const [l, v] of lines) {
      font(doc, 8, 'normal', C.muted)
      txt(doc, l, M + 5, ly)
      txt(doc, money(v), M + LW - 8, ly, { align: 'right' })
      ly += 5
    }
    stroke(doc, C.line)
    doc.setLineWidth(0.3)
    doc.line(M + 5, ly - 2.2, M + LW - 8, ly - 2.2)
    font(doc, 8.8, 'bold', C.ink)
    txt(doc, 'Total estimé des cotisations', M + 5, ly + 2.4)
    txt(doc, money(totalCot), M + LW - 8, ly + 2.4, { align: 'right' })

    // Tuile « à garder de côté »
    const RX = M + LW
    const RW = W - LW
    fill(doc, C.accent)
    doc.roundedRect(RX, boxY, RW, BH, 3.2, 3.2, 'F')
    font(doc, 7, 'bold', C.accentPale)
    txt(doc, 'À GARDER DE CÔTÉ', RX + 5, boxY + 7, { charSpace: 0.3 })
    font(doc, 19, 'bold', C.white)
    txt(doc, money(provision), RX + 5, boxY + 17.5)
    font(doc, 7.2, 'normal', C.accentPale)
    txt(doc, 'Cotisations calculées et pas encore payées', RX + 5, boxY + 23, { maxWidth: RW - 10 })

    const unpaid = periods
      .filter((p) => p.statut !== 'Payée' && (p.detail.total > 0 || p.key === curKey))
      .sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))
    const next = unpaid[0]
    font(doc, 7, 'bold', C.accentPale)
    txt(doc, 'PROCHAINE ÉCHÉANCE', RX + 5, boxY + 32, { charSpace: 0.3 })
    if (next) {
      const late = next.dateLimite < ref
      font(doc, 10, 'bold', C.white)
      txt(doc, `${fdate(next.dateLimite)}${late ? '  (dépassée)' : ''}`, RX + 5, boxY + 37.5)
      font(doc, 7.2, 'normal', C.accentPale)
      txt(doc, fit(doc, `${next.label} · ${money(next.detail.total)}`, RW - 10), RX + 5, boxY + 41.5)
    } else {
      font(doc, 9, 'bold', C.white)
      txt(doc, 'Tout est à jour', RX + 5, boxY + 37.5)
    }
    y = boxY + BH + 5
    if (!s.tauxVerifies) {
      font(doc, 7.2, 'bold', C.warn)
      txt(doc, 'Taux indicatifs, à vérifier et confirmer dans Réglages.', M, y)
      y += 4
    }
    y += 8
  }

  // 7. À encaisser ─────────────────────────────────────────────────────────
  const clients = new Map(data.clients.map((c) => [c.id, c]))
  const pending = data.recettes
    .filter((r) => !r.archived && r.statut !== 'Annulée' && (r.dateFacture || r.dateEcheance || '') <= ref)
    .filter((r) => !(isEncaissee(r) && r.dateEncaissement <= ref))
    // Une facture encaissée après la date d'arrêt était encore due à cette date.
    .map((r) => ({ r, statut: statutOf(r.statut === 'Encaissée' ? { ...r, statut: 'En attente' } : r, ref) }))
    .filter((x) => x.statut === 'En attente' || x.statut === 'En retard')
    .sort((a, b) => (a.statut === b.statut ? (a.r.dateEcheance || a.r.dateFacture).localeCompare(b.r.dateEcheance || b.r.dateFacture) : a.statut === 'En retard' ? -1 : 1))
  const pendingTotal = sumOf(pending.map((x) => x.r.montant))
  const lateTotal = sumOf(pending.filter((x) => x.statut === 'En retard').map((x) => x.r.montant))
  section('À encaisser', pending.length ? `${money(pendingTotal)} en attente${lateTotal > 0 ? `, dont ${money(lateTotal)} en retard` : ''}` : undefined, 30)
  if (!pending.length) emptyBox('Aucune facture en attente : tout est encaissé.')
  else {
    const pendCols: UserOptions['columnStyles'] = {
      0: { cellWidth: 24 },
      1: { cellWidth: 40 },
      3: { cellWidth: 21 },
      4: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 27 },
    }
    autoTable(doc, {
      ...tableBase,
      startY: y,
      showHead: 'everyPage',
      margin: { left: M, right: M, top: 22, bottom: 18 },
      head: [['Facture', 'Client', 'Prestation', 'Échéance', 'Montant', 'Statut']],
      body: pending.map(({ r, statut }) => {
        const j = joursDeRetard(r, ref)
        return [
          pdfText(r.numeroFacture || '-'),
          pdfText(clientName(clients.get(r.clientId))),
          pdfText(r.libelle || ''),
          r.dateEcheance ? fdate(r.dateEcheance) : '-',
          money(r.montant),
          statut === 'En retard' ? `En retard · ${j} j` : 'En attente',
        ]
      }),
      foot: [[{ content: 'Total à encaisser', colSpan: 4, styles: { halign: 'right' } }, money(pendingTotal), '']],
      showFoot: 'lastPage',
      footStyles: { fillColor: C.accentSoft, textColor: C.ink, fontStyle: 'bold' },
      columnStyles: pendCols,
      didParseCell: (h) => {
        cellStyle(pendCols)(h)
        if (h.section === 'body') {
          if (h.column.index === 5) {
            const late = String(h.cell.raw).startsWith('En retard')
            h.cell.styles.textColor = late ? C.late : C.muted
            h.cell.styles.fontStyle = late ? 'bold' : 'normal'
          }
        }
      },
    })
    y = lastY(doc) + 12
  }

  // 8. Seuils ──────────────────────────────────────────────────────────────
  const ss = seuils(data, ref)
  section(`Seuils ${ref.slice(0, 4)}`, `CA encaissé depuis le 1er janvier : ${money(ss[0]?.ca ?? 0)}`, 18)
  for (const t of ss) {
    ensure(17)
    const c: RGB = t.niveau === 'critique' ? C.late : t.niveau === 'attention' ? C.warn : C.accent
    font(doc, 9, 'bold', C.ink)
    txt(doc, t.label, M, y)
    font(doc, 8.5, 'normal', C.muted)
    const right = t.seuil > 0 ? `${money(t.ca)} / ${money(t.seuil)}` : 'Non renseigné'
    const pctLabel = t.seuil > 0 ? pctTxt(t.ratio * 100, 0) : ''
    font(doc, 8.5, 'bold', c)
    txt(doc, pctLabel, M + W, y, { align: 'right' })
    const pw = doc.getTextWidth(pdfText(pctLabel))
    font(doc, 8.5, 'normal', C.muted)
    txt(doc, right, M + W - pw - (pctLabel ? 3 : 0), y, { align: 'right' })
    fill(doc, C.panel)
    doc.roundedRect(M, y + 2.2, W, 3.4, 1.7, 1.7, 'F')
    if (t.ratio > 0) {
      fill(doc, c)
      doc.roundedRect(M, y + 2.2, Math.max(3.4, Math.min(1, t.ratio) * W), 3.4, 1.7, 1.7, 'F')
    }
    font(doc, 7.3, 'normal', C.muted)
    txt(doc, t.texte, M, y + 9.8)
    y += 17.5
  }

  decoratePages(doc, s, `FLUX — Rapport mensuel · ${moisNom}`)
  await saveBlob(doc.output('blob'), `FLUX-rapport-mensuel-${m.slice(0, 7)}.pdf`)
}

// ── CSV de toutes les tables ────────────────────────────────────────────────

export type TableName = 'clients' | 'projets' | 'recettes' | 'depenses' | 'abonnements' | 'declarations' | 'categories' | 'journal'
export const TABLE_NAMES: TableName[] = ['clients', 'projets', 'recettes', 'depenses', 'abonnements', 'declarations', 'categories', 'journal']
export const TABLE_LABEL: Record<TableName, string> = {
  clients: 'Clients',
  projets: 'Projets',
  recettes: 'Recettes',
  depenses: 'Dépenses',
  abonnements: 'Abonnements',
  declarations: 'Déclarations URSSAF',
  categories: 'Catégories',
  journal: 'Journal',
}

const META_HEAD = ['Archivé', "Motif d'archivage", 'Archivé le', 'Archivé par', 'Saisi par', 'Saisi le', 'Modifié par', 'Modifié le']
const metaCells = (x: Meta) => [
  ouiNon(!!x.archived),
  x.archived?.motif ?? '',
  fdt(x.archived?.at),
  userName(x.archived?.by),
  userName(x.createdBy),
  fdt(x.createdAt),
  userName(x.updatedBy),
  fdt(x.updatedAt),
]

/** Lignes (en-tête compris) d'une table, avec les identifiants remplacés par des noms. */
export function tableRows(name: TableName, state: ExportState): (string | number)[][] {
  const clients = new Map(state.clients.map((c) => [c.id, c]))
  const projets = new Map(state.projets.map((p) => [p.id, p]))
  const cats = new Map(state.categories.map((c: Categorie) => [c.id, c.nom]))
  const abos = new Map(state.abonnements.map((a) => [a.id, a.nom]))
  const cName = (id: string) => (id ? clientName(clients.get(id)) : '')
  const pName = (id: string) => (id ? (projets.get(id)?.nom ?? 'Projet inconnu') : '')
  const catName = (id: string) => (id ? (cats.get(id) ?? 'Sans catégorie') : 'Sans catégorie')
  const withMeta = <T extends Meta>(head: string[], list: T[], cells: (x: T) => (string | number)[]) => [
    [...head, ...META_HEAD],
    ...list.map((x) => [...cells(x), ...metaCells(x)]),
  ]

  switch (name) {
    case 'clients':
      return withMeta(['Nom', 'Entreprise', 'Activité', 'Ville', 'E-mail', 'Téléphone', 'Notes'], state.clients, (c) => [
        c.nom, c.entreprise, c.activite, c.ville, c.email, c.telephone, c.notes,
      ])
    case 'projets':
      return withMeta(
        ['Nom', 'Client', 'Type', 'Statut', 'Montant prévu', 'Date de début', 'Date de livraison', 'Part Jérémy (%)', 'Part Matheis (%)'],
        state.projets,
        (p: Projet) => [p.nom, cName(p.clientId), p.type, p.statut, p.montantPrevu, p.dateDebut, p.dateLivraison, p.partJeremy, round2(100 - p.partJeremy)],
      )
    case 'recettes':
      return withMeta(
        [
          'N° de facture', 'Date de facture', "Date d'encaissement", 'Échéance', 'Client', 'Projet', 'Libellé', 'Montant', 'Mode de règlement', 'Statut saisi',
          'Statut réel', 'Justificatif', 'Relances',
        ],
        state.recettes,
        (r) => [
          r.numeroFacture, r.dateFacture, r.dateEncaissement, r.dateEcheance, cName(r.clientId), pName(r.projetId), r.libelle, r.montant, r.mode, r.statut,
          statutOf(r), ouiNon(!!r.justificatif), r.relances?.length ?? 0,
        ],
      )
    case 'depenses':
      return withMeta(
        [
          'Date', 'Fournisseur', 'Libellé', 'Catégorie', 'Montant TTC', 'Mode de paiement', 'Payé par', 'À rembourser', 'Remboursé le', 'Justificatif', 'Projet',
          'Récurrente', 'Abonnement',
        ],
        state.depenses,
        (d) => [
          d.date, d.fournisseur, d.libelle, catName(d.categorieId), d.montant, d.mode, PAYE_PAR_LABEL[d.payePar] ?? d.payePar, ouiNon(d.aRembourser),
          d.rembourseLe, ouiNon(!!d.justificatif), pName(d.projetId), ouiNon(d.recurrente), d.abonnementId ? (abos.get(d.abonnementId) ?? '') : '',
        ],
      )
    case 'abonnements':
      return withMeta(
        ['Nom', 'Fournisseur', 'Montant', 'Fréquence', 'Coût mensuel', 'Prochain prélèvement', 'Actif', 'Utilisé', 'Catégorie', 'Payé par', 'Notes'],
        state.abonnements,
        (a) => [
          a.nom, a.fournisseur, a.montant, a.frequence === 'mensuel' ? 'Mensuel' : 'Annuel', coutMensuel(a), a.prochainPrelevement, ouiNon(a.actif),
          ouiNon(a.utilise), catName(a.categorieId), PAYE_PAR_LABEL[a.payePar] ?? a.payePar, a.notes,
        ],
      )
    case 'declarations':
      return withMeta(
        ['Période', 'Début', 'Fin', 'CA déclaré', 'Cotisations', 'Date limite', 'Statut', 'Déclarée le', 'Payée le'],
        state.declarations,
        (d) => [d.periode, d.debut, d.fin, d.caDeclare, d.cotisations, d.dateLimite, d.statut, d.declareeLe, d.payeeLe],
      )
    case 'categories':
      return withMeta(['Nom', 'Ordre', 'Mots-clés'], [...state.categories].sort((a, b) => a.ordre - b.ordre), (c) => [c.nom, c.ordre, c.motsCles])
    case 'journal':
      return [
        ['Date', 'Utilisateur', 'Action', 'Type', 'Élément', 'Motif', 'Détails'],
        ...state.journal.map((j) => [fdt(j.at), userName(j.by), cap(j.action), ENTITY_LABEL[j.entity] ?? j.entity, j.label, j.motif ?? '', j.details ?? '']),
      ]
  }
}

/** CSV d'une table complète, lignes archivées comprises. */
export function exportTableCSV(name: TableName, state: ExportState): Promise<void> {
  return downloadCSV(`FLUX-${name}-${today()}.csv`, tableRows(name, state))
}

/** Toutes les tables, l'une après l'autre (petit délai pour que le navigateur accepte chaque téléchargement). */
export async function exportAllCSV(state: ExportState) {
  for (const [i, name] of TABLE_NAMES.entries()) {
    if (i > 0) await wait(450)
    await exportTableCSV(name, state)
  }
}
