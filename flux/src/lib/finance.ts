// ─────────────────────────────────────────────────────────────────────────────
// Tous les calculs financiers de FLUX, en fonctions pures.
//
// Règle de la micro-entreprise : les cotisations se calculent sur le chiffre
// d'affaires ENCAISSÉ, à la date d'encaissement réel (pas la date de facture).
// Pas de TVA sur les ventes (art. 293 B du CGI) ; dépenses saisies en TTC.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Abonnement, Categorie, Client, Declaration, DeclarationStatut, Depense, Periodicite, Projet, ProjetType, Recette, RecetteStatut, Settings, UserId,
} from '../types'
import {
  addDays, addMonths, cap, diffDays, endOfMonth, endOfQuarter, endOfYear, fdate, fromISO, inRange, MOIS, monthLabel, monthShort, quarterOf,
  startOfMonth, startOfQuarter, startOfYear, toISO, today,
} from './dates'
import { round2 } from './format'
import type { PeriodFilter, PeriodKind } from '../store'

export interface FluxData {
  recettes: Recette[]
  depenses: Depense[]
  projets: Projet[]
  clients: Client[]
  categories: Categorie[]
  abonnements: Abonnement[]
  declarations: Declaration[]
  settings: Settings
}

const live = <T extends { archived?: unknown }>(l: T[]) => l.filter((x) => !x.archived)
const sum = (l: number[]) => round2(l.reduce((a, b) => a + b, 0))

// ── Périodes ────────────────────────────────────────────────────────────────

export const rangeFor = (kind: Exclude<PeriodKind, 'perso'>, ref: string): PeriodFilter => {
  if (kind === 'mois') return { kind, ref, from: startOfMonth(ref), to: endOfMonth(ref) }
  if (kind === 'trimestre') return { kind, ref, from: startOfQuarter(ref), to: endOfQuarter(ref) }
  return { kind, ref, from: startOfYear(ref), to: endOfYear(ref) }
}

export const shiftPeriod = (p: PeriodFilter, dir: -1 | 1): PeriodFilter => {
  if (p.kind === 'perso') {
    const len = diffDays(p.to, p.from) + 1
    return { ...p, from: addDays(p.from, dir * len), to: addDays(p.to, dir * len) }
  }
  const step = p.kind === 'mois' ? 1 : p.kind === 'trimestre' ? 3 : 12
  return rangeFor(p.kind, addMonths(startOfMonth(p.ref), dir * step))
}

export const periodLabel = (p: PeriodFilter) => {
  if (p.kind === 'mois') return cap(monthLabel(p.ref))
  if (p.kind === 'trimestre') return `${quarterOf(p.ref)}${quarterOf(p.ref) === 1 ? 'er' : 'e'} trimestre ${p.ref.slice(0, 4)}`
  if (p.kind === 'annee') return `Année ${p.ref.slice(0, 4)}`
  return `Du ${fdate(p.from)} au ${fdate(p.to)}`
}

/** La période précédente de même longueur, pour les comparaisons. */
export const previousPeriod = (p: PeriodFilter) => shiftPeriod(p, -1)

// ── Recettes ────────────────────────────────────────────────────────────────

/** Statut réel : une facture non réglée dont l'échéance est passée est « En retard ». */
export const statutOf = (r: Recette, ref = today()): RecetteStatut => {
  if (r.statut === 'Annulée') return 'Annulée'
  if (r.statut === 'Encaissée' && r.dateEncaissement) return 'Encaissée'
  if (r.dateEcheance && r.dateEcheance < ref) return 'En retard'
  if (r.statut === 'En retard') return 'En retard'
  return 'En attente'
}

export const isEncaissee = (r: Recette) => !r.archived && r.statut === 'Encaissée' && !!r.dateEncaissement

export const caEncaisse = (recettes: Recette[], from: string, to: string) =>
  sum(recettes.filter((r) => isEncaissee(r) && inRange(r.dateEncaissement, from, to)).map((r) => r.montant))

export const aEncaisser = (recettes: Recette[], ref = today()) =>
  live(recettes)
    .map((r) => ({ r, statut: statutOf(r, ref) }))
    .filter((x) => x.statut === 'En attente' || x.statut === 'En retard')
    .sort((a, b) => (a.statut === b.statut ? (a.r.dateEcheance || a.r.dateFacture).localeCompare(b.r.dateEcheance || b.r.dateFacture) : a.statut === 'En retard' ? -1 : 1))

export const joursDeRetard = (r: Recette, ref = today()) => (r.dateEcheance ? Math.max(0, diffDays(ref, r.dateEcheance)) : 0)

/** Prochain numéro de facture : F-2026-001, F-2026-002… */
export const nextInvoiceNumber = (recettes: Recette[], settings: Settings, date = today()) => {
  const year = date.slice(0, 4)
  const prefix = `${settings.prefixeFacture || 'F'}-${year}-`
  const max = recettes.reduce((m, r) => {
    if (!r.numeroFacture?.startsWith(prefix)) return m
    const n = Number.parseInt(r.numeroFacture.slice(prefix.length), 10)
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return prefix + String(max + 1).padStart(3, '0')
}

// ── Dépenses ────────────────────────────────────────────────────────────────

export const depensesTotal = (depenses: Depense[], from: string, to: string) =>
  sum(live(depenses).filter((d) => inRange(d.date, from, to)).map((d) => d.montant))

export const depensesParCategorie = (depenses: Depense[], categories: Categorie[], from: string, to: string) => {
  const map = new Map<string, number>()
  for (const d of live(depenses)) if (inRange(d.date, from, to)) map.set(d.categorieId, (map.get(d.categorieId) ?? 0) + d.montant)
  return [...map.entries()]
    .map(([id, total]) => ({ id, nom: categories.find((c) => c.id === id)?.nom ?? 'Sans catégorie', total: round2(total) }))
    .sort((a, b) => b.total - a.total)
}

export const sansJustificatif = (depenses: Depense[]) => live(depenses).filter((d) => !d.justificatif)

export const notesDeFrais = (depenses: Depense[]) => live(depenses).filter((d) => d.payePar !== 'pro' && d.aRembourser)
export const notesDues = (depenses: Depense[], who?: UserId) =>
  notesDeFrais(depenses).filter((d) => !d.rembourseLe && (!who || d.payePar === who))
export const totalDu = (depenses: Depense[], who: UserId) => sum(notesDues(depenses, who).map((d) => d.montant))

// ── Cotisations ─────────────────────────────────────────────────────────────

export const tauxTotal = (s: Settings) => round2(s.tauxCotisations + (s.vlActif ? s.tauxVL : 0) + s.tauxCFP)

export const cotisationsDetail = (ca: number, s: Settings) => {
  const sociales = round2((ca * s.tauxCotisations) / 100)
  const vl = s.vlActif ? round2((ca * s.tauxVL) / 100) : 0
  const cfp = round2((ca * s.tauxCFP) / 100)
  return { sociales, vl, cfp, total: round2(sociales + vl + cfp) }
}
export const cotisations = (ca: number, s: Settings) => cotisationsDetail(ca, s).total

/** Ce qu'il faut mettre de côté pour une recette donnée. */
export const aMettreDeCote = (montant: number, s: Settings) => cotisations(montant, s)

// ── Synthèse d'une période ──────────────────────────────────────────────────

export const synthese = (d: FluxData, from: string, to: string) => {
  const ca = caEncaisse(d.recettes, from, to)
  const dep = depensesTotal(d.depenses, from, to)
  const cot = cotisations(ca, d.settings)
  return { ca, depenses: dep, cotisations: cot, resultat: round2(ca - dep - cot) }
}

export interface MonthPoint {
  key: string
  label: string
  recettes: number
  depenses: number
  cotisations: number
  resultat: number
}

/** Les 12 mois qui se terminent au mois de `ref`. */
export const douzeMois = (d: FluxData, ref = today()): MonthPoint[] => {
  const out: MonthPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(startOfMonth(ref), -i)
    const s = synthese(d, m, endOfMonth(m))
    out.push({ key: m.slice(0, 7), label: monthShort(m), recettes: s.ca, depenses: s.depenses, cotisations: s.cotisations, resultat: s.resultat })
  }
  return out
}

// ── Périodes URSSAF ─────────────────────────────────────────────────────────

export const periodKey = (date: string, p: Periodicite) => (p === 'mensuelle' ? date.slice(0, 7) : `${date.slice(0, 4)}-T${quarterOf(date)}`)

export const periodBounds = (key: string) => {
  const y = key.slice(0, 4)
  if (key.includes('-T')) {
    const q = Number(key.slice(-1))
    const debut = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
    return { debut, fin: endOfQuarter(debut), label: `${q}${q === 1 ? 'er' : 'e'} trimestre ${y}` }
  }
  const debut = key + '-01'
  return { debut, fin: endOfMonth(debut), label: cap(monthLabel(debut)) }
}

/**
 * Date limite de déclaration et de paiement.
 * Mensuelle : dernier jour du mois suivant. Trimestrielle : 30/04, 31/07, 31/10, 31/01.
 */
export const dateLimite = (key: string) => {
  const { fin } = periodBounds(key)
  return endOfMonth(addMonths(startOfMonth(fin), 1))
}

export interface UrssafPeriod {
  key: string
  debut: string
  fin: string
  label: string
  ca: number
  detail: ReturnType<typeof cotisationsDetail>
  dateLimite: string
  statut: DeclarationStatut | 'En cours'
  declaration?: Declaration
  nbRecettes: number
}

export const urssafPeriods = (d: FluxData, ref = today()): UrssafPeriod[] => {
  const p = d.settings.periodicite
  const encaissees = d.recettes.filter(isEncaissee)
  const first = [...encaissees.map((r) => r.dateEncaissement), ...live(d.declarations).map((x) => x.debut)].sort()[0] ?? ref
  // On part du premier encaissement (ou de la première déclaration saisie) : pas de périodes fantômes
  // d'avant l'utilisation de FLUX.
  const start = first
  const keys: string[] = []
  let cur = startOfMonth(start)
  while (cur <= ref) {
    const k = periodKey(cur, p)
    if (!keys.includes(k)) keys.push(k)
    cur = addMonths(cur, 1)
  }
  return keys
    .map((key) => {
      const b = periodBounds(key)
      const rs = encaissees.filter((r) => inRange(r.dateEncaissement, b.debut, b.fin))
      const declaration = live(d.declarations).find((x) => x.id === key)
      // Une fois déclarée, la période garde le CA déclaré, même si une recette est corrigée après.
      const ca = declaration && declaration.statut !== 'À faire' ? declaration.caDeclare : sum(rs.map((r) => r.montant))
      const detail = declaration && declaration.statut !== 'À faire' ? { ...cotisationsDetail(ca, d.settings), total: declaration.cotisations } : cotisationsDetail(ca, d.settings)
      const statut: UrssafPeriod['statut'] = declaration?.statut ?? (b.fin < ref ? 'À faire' : 'En cours')
      return { key, ...b, ca, detail, dateLimite: dateLimite(key), statut, declaration, nbRecettes: rs.length }
    })
    .reverse()
}

/** Cotisations calculées mais pas encore payées : la provision à garder. */
export const provisionUrssaf = (d: FluxData, ref = today(), since = '0000-01-01') =>
  sum(
    urssafPeriods(d, ref)
      .filter((p) => p.statut !== 'Payée' && p.fin >= since)
      .map((p) => p.detail.total),
  )

// ── Trésorerie ──────────────────────────────────────────────────────────────

/**
 * Trésorerie estimée du compte pro, à partir du solde de départ saisi dans Réglages :
 * + recettes encaissées − dépenses payées par le compte pro − notes de frais remboursées − URSSAF payée.
 * La trésorerie DISPONIBLE retire encore la provision URSSAF et les notes de frais dues.
 */
export const tresorerie = (d: FluxData, ref = today()) => {
  const since = d.settings.dateSoldeInitial || '0000-01-01'
  const encaisse = sum(d.recettes.filter((r) => isEncaissee(r) && r.dateEncaissement >= since && r.dateEncaissement <= ref).map((r) => r.montant))
  const deps = live(d.depenses)
  const payePro = sum(deps.filter((x) => x.payePar === 'pro' && x.date >= since && x.date <= ref).map((x) => x.montant))
  const rembourse = sum(deps.filter((x) => x.payePar !== 'pro' && x.aRembourser && x.rembourseLe && x.rembourseLe >= since && x.rembourseLe <= ref).map((x) => x.montant))
  const urssafPayee = sum(live(d.declarations).filter((x) => x.statut === 'Payée' && x.payeeLe && x.payeeLe >= since && x.payeeLe <= ref).map((x) => x.cotisations))
  const solde = round2(d.settings.soldeInitial + encaisse - payePro - rembourse - urssafPayee)
  const provision = provisionUrssaf(d, ref, since)
  const notes = sum(notesDues(d.depenses).map((x) => x.montant))
  return { solde, provision, notes, disponible: round2(solde - provision - notes), encaisse, payePro, rembourse, urssafPayee }
}

// ── Seuils ──────────────────────────────────────────────────────────────────

export type Niveau = 'ok' | 'attention' | 'critique'
export const niveauOf = (ratio: number): Niveau => (ratio >= 0.95 ? 'critique' : ratio >= 0.8 ? 'attention' : 'ok')

export interface Seuil {
  key: 'tva' | 'tvaMajore' | 'micro'
  label: string
  seuil: number
  ca: number
  ratio: number
  niveau: Niveau
  /** Date à laquelle le seuil est (ou serait) atteint, si c'est dans l'année. */
  date: string | null
  depasse: boolean
  finAnnee: number
  texte: string
}

/** Date à laquelle le CA cumulé de l'année a franchi `montant`, s'il l'a franchi. */
const dateFranchissement = (recettes: Recette[], year: string, montant: number) => {
  let cumul = 0
  const rs = recettes.filter((r) => isEncaissee(r) && r.dateEncaissement.startsWith(year)).sort((a, b) => a.dateEncaissement.localeCompare(b.dateEncaissement))
  for (const r of rs) {
    cumul += r.montant
    if (cumul >= montant) return r.dateEncaissement
  }
  return null
}

export const seuils = (d: FluxData, ref = today()): Seuil[] => {
  const year = ref.slice(0, 4)
  const debut = `${year}-01-01`
  const ca = caEncaisse(d.recettes, debut, ref)
  const ecoules = diffDays(ref, debut) + 1
  const total = diffDays(`${year}-12-31`, debut) + 1
  const parJour = ca / Math.max(ecoules, 1)
  const finAnnee = round2(parJour * total)

  const one = (key: Seuil['key'], label: string, seuil: number): Seuil => {
    const ratio = seuil > 0 ? ca / seuil : 0
    const passe = seuil > 0 && ca >= seuil ? dateFranchissement(d.recettes, year, seuil) : null
    let date: string | null = passe
    let texte: string
    if (seuil <= 0) texte = 'Seuil non renseigné dans Réglages.'
    else if (passe) texte = `Seuil franchi le ${fdate(passe)}.`
    else if (ca <= 0) texte = 'Aucun encaissement cette année pour l’instant.'
    else {
      const jours = Math.ceil((seuil - ca) / parJour)
      const cible = addDays(ref, jours)
      if (cible <= `${year}-12-31`) {
        date = cible
        texte = `À ce rythme, seuil atteint le ${fdate(cible).slice(0, 5)}.`
      } else texte = `À ce rythme, pas atteint cette année (≈ ${Math.round(finAnnee).toLocaleString('fr-FR')} € fin décembre).`
    }
    return { key, label, seuil, ca, ratio, niveau: niveauOf(ratio), date, depasse: !!passe, finAnnee, texte }
  }
  return [
    one('tva', 'Franchise en base de TVA', d.settings.seuilTVA),
    one('tvaMajore', 'Seuil de TVA majoré', d.settings.seuilTVAMajore),
    one('micro', 'Plafond micro-entreprise', d.settings.plafondMicro),
  ]
}

// ── Projets ─────────────────────────────────────────────────────────────────

export const projetStats = (p: Projet, d: FluxData) => {
  const rs = live(d.recettes).filter((r) => r.projetId === p.id)
  const encaisse = sum(rs.filter(isEncaissee).map((r) => r.montant))
  const enAttente = sum(rs.filter((r) => ['En attente', 'En retard'].includes(statutOf(r))).map((r) => r.montant))
  const deps = live(d.depenses).filter((x) => x.projetId === p.id)
  const depenses = sum(deps.map((x) => x.montant))
  const marge = round2(encaisse - depenses)
  const cot = cotisations(encaisse, d.settings)
  const margeNette = round2(marge - cot)
  const partJ = round2((margeNette * p.partJeremy) / 100)
  return {
    recettes: rs,
    depensesListe: deps,
    encaisse,
    enAttente,
    reste: round2(Math.max(0, p.montantPrevu - encaisse)),
    depenses,
    marge,
    margePct: encaisse > 0 ? marge / encaisse : 0,
    cotisations: cot,
    margeNette,
    partJeremy: partJ,
    partMatheis: round2(margeNette - partJ),
    avancement: p.montantPrevu > 0 ? Math.min(1, encaisse / p.montantPrevu) : 0,
  }
}

export const rentabiliteParType = (d: FluxData) => {
  const map = new Map<ProjetType, { type: ProjetType; nb: number; encaisse: number; depenses: number; marge: number }>()
  for (const p of live(d.projets)) {
    if (p.statut === 'Annulé') continue
    const s = projetStats(p, d)
    const cur = map.get(p.type) ?? { type: p.type, nb: 0, encaisse: 0, depenses: 0, marge: 0 }
    cur.nb++
    cur.encaisse += s.encaisse
    cur.depenses += s.depenses
    cur.marge += s.marge
    map.set(p.type, cur)
  }
  return [...map.values()]
    .map((x) => ({ ...x, encaisse: round2(x.encaisse), depenses: round2(x.depenses), marge: round2(x.marge), margePct: x.encaisse > 0 ? x.marge / x.encaisse : 0 }))
    .sort((a, b) => b.marge - a.marge)
}

// ── Clients ─────────────────────────────────────────────────────────────────

export const topClients = (d: FluxData, from: string, to: string) => {
  const map = new Map<string, { total: number; nb: number }>()
  for (const r of d.recettes) {
    if (!isEncaissee(r) || !inRange(r.dateEncaissement, from, to)) continue
    const cur = map.get(r.clientId) ?? { total: 0, nb: 0 }
    cur.total += r.montant
    cur.nb++
    map.set(r.clientId, cur)
  }
  return [...map.entries()]
    .map(([id, v]) => ({ client: d.clients.find((c) => c.id === id), id, total: round2(v.total), nb: v.nb }))
    .sort((a, b) => b.total - a.total)
}

export const clientName = (c?: Client) => (c ? c.entreprise || c.nom : 'Client inconnu')

// ── Répartition associés ────────────────────────────────────────────────────

export const repartition = (d: FluxData, from: string, to: string) => {
  const part = (projetId: string) => {
    const p = projetId ? d.projets.find((x) => x.id === projetId) : undefined
    return (p ? p.partJeremy : d.settings.partDefautJeremy) / 100
  }
  const out = { jeremy: { ca: 0, cotisations: 0, depenses: 0 }, matheis: { ca: 0, cotisations: 0, depenses: 0 } }
  for (const r of d.recettes) {
    if (!isEncaissee(r) || !inRange(r.dateEncaissement, from, to)) continue
    const k = part(r.projetId)
    const cot = cotisations(r.montant, d.settings)
    out.jeremy.ca += r.montant * k
    out.matheis.ca += r.montant * (1 - k)
    out.jeremy.cotisations += cot * k
    out.matheis.cotisations += cot * (1 - k)
  }
  for (const x of live(d.depenses)) {
    if (!inRange(x.date, from, to)) continue
    const k = part(x.projetId)
    out.jeremy.depenses += x.montant * k
    out.matheis.depenses += x.montant * (1 - k)
  }
  const fin = (who: UserId) => {
    const o = out[who]
    const resultat = round2(o.ca - o.cotisations - o.depenses)
    const du = totalDu(d.depenses, who)
    return { ca: round2(o.ca), cotisations: round2(o.cotisations), depenses: round2(o.depenses), resultat, du, solde: round2(resultat + du) }
  }
  return { jeremy: fin('jeremy'), matheis: fin('matheis') }
}

// ── Abonnements ─────────────────────────────────────────────────────────────

export const coutMensuel = (a: Abonnement) => round2(a.frequence === 'mensuel' ? a.montant : a.montant / 12)
export const coutAnnuel = (a: Abonnement) => round2(a.frequence === 'mensuel' ? a.montant * 12 : a.montant)
export const nextEcheance = (a: Abonnement) => addMonths(a.prochainPrelevement, a.frequence === 'mensuel' ? 1 : 12)

/** Prélèvements arrivés à échéance, en attente de confirmation. */
export const echeancesAConfirmer = (abos: Abonnement[], ref = today()) =>
  live(abos).filter((a) => a.actif && a.prochainPrelevement && a.prochainPrelevement <= ref).sort((a, b) => a.prochainPrelevement.localeCompare(b.prochainPrelevement))

export const echeancesAVenir = (abos: Abonnement[], jours = 15, ref = today()) =>
  live(abos)
    .filter((a) => a.actif && a.prochainPrelevement > ref && a.prochainPrelevement <= addDays(ref, jours))
    .sort((a, b) => a.prochainPrelevement.localeCompare(b.prochainPrelevement))

// ── Motivation ──────────────────────────────────────────────────────────────

/** Nombre de jours de la série « sans justificatif manquant ». */
export const serieJours = (depuis: string, ref = today()) => (depuis ? Math.max(0, diffDays(ref, depuis)) : 0)

/** Nom du mois précédent, pour les messages (« septembre »). */
export const moisPrecedentNom = (ref = today()) => MOIS[fromISO(addMonths(startOfMonth(ref), -1)).getMonth()]!

export const isoWeekLabel = (monday: string) => `semaine du ${fdate(monday).slice(0, 5)} au ${fdate(addDays(monday, 6)).slice(0, 5)}`

export { toISO }
