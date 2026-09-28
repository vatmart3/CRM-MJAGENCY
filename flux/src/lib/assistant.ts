// ─────────────────────────────────────────────────────────────────────────────
// Assistant de FLUX : répond en français aux questions sur les chiffres.
//
// L'IA (Claude, via api/ai.ts) est essayée d'abord avec un paquet de données
// compact. Si elle n'est pas configurée ou échoue, un moteur local, gratuit et
// fondé sur des règles, répond aux questions courantes. Tous les calculs passent
// par lib/finance.ts : rien n'est recalculé ici.
// ─────────────────────────────────────────────────────────────────────────────

import { Categorie, Client, Depense, PAYE_PAR_LABEL, Recette, USERS, UserId } from '../types'
import {
  aEncaisser, caEncaisse, clientName, coutAnnuel, coutMensuel, depensesParCategorie, FluxData, joursDeRetard, notesDues, periodLabel, projetStats,
  provisionUrssaf, rangeFor, rentabiliteParType, sansJustificatif, seuils, statutOf, synthese, tauxTotal, topClients, totalDu, tresorerie, urssafPeriods,
  isEncaissee,
} from './finance'
import {
  addDays, addMonths, cap, diffDays, endOfMonth, fdate, fdateShort, inRange, MOIS, monthLabel, quarterOf, startOfMonth, startOfWeek, startOfYear,
} from './dates'
import { eur, normalize, num, pct, plural, round2 } from './format'
import { AiUnavailable, callAI } from './ai'

export interface Answer {
  reponse: string
  chiffres: { label: string; valeur: string }[]
  suggestions: string[]
  source: 'ia' | 'local'
}

/** Les données dont l'assistant a besoin (le store FLUX les contient toutes). */
export type AssistantState = FluxData

/** Questions d'exemple, affichées en puces sur la page Assistant. */
export const EXEMPLES = [
  'Combien j’ai dépensé en logiciels ce trimestre ?',
  'Quel client m’a rapporté le plus cette année ?',
  'Est-ce que je risque de dépasser le seuil de TVA ?',
  'Combien je dois à l’URSSAF ?',
  'Quelles factures sont en retard ?',
  'Qu’est-ce que je garde ce mois-ci ?',
]

const live = <T extends { archived?: unknown }>(l: T[]) => l.filter((x) => !x.archived)
const sum = (l: number[]) => round2(l.reduce((a, b) => a + b, 0))

// ═════════════════════════════════════════════════════════════════════════════
// 1. Paquet de données pour l'IA
// ═════════════════════════════════════════════════════════════════════════════

const MAX_LIGNES = 1500

/** Un paquet compact et lisible des données, envoyé avec chaque question. */
export function buildContext(state: AssistantState, today: string) {
  const s = state.settings
  const clients = live(state.clients)
  const projets = live(state.projets)
  const categories = live(state.categories)
  const cliNom = (id: string) => (id ? clientName(state.clients.find((c) => c.id === id)) : '')
  const projNom = (id: string) => (id ? (state.projets.find((p) => p.id === id)?.nom ?? '') : '')
  const catNom = (id: string) => state.categories.find((c) => c.id === id)?.nom ?? 'Sans catégorie'
  const debut = startOfYear(addMonths(startOfYear(today), -12))

  const mois = []
  for (let i = 23; i >= 0; i--) {
    const m = addMonths(startOfMonth(today), -i)
    mois.push({ mois: m.slice(0, 7), ...synthese(state, m, endOfMonth(m)) })
  }

  const recettes = live(state.recettes)
    .map((r) => ({ r, statut: statutOf(r, today) }))
    .filter(({ r, statut }) => (r.dateEncaissement || r.dateFacture || '') >= debut || statut === 'En attente' || statut === 'En retard')
    .sort((a, b) => (b.r.dateEncaissement || b.r.dateFacture).localeCompare(a.r.dateEncaissement || a.r.dateFacture))
    .slice(0, MAX_LIGNES)
    .map(({ r, statut }) => ({
      encaissement: r.dateEncaissement || null,
      facture: r.dateFacture || null,
      echeance: r.dateEcheance || null,
      numero: r.numeroFacture || undefined,
      client: cliNom(r.clientId),
      projet: projNom(r.projetId) || undefined,
      libelle: r.libelle,
      montant: r.montant,
      statut,
      mode: r.mode,
      relances: r.relances?.length || undefined,
    }))

  const depenses = live(state.depenses)
    .filter((d) => d.date >= debut)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_LIGNES)
    .map((d) => ({
      date: d.date,
      fournisseur: d.fournisseur,
      categorie: catNom(d.categorieId),
      libelle: d.libelle || undefined,
      montant: d.montant,
      payePar: PAYE_PAR_LABEL[d.payePar],
      justificatif: !!d.justificatif,
      projet: projNom(d.projetId) || undefined,
    }))

  const annee = today.slice(0, 4)
  return {
    aujourdhui: today,
    entreprise: { nom: s.entreprise.nom, titulaire: s.entreprise.titulaire, mentionTVA: s.entreprise.mentionTVA },
    reglages: {
      tauxCotisations: s.tauxCotisations,
      versementLiberatoire: s.vlActif ? s.tauxVL : 0,
      tauxCFP: s.tauxCFP,
      tauxTotal: tauxTotal(s),
      seuilTVA: s.seuilTVA,
      seuilTVAMajore: s.seuilTVAMajore,
      plafondMicro: s.plafondMicro,
      periodiciteURSSAF: s.periodicite,
      objectifMensuel: s.objectifMensuel,
      delaiPaiementJours: s.delaiPaiementJours,
    },
    categories: categories.map((c) => c.nom),
    mois,
    recettes,
    depenses,
    clients: clients.map((c) => ({
      nom: clientName(c),
      contact: c.entreprise && c.nom !== c.entreprise ? c.nom : undefined,
      activite: c.activite || undefined,
      ville: c.ville || undefined,
      caAnnee: caEncaisse(state.recettes.filter((r) => r.clientId === c.id), `${annee}-01-01`, today),
    })),
    projets: projets.map((p) => {
      const st = projetStats(p, state)
      return {
        nom: p.nom,
        client: cliNom(p.clientId),
        type: p.type,
        statut: p.statut,
        debut: p.dateDebut || undefined,
        livraison: p.dateLivraison || undefined,
        montantPrevu: p.montantPrevu,
        encaisse: st.encaisse,
        enAttente: st.enAttente,
        depenses: st.depenses,
        marge: st.marge,
        margeNette: st.margeNette,
        partJeremyPct: p.partJeremy,
      }
    }),
    rentabiliteParType: rentabiliteParType(state).map((t) => ({ type: t.type, projets: t.nb, encaisse: t.encaisse, depenses: t.depenses, marge: t.marge })),
    abonnements: live(state.abonnements).map((a) => ({
      nom: a.nom,
      fournisseur: a.fournisseur,
      montant: a.montant,
      frequence: a.frequence,
      coutMensuel: coutMensuel(a),
      coutAnnuel: coutAnnuel(a),
      actif: a.actif,
      utilise: a.utilise,
      prochainPrelevement: a.prochainPrelevement || undefined,
      categorie: catNom(a.categorieId),
    })),
    urssaf: urssafPeriods(state, today)
      .slice(0, 8)
      .map((p) => ({ periode: p.label, debut: p.debut, fin: p.fin, caEncaisse: p.ca, cotisations: p.detail.total, dateLimite: p.dateLimite, statut: p.statut })),
    provisionUrssaf: provisionUrssaf(state, today, s.dateSoldeInitial || '0000-01-01'),
    tresorerie: { ...tresorerie(state, today), soldeDepart: s.soldeInitial, dateSoldeDepart: s.dateSoldeInitial },
    seuils: seuils(state, today).map((x) => ({ seuil: x.label, montant: x.seuil, caAnnee: x.ca, pourcentage: Math.round(x.ratio * 100), projectionFinAnnee: x.finAnnee, depasse: x.depasse, texte: x.texte })),
    notesDeFraisDues: {
      jeremy: totalDu(state.depenses, 'jeremy'),
      matheis: totalDu(state.depenses, 'matheis'),
      lignes: notesDues(state.depenses).map((d) => ({ date: d.date, qui: USERS[d.payePar as UserId]?.prenom ?? d.payePar, fournisseur: d.fournisseur, montant: d.montant })),
    },
    justificatifsManquants: { nombre: sansJustificatif(state.depenses).length, montant: sum(sansJustificatif(state.depenses).map((d) => d.montant)) },
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Moteur local
// ═════════════════════════════════════════════════════════════════════════════

/** Texte normalisé : minuscules, sans accents ni ponctuation, espaces simples. */
const norm = (s: string) =>
  ' ' +
  normalize(s)
    .replace(/[’'`´]/g, ' ')
    .replace(/[?!.,;:()«»"/\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() +
  ' '

const stem = (w: string) => (w.length > 3 ? w.replace(/(aux|s|x)$/, (m) => (m === 'aux' ? 'al' : '')) : w)

// ── Périodes ────────────────────────────────────────────────────────────────

interface Periode {
  from: string
  to: string
  /** Libellé court pour les chiffres clés : « Septembre 2026 ». */
  label: string
  /** Complément de phrase : « ce mois-ci (septembre 2026) », « en 2025 ». */
  phrase: string
  /** Période précédente de même longueur, pour la comparaison. */
  prev?: { from: string; to: string; que: string }
  explicit: boolean
}

const MOIS_N = MOIS.map((m) => normalize(m))
const MOIS_ABBR: Record<string, number> = { janv: 0, fevr: 1, avr: 3, juil: 6 }
const MOIS_RE = new RegExp(`\\b(${[...MOIS_N, ...Object.keys(MOIS_ABBR)].join('|')})\\b(?: (20\\d{2}))?`)
const moisIndex = (w: string) => (MOIS_N.includes(w) ? MOIS_N.indexOf(w) : (MOIS_ABBR[w] ?? -1))
const isoMonth = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`

const PREV_YEAR_RE = /\b(annee (derniere|passee|precedente)|l an (dernier|passe)|an dernier)\b/

function monthPeriode(ref: string, today: string, phrase?: string): Periode {
  const from = startOfMonth(ref)
  const to = endOfMonth(ref)
  const courant = from === startOfMonth(today)
  const pm = addMonths(from, -1)
  const prev = courant
    ? { from: pm, to: addDays(pm, Math.min(diffDays(today, from), diffDays(endOfMonth(pm), pm))), que: 'qu’à la même date le mois dernier' }
    : { from: pm, to: endOfMonth(pm), que: `qu’en ${monthLabel(pm)}` }
  return { from, to, label: cap(monthLabel(from)), phrase: phrase ?? (courant ? `ce mois-ci (${monthLabel(from)})` : `en ${monthLabel(from)}`), prev, explicit: true }
}

function quarterPeriode(ref: string, today: string, phrase?: string): Periode {
  const r = rangeFor('trimestre', ref)
  const lbl = periodLabel(r)
  const courant = r.from <= today && today <= r.to
  const pr = rangeFor('trimestre', addMonths(r.from, -3))
  const prev = courant
    ? { from: pr.from, to: addDays(pr.from, diffDays(today, r.from)), que: 'qu’à la même date le trimestre dernier' }
    : { from: pr.from, to: pr.to, que: `qu’au ${periodLabel(pr).toLowerCase()}` }
  return { from: r.from, to: r.to, label: lbl, phrase: phrase ?? (courant ? `ce trimestre (${lbl.toLowerCase()})` : `au ${lbl.toLowerCase()}`), prev, explicit: true }
}

function yearPeriode(year: number, today: string, phrase?: string): Periode {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const courant = today.startsWith(String(year))
  const prev = courant
    ? { from: `${year - 1}-01-01`, to: addDays(`${year - 1}-01-01`, diffDays(today, from)), que: 'qu’à la même date l’an dernier' }
    : { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, que: `qu’en ${year - 1}` }
  return { from, to, label: `Année ${year}`, phrase: phrase ?? (courant ? `cette année (${year})` : `en ${year}`), prev, explicit: true }
}

function weekPeriode(monday: string, phrase: string, courant: boolean, today: string): Periode {
  const to = addDays(monday, 6)
  const pm = addDays(monday, -7)
  return {
    from: monday,
    to,
    label: `Semaine du ${fdateShort(monday)}`,
    phrase: `${phrase} (du ${fdateShort(monday)} au ${fdateShort(to)})`,
    prev: courant ? { from: pm, to: addDays(pm, diffDays(today, monday)), que: 'qu’à la même date la semaine dernière' } : { from: pm, to: addDays(pm, 6), que: 'que la semaine précédente' },
    explicit: true,
  }
}

const sincePeriode = (from: string, today: string, phrase: string): Periode => ({ from, to: today, label: `Depuis le ${fdate(from)}`, phrase, explicit: true })

/** L'année d'un mois cité sans année : l'année en cours, sauf si ce mois n'est pas encore arrivé. */
const yearForMonth = (m: number, t: string, today: string) => {
  const y = Number(today.slice(0, 4))
  const explicitYear = t.match(/\b(20\d{2})\b/)
  if (explicitYear) return Number(explicitYear[1])
  if (PREV_YEAR_RE.test(t)) return y - 1
  return m > Number(today.slice(5, 7)) - 1 ? y - 1 : y
}

const NOMBRES: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, neuf: 9, douze: 12, dix: 10, onze: 11, huit: 8 }

/** Lit la période citée dans la question, ou null si aucune. */
export function parsePeriode(question: string, today: string): Periode | null {
  const t = norm(question)
  const y = Number(today.slice(0, 4))

  // « entre mars et juin », « de janvier à avril »
  const range = t.match(new RegExp(`\\b(?:entre|de|du mois de) (${MOIS_N.join('|')}) (?:et|a|au mois de) (${MOIS_N.join('|')})\\b`))
  if (range) {
    const m1 = moisIndex(range[1]!)
    const m2 = moisIndex(range[2]!)
    const y2 = yearForMonth(m2, t, today)
    const y1 = m1 <= m2 ? y2 : y2 - 1
    const from = isoMonth(y1, m1)
    const to = endOfMonth(isoMonth(y2, m2))
    return { from, to, label: `${cap(MOIS[m1]!)} → ${MOIS[m2]} ${y2}`, phrase: `de ${MOIS[m1]} à ${MOIS[m2]} ${y2}`, explicit: true }
  }

  // Mois cité : « en mars », « septembre 2025 », « depuis janvier »
  const mm = t.match(MOIS_RE)
  if (mm) {
    const m = moisIndex(mm[1]!)
    const year = mm[2] ? Number(mm[2]) : yearForMonth(m, t, today)
    const ref = isoMonth(year, m)
    if (new RegExp(`\\b(depuis|a partir de|des) (le debut de |le mois de |debut )?${mm[1]}\\b`).test(t))
      return sincePeriode(ref, today, year === y ? `depuis ${MOIS[m]}` : `depuis ${MOIS[m]} ${year}`)
    return monthPeriode(ref, today, `en ${monthLabel(ref)}`)
  }

  // Trimestre numéroté : « T2 », « 1er trimestre 2025 »
  const tq = t.match(/\b(?:t|q)([1-4])\b/) ?? t.match(/\b(1er|premier|1e|2e|2eme|deuxieme|second|3e|3eme|troisieme|4e|4eme|quatrieme)(?: trimestre)\b/)
  if (tq && (/\btrimestre\b/.test(t) || /\b(?:t|q)[1-4]\b/.test(t))) {
    const w = tq[1]!
    const q = /^[1-4]$/.test(w) ? Number(w) : /^(1|prem)/.test(w) ? 1 : /^(2|deux|second)/.test(w) ? 2 : /^(3|trois)/.test(w) ? 3 : 4
    const explicitYear = t.match(/\b(20\d{2})\b/)
    let year = explicitYear ? Number(explicitYear[1]) : PREV_YEAR_RE.test(t) ? y - 1 : y
    if (!explicitYear && !PREV_YEAR_RE.test(t) && q > quarterOf(today)) year = y - 1
    return quarterPeriode(isoMonth(year, (q - 1) * 3), today)
  }

  if (/\b(trimestre (dernier|passe|precedent)|dernier trimestre)\b/.test(t)) return quarterPeriode(addMonths(startOfMonth(today), -3), today, undefined)
  if (/\btrimestre\b/.test(t)) return quarterPeriode(today, today)

  if (/\b(mois (dernier|passe|precedent)|dernier mois)\b/.test(t)) {
    const ref = addMonths(startOfMonth(today), -1)
    return monthPeriode(ref, today, `le mois dernier (${monthLabel(ref)})`)
  }
  const nMois = t.match(/\b(\d{1,2}|deux|trois|quatre|cinq|six|huit|neuf|dix|onze|douze) derniers mois\b/)
  if (nMois || /\b(sur (un|1) an|12 mois|sur l annee glissante)\b/.test(t)) {
    const n = nMois ? (NOMBRES[nMois[1]!] ?? Number(nMois[1])) : 12
    const from = addDays(addMonths(today, -n), 1)
    return { from, to: today, label: `${n} derniers mois`, phrase: `sur les ${n} derniers mois`, explicit: true }
  }
  if (/\b(ce mois|mois ci|mois en cours|mois actuel|du mois)\b/.test(t)) return monthPeriode(today, today)

  if (/\b(semaine (derniere|passee|precedente)|derniere semaine)\b/.test(t)) return weekPeriode(addDays(startOfWeek(today), -7), 'la semaine dernière', false, today)
  if (/\b(cette semaine|semaine en cours|de la semaine|la semaine)\b/.test(t)) return weekPeriode(startOfWeek(today), 'cette semaine', true, today)

  if (/\baujourd hui\b/.test(t)) return { from: today, to: today, label: 'Aujourd’hui', phrase: 'aujourd’hui', explicit: true }
  if (/\bhier\b/.test(t)) {
    const h = addDays(today, -1)
    return { from: h, to: h, label: 'Hier', phrase: `hier (${fdate(h)})`, explicit: true }
  }

  if (/\bdepuis (le )?(debut|1er janvier|premier janvier) (de )?(l )?annee\b|\bdepuis le (1er|premier) janvier\b/.test(t)) return sincePeriode(`${y}-01-01`, today, 'depuis le 1er janvier')
  const depuisAn = t.match(/\bdepuis (20\d{2})\b/)
  if (depuisAn) return sincePeriode(`${depuisAn[1]}-01-01`, today, `depuis ${depuisAn[1]}`)

  if (PREV_YEAR_RE.test(t)) return yearPeriode(y - 1, today, `l’année dernière (${y - 1})`)
  const an = t.match(/\b(20\d{2})\b/)
  if (an) return yearPeriode(Number(an[1]), today)
  if (/\b(cette annee|annee en cours|de l annee|sur l annee|cette annee ci|annuel|annuelle|par an|l annee|cet exercice)\b/.test(t)) return yearPeriode(y, today)

  if (/\b(depuis (le debut|toujours|la creation|le lancement)|de tous les temps|au total depuis|en tout)\b/.test(t))
    return { from: '0000-01-01', to: '9999-12-31', label: 'Depuis le début', phrase: 'depuis le début', explicit: true }
  return null
}

const defaultMonth = (today: string): Periode => ({ ...monthPeriode(today, today), explicit: false })
const defaultYear = (today: string): Periode => ({ ...yearPeriode(Number(today.slice(0, 4)), today), explicit: false })

// ── Reconnaissance des catégories, fournisseurs et clients ─────────────────

/** Mots trop génériques pour désigner une catégorie à eux seuls. */
const CAT_STOP = new Set(['des', 'les', 'noms', 'nom', 'de', 'et', 'frais', 'autre', 'total', 'station', 'google', 'carte', 'cartes', 'support', 'visite', 'papier', 'autoroute', 'apple', 'abonnement', 'prestataire'])
/** Synonymes courants, rattachés à un mot du nom de la catégorie. */
const CAT_SYN: Record<string, string[]> = {
  logiciel: ['logiciel', 'saas', 'appli', 'application', 'outil', 'licence', 'ia', 'abonnement', 'abos', 'abo'],
  deplacement: ['deplacement', 'voyage', 'transport', 'trajet', 'voiture', 'carburant', 'essence', 'gasoil', 'kilometre', 'hotel', 'avion', 'route'],
  publicite: ['publicite', 'pub', 'pubs', 'marketing', 'annonce', 'sponsorise', 'ads', 'prospection', 'communication'],
  hebergement: ['hebergement', 'serveur', 'domaine', 'hosting', 'dns'],
  materiel: ['materiel', 'ordi', 'ordinateur', 'pc', 'mac', 'equipement', 'informatique'],
  formation: ['formation', 'cours', 'apprentissage'],
  sous: ['freelance', 'soustraitance', 'traitance', 'prestataires'],
  bancaire: ['bancaire', 'banque', 'commission'],
  impression: ['impression', 'imprimerie', 'print', 'nfc'],
}

const tokens = (t: string) => t.trim().split(' ').filter(Boolean)

function matchCategorie(t: string, categories: Categorie[]): Categorie | undefined {
  const words = tokens(t).map(stem)
  let best: { c?: Categorie; score: number } = { score: 0 }
  for (const c of live(categories)) {
    const nomWords = tokens(norm(c.nom)).map(stem)
    const kws = new Set<string>()
    for (const w of [...nomWords, ...tokens(norm(c.motsCles)).map(stem)]) if (w.length > 2 && !CAT_STOP.has(w)) kws.add(w)
    for (const w of nomWords) for (const syn of CAT_SYN[w] ?? []) kws.add(stem(syn))
    let score = 0
    for (const k of kws) if (words.some((w) => w === k || (w.length >= 7 && k.length >= 7 && w.slice(0, 7) === k.slice(0, 7)))) score += k.length + (nomWords.includes(k) ? 3 : 0)
    if (score > best.score) best = { c, score }
  }
  return best.c
}

const NAME_STOP = new Set(['client', 'clients', 'sarl', 'sas', 'sasu', 'eurl', 'societe', 'entreprise', 'france', 'total', 'service', 'services', 'store', 'shop', 'station', 'depenses', 'depense', 'combien', 'chez', 'projet', 'mois', 'annee', 'semaine', 'trimestre', 'plus', 'site', 'agence'])

const nameMatches = (t: string, name: string) => {
  const n = norm(name).trim()
  if (!n) return 0
  if (t.includes(` ${n} `)) return 100 + n.length
  const distinct = tokens(n).filter((w) => w.length >= 4 && !NAME_STOP.has(w))
  return distinct.some((w) => t.includes(` ${w} `)) ? Math.max(...distinct.map((w) => (t.includes(` ${w} `) ? w.length : 0))) : 0
}

function matchFournisseur(t: string, depenses: Depense[]): string | undefined {
  const noms = [...new Set(live(depenses).map((d) => d.fournisseur.trim()).filter(Boolean))]
  const chez = t.match(/\bchez (?:l |le |la |les )?([a-z0-9]+)/)
  if (chez) {
    const w = chez[1]!
    const hit = noms.find((n) => tokens(norm(n)).some((x) => x.startsWith(w) || (w.length >= 4 && w.startsWith(x))))
    if (hit) return hit
  }
  let best = { n: '', score: 0 }
  for (const n of noms) {
    const s = nameMatches(t, n)
    if (s > best.score) best = { n, score: s }
  }
  return best.n || undefined
}

function matchClient(t: string, clients: Client[]): Client | undefined {
  let best: { c?: Client; score: number } = { score: 0 }
  for (const c of live(clients)) {
    const s = Math.max(nameMatches(t, c.entreprise), nameMatches(t, c.nom))
    if (s > best.score) best = { c, score: s }
  }
  return best.c
}

// ── Intentions ──────────────────────────────────────────────────────────────

type Intent =
  | 'aide' | 'urssaf' | 'seuil' | 'notes' | 'treso' | 'retards' | 'objectif' | 'justificatifs' | 'abonnements' | 'projets' | 'meilleurClient'
  | 'meilleurMois' | 'resultat' | 'depenses' | 'ca' | 'inconnu'

const SPEND_RE = /\b(depens\w*|achat\w*|achete\w*|paye pour|coute\w*|coutent|frais|sorties?|debourse\w*|claque\w*|budget|decaiss\w*)\b/
const CA_RE = /\b(chiffre d affaires?|encaiss\w*|recettes?|factur\w*|rentre\w*|vendu|ventes?|revenus?|touche|rapporte\w*)\b/
const ABO_SPEND_RE = /\b(depens\w*|achat\w*|achete\w*|paye\w*|decaiss\w*)\b/

function detectIntent(t: string, raw: string, d: AssistantState): Intent {
  // « ça » devient « ca » une fois les accents retirés : on regarde le texte d'origine pour le sigle CA.
  const hasCA = /(^|[^\p{L}])(ca|c\.a\.?)([^\p{L}]|$)/iu.test(raw) || /chiffre d.affaires?/i.test(normalize(raw))
  const spend = SPEND_RE.test(t)
  const ca = hasCA || CA_RE.test(t)

  if (/^ (comment )?(ca|ça) va\b/.test(t) || /\bcomment (ca|ça) va\b/.test(t)) return 'resultat'
  if (t.trim() === '' || /\b(aide|help|que sais tu|tu sais faire|quoi demander|exemples?|bonjour|salut|hello|coucou)\b/.test(t)) return 'aide'
  if (/\bnotes? de frais\b|\brembours\w*|\b(dois|doit|devons|devez|dette|du|due)\b.*\b(jeremy|matheis)\b|\b(jeremy|matheis)\b.*\b(avance\w*|paye de sa poche|perso)\b/.test(t)) return 'notes'
  if (/\burssaf\b|\bcotis\w*|\bcharges sociales\b|\bdeclar\w*|\bde cote\b|\bprovision\w*|\bimpots?\b/.test(t)) return 'urssaf'
  if (/\bseuil\w*|\bplafond\w*|\bfranchise\b|\btva\b|\bdepass\w*/.test(t)) return 'seuil'
  if (/\btreso\w*|\bsolde\b|\bcompte pro\b|\ben banque\b|\bsur le compte\b|\bdisponible\b|\bliquidit\w*|\bcash\b/.test(t)) return 'treso'
  if (/\bretard\w*|\bimpaye\w*|\brelanc\w*|\ba encaisser\b|\ben attente\b|\bme doi(t|vent)\b|\bqui (me|nous) doi|\bpas (encore )?(ete )?(paye|regle)\w*|\bnon (paye|regle)\w*|\bfactures? (ouvertes?|en cours|non reglees?)\b|\bcreances?\b/.test(t))
    return 'retards'
  if (/\bobjectif\w*/.test(t)) return 'objectif'
  if (/\bjustif\w*|\b(tickets?|pieces?|recus?) manquant\w*|\bsans (ticket|justif\w*|piece)\b/.test(t)) return 'justificatifs'
  if (/\binutilis\w*|\bresilier\b|\bcouper\b|\bne (me )?sers? (plus|pas|a rien)|\bservent? a rien\b|\bpas utilise\w*/.test(t)) return 'abonnements'
  if (/\b(abonnements?|abos?|souscriptions?|prelevements?)\b/.test(t) && !ABO_SPEND_RE.test(t)) return 'abonnements'
  if (/\bmeilleur mois\b|\bpire mois\b|\bmois record\b|\bmeilleurs mois\b|\bquel mois\b/.test(t)) return 'meilleurMois'
  const superlatif = /\b(plus|moins|meilleur\w*|pire|top|classement|principa\w*|gros|premier)\b/.test(t)
  if (/\bclients?\b/.test(t) && superlatif && !/\bprojets?\b/.test(t)) return 'meilleurClient'
  if (/\bqui (m a|ma|nous a|a) (le plus )?(rapporte|paye)\w*/.test(t)) return 'meilleurClient'
  if (/\bprojets?\b|\brentab\w*|\bprestations?\b|\btype de (projet|site|mission|presta\w*)\b|\bmissions?\b/.test(t)) return 'projets'
  if (/\bbenefice\w*|\bresultat\w*|\bje garde\b|\bgarder\b|\bme reste\b|\bil (me )?reste\b|\bnet\b|\bgagne\w*|\bmarge\b|\bdans ma poche\b|\bbilan\b|\bsynthese\b|\bcomment (ca|ça) va\b|\bou j en suis\b/.test(t)) return 'resultat'
  if (spend && ca) return 'resultat'
  if (spend) return 'depenses'
  if (ca) return 'ca'
  if (matchCategorie(t, d.categories) && /\bcombien\b|\btotal\b|\bmontant\b/.test(t)) return 'depenses'
  if (/\bchez\b/.test(t) || (matchFournisseur(t, d.depenses) && /\bcombien\b|\btotal\b/.test(t))) return 'depenses'
  if (matchClient(t, d.clients)) return 'ca'
  if (/\b(abonnements?|abos?)\b/.test(t)) return 'abonnements'
  return 'inconnu'
}

// ── Petites aides de rédaction ──────────────────────────────────────────────

const ans = (reponse: string, chiffres: Answer['chiffres'] = [], suggestions: string[] = []): Answer => ({
  reponse,
  chiffres: chiffres.slice(0, 4),
  suggestions: suggestions.slice(0, 3),
  source: 'local',
})

/** « C'est 12 % de plus qu'en août 2026 (4 500,00 €). » */
function comparaison(cur: number, prev: number, que: string, sujet = 'C’est') {
  if (prev <= 0) return ''
  const v = (cur - prev) / prev
  if (Math.abs(v) < 0.005) return ` ${sujet} autant ${que} (${eur(prev)}).`
  if (cur / prev >= 3) return ` ${sujet} ${num(Math.round((cur / prev) * 10) / 10)} fois plus ${que} (${eur(prev)}).`
  return ` ${sujet} ${pct(Math.abs(v) * 100)} ${v > 0 ? 'de plus' : 'de moins'} ${que} (${eur(prev)}).`
}

/** « Oui » ou « Non » quand la question compare à la période précédente (« je dépense plus que le mois dernier ? »). */
const ouiNon = (cur: number, prev: number, sens: Sens) => (!sens || prev <= 0 ? '' : (sens === 'plus') === cur > prev ? 'Oui. ' : 'Non. ')
type Sens = 'plus' | 'moins' | null

/** « 3e trimestre 2026 », « septembre 2026 » : libellé de période en minuscule initiale. */
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const plusieurs = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`)

// ── Réponses ────────────────────────────────────────────────────────────────

function repDepenses(t: string, raw: string, d: AssistantState, today: string, per: Periode | null, sens: Sens): Answer {
  const four = matchFournisseur(t, d.depenses)
  // Le nom du fournisseur ne doit pas désigner en plus une catégorie (« OVH » est un mot-clé d'Hébergement).
  const cat = matchCategorie(four ? t.replace(norm(four), ' ') : t, d.categories)
  const chezInconnu = !four && /\bchez\b/.test(t) && raw.match(/chez\s+(?:l['’]\s*|le |la |les )?([^?!.,;]+)/i)?.[1]?.trim()
  const filtre = (x: Depense) => (!cat || x.categorieId === cat.id) && (!four || normalize(x.fournisseur.trim()) === normalize(four))
  const deps = live(d.depenses).filter(filtre)
  const quoi = [cat && `en ${cat.nom}`, four && `chez ${four}`].filter(Boolean).join(' ')

  if (chezInconnu && !cat)
    return ans(`Je ne trouve aucune dépense chez « ${chezInconnu} ». Vérifie l’orthographe du fournisseur tel qu’il est saisi dans tes dépenses.`, [], ['Total des dépenses cette année', 'Quelles sont mes plus grosses dépenses ce mois-ci ?'])

  let p = per ?? defaultMonth(today)
  let dans = deps.filter((x) => inRange(x.date, p.from, p.to))
  let repli = ''
  // Sans période précisée et rien ce mois-ci pour un filtre : on élargit à l'année.
  if (!per && (cat || four) && dans.length === 0) {
    p = defaultYear(today)
    dans = deps.filter((x) => inRange(x.date, p.from, p.to))
    repli = `Rien ce mois-ci. `
  }
  const total = sum(dans.map((x) => x.montant))
  const n = dans.length

  if (n === 0) {
    const derniere = [...deps].sort((a, b) => b.date.localeCompare(a.date))[0]
    return ans(
      `Aucune dépense${quoi ? ' ' + quoi : ''} ${p.phrase}.${derniere ? ` La dernière date du ${fdate(derniere.date)} (${derniere.fournisseur}, ${eur(derniere.montant)}).` : ''}`,
      [],
      ['Total des dépenses cette année', cat ? `Dépenses en ${cat.nom.toLowerCase()} l’année dernière` : 'Dépenses par catégorie ce trimestre'],
    )
  }

  const prevTotal = p.prev ? sum(deps.filter((x) => inRange(x.date, p.prev!.from, p.prev!.to)).map((x) => x.montant)) : null
  const cmp = p.prev && prevTotal !== null ? comparaison(total, prevTotal, p.prev.que) : ''
  const annee = defaultYear(today)
  const totalAnnee = !per && (cat || four) && !repli ? sum(deps.filter((x) => inRange(x.date, annee.from, annee.to)).map((x) => x.montant)) : 0

  const chiffres: Answer['chiffres'] = [{ label: `Dépenses · ${p.label}`, valeur: eur(total) }]
  let detail = ''
  if (!cat && !four) {
    const parCat = depensesParCategorie(dans, d.categories, p.from, p.to).slice(0, 3)
    detail = parCat.length > 1 ? ` Premiers postes : ${plusieurs(parCat.map((c) => `${c.nom} (${eur(c.total)})`))}.` : ` Uniquement en ${parCat[0]!.nom}.`
    for (const c of parCat) chiffres.push({ label: c.nom, valeur: eur(c.total) })
  } else if (!four) {
    const parF = new Map<string, number>()
    for (const x of dans) parF.set(x.fournisseur || 'Sans fournisseur', (parF.get(x.fournisseur || 'Sans fournisseur') ?? 0) + x.montant)
    const top = [...parF.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    if (top.length > 1 || n > 1) detail = ` Surtout ${plusieurs(top.map(([f, v]) => `${f} (${eur(v)})`))}.`
    chiffres.push({ label: 'Nombre', valeur: plural(n, 'dépense') })
    if (prevTotal) chiffres.push({ label: 'Période précédente', valeur: eur(prevTotal) })
  } else {
    const derniere = [...dans].sort((a, b) => b.date.localeCompare(a.date))[0]!
    detail = n > 1 ? ` La dernière, le ${fdate(derniere.date)} : ${eur(derniere.montant)}.` : ` Le ${fdate(derniere.date)}${derniere.libelle ? ` (${derniere.libelle})` : ''}.`
    chiffres.push({ label: 'Nombre', valeur: plural(n, 'dépense') })
  }
  if (totalAnnee > total) chiffres.push({ label: `Depuis le 1er janvier`, valeur: eur(totalAnnee) })

  const reponse = `${ouiNon(total, prevTotal ?? 0, sens)}${repli}Tu as dépensé ${eur(total)}${quoi ? ' ' + quoi : ''} ${p.phrase}, sur ${plural(n, 'dépense')}.${detail}${cmp}`
  const suggestions = cat
    ? [`Dépenses en ${cat.nom.toLowerCase()} l’année dernière`, 'Total des dépenses cette année', 'Combien me coûtent mes abonnements ?']
    : ['Dépenses de ce trimestre', 'Qu’est-ce que je garde ce mois-ci ?', 'Combien me coûtent mes abonnements ?']
  return ans(reponse, chiffres, suggestions)
}

function repCA(t: string, d: AssistantState, today: string, per: Periode | null, sens: Sens): Answer {
  const client = matchClient(t, d.clients)
  const recettes = client ? d.recettes.filter((r) => r.clientId === client.id) : d.recettes
  let p = per ?? (client ? defaultYear(today) : defaultMonth(today))
  if (client && !per && caEncaisse(recettes, p.from, p.to) === 0) p = { from: '0000-01-01', to: '9999-12-31', label: 'Depuis le début', phrase: 'depuis le début', explicit: false }
  const ca = caEncaisse(recettes, p.from, p.to)
  const n = recettes.filter((r) => isEncaissee(r) && inRange(r.dateEncaissement, p.from, p.to)).length
  const prev = p.prev ? caEncaisse(recettes, p.prev.from, p.prev.to) : null
  const nom = client ? clientName(client) : ''

  if (ca === 0) {
    const attente = aEncaisser(recettes, today)
    return ans(
      `Aucun encaissement${client ? ` de ${nom}` : ''} ${p.phrase}.${attente.length ? ` ${plural(attente.length, 'facture')} ${attente.length > 1 ? 'restent' : 'reste'} à encaisser pour ${eur(sum(attente.map((x) => x.r.montant)))}.` : ''}`,
      [],
      ['CA encaissé cette année', 'Quelles factures sont en retard ?'],
    )
  }

  let reponse = client
    ? `${ouiNon(ca, prev ?? 0, sens)}${nom} t’a rapporté ${eur(ca)} ${p.phrase}, en ${plural(n, 'paiement')}.`
    : `${ouiNon(ca, prev ?? 0, sens)}Tu as encaissé ${eur(ca)} ${p.phrase}, en ${plural(n, 'encaissement')}.`
  if (p.prev && prev !== null) reponse += comparaison(ca, prev, p.prev.que)
  const chiffres: Answer['chiffres'] = [{ label: `CA encaissé · ${p.label}`, valeur: eur(ca) }]
  if (prev) chiffres.push({ label: 'Période précédente', valeur: eur(prev) })

  const obj = d.settings.objectifMensuel
  const moisEntier = p.from === startOfMonth(p.from) && p.to === endOfMonth(p.from)
  if (!client && moisEntier && obj > 0) {
    reponse += ` Objectif mensuel atteint à ${pct((ca / obj) * 100)}.`
    chiffres.push({ label: 'Objectif mensuel', valeur: `${pct((ca / obj) * 100)} de ${eur(obj)}` })
  }
  const courant = p.from <= today && today <= p.to
  if (courant) {
    const attente = aEncaisser(recettes, today)
    if (attente.length) {
      const tot = sum(attente.map((x) => x.r.montant))
      reponse += ` Et ${eur(tot)} facturés restent à encaisser.`
      chiffres.push({ label: 'À encaisser', valeur: eur(tot) })
    }
  }
  if (client) {
    const total = caEncaisse(recettes, '0000-01-01', '9999-12-31')
    if (total !== ca) chiffres.push({ label: 'Depuis le début', valeur: eur(total) })
  }
  return ans(reponse, chiffres, ['Quel client m’a rapporté le plus cette année ?', 'Qu’est-ce que je garde ce mois-ci ?', 'Est-ce que je risque de dépasser le seuil de TVA ?'])
}

function repMeilleurClient(t: string, d: AssistantState, today: string, per: Periode | null): Answer {
  const p = per ?? defaultYear(today)
  const moins = /\bmoins\b|\bpire\b|\bplus petit\b/.test(t)
  const top = topClients(d, p.from, p.to)
  if (!top.length) return ans(`Aucun encaissement ${p.phrase} : pas encore de classement des clients.`, [], ['Quel client m’a rapporté le plus l’année dernière ?', 'Quelles factures sont en retard ?'])
  const ca = caEncaisse(d.recettes, p.from, p.to)
  if (moins && top.length > 1) {
    const z = top[top.length - 1]!
    return ans(
      `${cap(p.phrase)}, le client qui t’a le moins rapporté est ${clientName(z.client)} : ${eur(z.total)} encaissés en ${plural(z.nb, 'paiement')}, soit ${pct((z.total / ca) * 100)} de ton CA.`,
      [...top].reverse().slice(0, 3).map((x) => ({ label: clientName(x.client), valeur: eur(x.total) })),
      ['Quel client m’a rapporté le plus cette année ?', 'Quelles factures sont en retard ?'],
    )
  }
  const [a, ...rest] = top
  let reponse = `${cap(p.phrase)}, c’est ${clientName(a!.client)} qui t’a rapporté le plus : ${eur(a!.total)} encaissés en ${plural(a!.nb, 'paiement')}, soit ${pct((a!.total / ca) * 100)} de ton CA.`
  if (rest.length) reponse += ` ${rest.length > 1 ? 'Suivent' : 'Suit'} ${plusieurs(rest.slice(0, 2).map((x) => `${clientName(x.client)} (${eur(x.total)})`))}.`
  if (a!.total / ca > 0.5 && top.length > 1) reponse += ' Attention à la dépendance à un seul client.'
  return ans(
    reponse,
    top.slice(0, 3).map((x, i) => ({ label: `${i + 1}. ${clientName(x.client)}`, valeur: eur(x.total) })).concat(top.length > 3 ? [{ label: `${top.length} clients au total`, valeur: eur(ca) }] : []),
    [`Combien m’a rapporté ${clientName(a!.client)} depuis le début ?`, 'Quel projet est le plus rentable ?', 'CA encaissé cette année'],
  )
}

function repSeuil(t: string, d: AssistantState, today: string): Answer {
  const all = seuils(d, today)
  const [tva, majore, micro] = all as [ReturnType<typeof seuils>[number], ReturnType<typeof seuils>[number], ReturnType<typeof seuils>[number]]
  const focusMicro = /\b(plafond|micro|chiffre maximum|ca max\w*)\b/.test(t) && !/\btva\b|\bfranchise\b/.test(t)
  const s = focusMicro ? micro : tva
  const annee = today.slice(0, 4)
  const chiffres = all.map((x) => ({ label: x.label, valeur: `${pct(x.ratio * 100)} de ${eur(x.seuil)}` }))

  if (s.seuil <= 0) return ans('Ce seuil n’est pas renseigné dans les Réglages : je ne peux pas faire le calcul.', chiffres, ['CA encaissé cette année'])
  let reponse: string
  const base = `Tu as encaissé ${eur(s.ca)} en ${annee}, soit ${pct(s.ratio * 100)} du ${focusMicro ? 'plafond micro-entreprise' : 'seuil de franchise de TVA'} (${eur(s.seuil)}).`
  if (!focusMicro && majore.depasse)
    reponse = `Oui : le seuil majoré de TVA (${eur(majore.seuil)}) est dépassé depuis le ${fdate(majore.date!)}. La TVA est due à partir de ce jour : vois vite ton comptable pour facturer la TVA.`
  else if (!focusMicro && tva.depasse)
    reponse = `${base} Le seuil a été franchi le ${fdate(tva.date!)} : tu restes en franchise cette année tant que tu ne dépasses pas le seuil majoré (${eur(majore.seuil)}, tu en es à ${pct(majore.ratio * 100)}), mais la TVA s’appliquera au 1er janvier prochain.`
  else if (focusMicro && s.depasse) reponse = `${base} Le plafond est dépassé depuis le ${fdate(s.date!)} : parles-en à ton comptable, un changement de régime est à prévoir.`
  else if (s.date) reponse = `Oui, c’est un risque. ${base} ${s.texte} Anticipe : lisse les encaissements ou prépare le passage à la TVA.`
  else if (s.ca <= 0) reponse = `Non. ${s.texte}`
  else reponse = `Non, pas cette année. ${base} ${s.texte}`
  if (!focusMicro && !tva.depasse && s.ratio >= 0.8 && !s.date) reponse += ' Tu approches quand même des 80 % : garde un œil dessus.'
  return ans(reponse, chiffres, focusMicro ? ['Est-ce que je risque de dépasser le seuil de TVA ?', 'CA encaissé cette année'] : ['Et le plafond micro-entreprise ?', 'CA encaissé cette année', 'Combien je dois à l’URSSAF ?'])
}

function repUrssaf(d: AssistantState, today: string): Answer {
  const periods = urssafPeriods(d, today)
  const taux = tauxTotal(d.settings)
  const impayees = periods.filter((p) => p.statut !== 'Payée' && p.statut !== 'En cours' && p.detail.total > 0).sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))
  const enCours = periods.find((p) => p.statut === 'En cours')
  const enRetard = impayees.filter((p) => p.dateLimite < today)
  const aVenir = impayees.filter((p) => p.dateLimite >= today)
  const du = sum(impayees.map((p) => p.detail.total))
  const chiffres: Answer['chiffres'] = []
  const parts: string[] = []

  if (!periods.some((p) => p.ca > 0) && !impayees.length) return ans(`Aucun encaissement pour l’instant, donc rien à payer à l’URSSAF. Ton taux de cotisations est de ${pct(taux, 1)} du CA encaissé.`, [{ label: 'Taux total', valeur: pct(taux, 1) }])

  if (enRetard.length) {
    const tot = eur(sum(enRetard.map((p) => p.detail.total)))
    parts.push(
      enRetard.length === 1
        ? `Attention : ${lc(enRetard[0]!.label)} n’est pas marqué comme payé alors que l’échéance du ${fdate(enRetard[0]!.dateLimite)} est passée (${tot} de cotisations). Déclare-le vite, ou marque-le comme payé dans URSSAF si c’est fait.`
        : `Attention : ${enRetard.length} périodes échues ne sont pas marquées comme payées (${plusieurs(enRetard.slice(0, 3).map((p) => lc(p.label)))}${enRetard.length > 3 ? '…' : ''}), pour ${tot} de cotisations. Déclare-les vite, ou marque-les comme payées dans URSSAF si c’est fait.`,
    )
    chiffres.push({ label: 'Échu non payé', valeur: tot })
  }
  if (aVenir.length) {
    const p = aVenir[0]!
    parts.push(`Tu dois ${eur(p.detail.total)} à l’URSSAF pour ${lc(p.label)} (CA encaissé ${eur(p.ca)}), à déclarer et payer avant le ${fdate(p.dateLimite)}.`)
    chiffres.push({ label: `Échéance ${fdate(p.dateLimite)}`, valeur: eur(p.detail.total) })
  }
  if (enCours) {
    parts.push(`${aVenir.length || enRetard.length ? 'En plus, l' : 'L'}a période en cours (${lc(enCours.label)}) cumule déjà ${eur(enCours.detail.total)} de cotisations sur ${eur(enCours.ca)} encaissés, à déclarer avant le ${fdate(enCours.dateLimite)}.`)
    chiffres.push({ label: `En cours · à payer le ${fdateShort(enCours.dateLimite)}`, valeur: eur(enCours.detail.total) })
  }
  const provision = round2(du + (enCours?.detail.total ?? 0))
  if (provision > 0) {
    parts.push(`Au total, garde ${eur(provision)} de côté.`)
    chiffres.push({ label: 'À garder de côté', valeur: eur(provision) })
  }
  if (!parts.length) parts.push('Tout est déclaré et payé : rien à devoir à l’URSSAF pour l’instant.')
  chiffres.push({ label: 'Taux total', valeur: pct(taux, 1) })
  return ans(parts.join(' '), chiffres, ['Qu’est-ce que je garde ce mois-ci ?', 'Quelle est ma trésorerie disponible ?', 'Est-ce que je risque de dépasser le seuil de TVA ?'])
}

function repResultat(d: AssistantState, today: string, per: Periode | null): Answer {
  const p = per ?? defaultMonth(today)
  const s = synthese(d, p.from, p.to)
  const chiffres = [
    { label: 'CA encaissé', valeur: eur(s.ca) },
    { label: 'Dépenses', valeur: eur(s.depenses) },
    { label: 'Cotisations', valeur: eur(s.cotisations) },
    { label: 'Résultat', valeur: eur(s.resultat) },
  ]
  if (s.ca === 0 && s.depenses === 0) return ans(`Rien d’enregistré ${p.phrase} : ni encaissement ni dépense.`, [], ['Qu’est-ce que je garde cette année ?', 'CA du mois dernier'])
  let reponse =
    s.resultat >= 0
      ? `${cap(p.phrase)}, tu gardes ${eur(s.resultat)} : ${eur(s.ca)} encaissés, moins ${eur(s.depenses)} de dépenses et ${eur(s.cotisations)} de cotisations URSSAF.`
      : `${cap(p.phrase)}, tu es dans le rouge de ${eur(-s.resultat)} : ${eur(s.ca)} encaissés, pour ${eur(s.depenses)} de dépenses et ${eur(s.cotisations)} de cotisations.`
  if (s.ca > 0 && s.resultat > 0) reponse += ` Soit ${pct((s.resultat / s.ca) * 100)} de ton CA, avant impôt sur le revenu.`
  if (p.prev) {
    const prev = synthese(d, p.prev.from, p.prev.to)
    if (prev.ca || prev.depenses) reponse += comparaison(s.resultat, prev.resultat, p.prev.que, 'Tu gardes')
  }
  return ans(reponse.trim(), chiffres, ['Qu’est-ce que je garde cette année ?', 'Combien je dois à l’URSSAF ?', 'Total des dépenses ce mois-ci'])
}

function repRetards(t: string, d: AssistantState, today: string): Answer {
  const list = aEncaisser(d.recettes, today)
  const retard = list.filter((x) => x.statut === 'En retard').sort((a, b) => b.r.montant - a.r.montant)
  const attente = list.filter((x) => x.statut === 'En attente')
  const totalR = sum(retard.map((x) => x.r.montant))
  const totalA = sum(attente.map((x) => x.r.montant))
  const cli = (r: Recette) => clientName(d.clients.find((c) => c.id === r.clientId))
  const fac = (r: Recette) => (r.numeroFacture ? `la facture ${r.numeroFacture}` : `« ${r.libelle || 'facture'} »`)
  const chiffres: Answer['chiffres'] = [
    { label: 'En retard', valeur: `${eur(totalR)} · ${retard.length}` },
    { label: 'En attente', valeur: `${eur(totalA)} · ${attente.length}` },
  ]

  if (!list.length) return ans('Aucune facture en attente : tout ce que tu as facturé est encaissé.', chiffres, ['CA encaissé ce mois-ci', 'Quel client m’a rapporté le plus cette année ?'])
  if (!retard.length)
    return ans(
      `Aucune facture en retard. ${plural(attente.length, 'facture')} ${attente.length > 1 ? 'sont' : 'est'} en attente pour ${eur(totalA)}, pas encore échue${attente.length > 1 ? 's' : ''}.`,
      chiffres,
      ['CA encaissé ce mois-ci', 'Quelle est ma trésorerie disponible ?'],
    )
  const big = retard[0]!.r
  let reponse = `Tu as ${plural(retard.length, 'facture')} en retard pour ${eur(totalR)}. La plus grosse : ${fac(big)} de ${cli(big)} (${eur(big.montant)}), ${joursDeRetard(big, today)} jours de retard${big.relances?.length ? `, déjà relancée ${big.relances.length} fois` : ''} : relance ${/\brelanc/.test(t) ? 'en priorité' : 'le client'}.`
  if (retard.length > 1) reponse += ` ${retard.length > 2 ? 'Les autres' : 'L’autre'} : ${plusieurs(retard.slice(1, 3).map((x) => `${cli(x.r)} (${eur(x.r.montant)})`))}${retard.length > 3 ? '…' : '.'}`
  if (attente.length) reponse += ` En plus, ${eur(totalA)} sont en attente, pas encore échus.`
  retard.slice(0, 2).forEach((x) => chiffres.push({ label: `${cli(x.r)} · ${joursDeRetard(x.r, today)} j`, valeur: eur(x.r.montant) }))
  return ans(reponse, chiffres, ['Quel client m’a rapporté le plus cette année ?', 'Quelle est ma trésorerie disponible ?'])
}

function repAbonnements(t: string, d: AssistantState, today: string): Answer {
  const actifs = live(d.abonnements).filter((a) => a.actif)
  const mensuel = sum(actifs.map(coutMensuel))
  const inutiles = actifs.filter((a) => !a.utilise).sort((a, b) => coutAnnuel(b) - coutAnnuel(a))
  const eco = sum(inutiles.map(coutAnnuel))
  const chiffres = [
    { label: 'Par mois', valeur: eur(mensuel) },
    { label: 'Par an', valeur: eur(round2(mensuel * 12)) },
    { label: 'Actifs', valeur: String(actifs.length) },
  ]
  if (!actifs.length) return ans('Aucun abonnement actif enregistré. Ajoute-les dans Abonnements pour suivre ce qu’ils te coûtent.', [], ['Total des dépenses ce mois-ci'])
  const focusInutile = /\binutilis\w*|\bresilier\b|\bcouper\b|\bsers?\b|\bservent\b|\bpas utilise/.test(t)
  const cher = [...actifs].sort((a, b) => coutMensuel(b) - coutMensuel(a))[0]!
  let reponse = focusInutile ? '' : `Tes ${plural(actifs.length, 'abonnement actif', 'abonnements actifs')} te coûtent ${eur(mensuel)} par mois, soit ${eur(round2(mensuel * 12))} par an. Le plus cher : ${cher.nom} (${eur(coutMensuel(cher))} par mois).`
  if (inutiles.length) {
    reponse += `${reponse ? ' ' : ''}${plural(inutiles.length, 'abonnement')} ${inutiles.length > 1 ? 'sont marqués' : 'est marqué'} comme inutilisé${inutiles.length > 1 ? 's' : ''} : ${plusieurs(inutiles.slice(0, 3).map((a) => `${a.nom} (${eur(coutAnnuel(a))} par an)`))}. ${inutiles.length > 1 ? 'Les couper' : 'Le couper'} te ferait économiser ${eur(eco)} par an.`
    chiffres.push({ label: 'Économie possible', valeur: `${eur(eco)} / an` })
  } else if (focusInutile) reponse = `Tous tes ${plural(actifs.length, 'abonnement actif', 'abonnements actifs')} sont marqués comme utilisés (${eur(mensuel)} par mois au total). Rien à couper pour l’instant.`
  const prochain = actifs.filter((a) => a.prochainPrelevement >= today).sort((a, b) => a.prochainPrelevement.localeCompare(b.prochainPrelevement))[0]
  if (prochain && !focusInutile) reponse += ` Prochain prélèvement : ${prochain.nom}, le ${fdate(prochain.prochainPrelevement)}.`
  return ans(reponse.trim(), chiffres, ['Combien j’ai dépensé en logiciels ce trimestre ?', 'Total des dépenses cette année'])
}

function repProjets(t: string, d: AssistantState): Answer {
  const parType = /\btype\w*|\bprestations?\b|\bcategorie de projet\b|\bquel genre\b/.test(t)
  const moins = /\bmoins (rentable|bon|interessant)|\bpire\b|\bperd\w*/.test(t)
  if (parType) {
    const types = rentabiliteParType(d).filter((x) => x.encaisse > 0 || x.depenses > 0)
    if (!types.length) return ans('Pas encore assez de projets encaissés pour comparer les types de prestation.', [], ['Quel projet est le plus rentable ?'])
    const list = moins ? [...types].reverse() : types
    const a = list[0]!
    const reponse = `${moins ? 'Le type de prestation le moins rentable' : 'Le type de prestation le plus rentable'} est « ${a.type} » : ${eur(a.marge)} de marge sur ${plural(a.nb, 'projet')} (${eur(a.encaisse)} encaissés, ${pct(a.margePct * 100)} de marge avant cotisations).${list.length > 1 ? ` ${moins ? 'Juste au-dessus' : 'Ensuite'} : ${plusieurs(list.slice(1, 3).map((x) => `${x.type} (${eur(x.marge)})`))}.` : ''}`
    return ans(reponse, list.slice(0, 4).map((x) => ({ label: x.type, valeur: `${eur(x.marge)} · ${pct(x.margePct * 100)}` })), ['Quel projet est le plus rentable ?', 'Quel client m’a rapporté le plus cette année ?'])
  }
  const stats = live(d.projets)
    .filter((p) => p.statut !== 'Annulé')
    .map((p) => ({ p, s: projetStats(p, d) }))
    .filter((x) => x.s.encaisse > 0)
    .sort((a, b) => b.s.marge - a.s.marge)
  if (!stats.length) return ans('Aucun projet n’a encore d’encaissement : impossible de mesurer la rentabilité. Rattache tes recettes à leurs projets.', [], ['Quelles factures sont en retard ?'])
  const list = moins ? [...stats].reverse() : stats
  const a = list[0]!
  const cli = clientName(d.clients.find((c) => c.id === a.p.clientId))
  let reponse = `${moins ? 'Le projet le moins rentable' : 'Le projet le plus rentable'} est « ${a.p.nom} » (${cli}, ${a.p.type}) : ${eur(a.s.encaisse)} encaissés pour ${eur(a.s.depenses)} de dépenses, soit ${eur(a.s.marge)} de marge (${pct(a.s.margePct * 100)}) et ${eur(a.s.margeNette)} après cotisations.`
  if (list.length > 1) reponse += ` ${moins ? 'Juste au-dessus' : 'Ensuite'} : ${plusieurs(list.slice(1, 3).map((x) => `${x.p.nom} (${eur(x.s.marge)})`))}.`
  return ans(reponse, list.slice(0, 4).map((x) => ({ label: x.p.nom, valeur: `${eur(x.s.marge)} · ${pct(x.s.margePct * 100)}` })), ['Quel type de prestation rapporte le plus ?', 'Quel client m’a rapporté le plus cette année ?'])
}

function repNotes(t: string, d: AssistantState): Answer {
  const j = totalDu(d.depenses, 'jeremy')
  const m = totalDu(d.depenses, 'matheis')
  const nj = notesDues(d.depenses, 'jeremy').length
  const nm = notesDues(d.depenses, 'matheis').length
  const chiffres = [
    { label: 'Dû à Jérémy', valeur: eur(j) },
    { label: 'Dû à Matheis', valeur: eur(m) },
  ]
  const who: UserId | null = /\bjeremy\b/.test(t) && !/\bmatheis\b/.test(t) ? 'jeremy' : /\bmatheis\b/.test(t) && !/\bjeremy\b/.test(t) ? 'matheis' : null
  if (who) {
    const v = who === 'jeremy' ? j : m
    const n = who === 'jeremy' ? nj : nm
    const nom = USERS[who].prenom
    if (!v) return ans(`MJAGENCY ne doit rien à ${nom} : aucune note de frais en attente de remboursement.`, chiffres)
    const plusVieille = notesDues(d.depenses, who).sort((a, b) => a.date.localeCompare(b.date))[0]!
    return ans(`MJAGENCY doit ${eur(v)} à ${nom}, sur ${plural(n, 'note')} de frais. La plus ancienne date du ${fdate(plusVieille.date)} (${plusVieille.fournisseur}, ${eur(plusVieille.montant)}). Pense à le rembourser depuis le compte pro.`, chiffres, ['Quelle est ma trésorerie disponible ?'])
  }
  if (!j && !m) return ans('Aucune note de frais en attente : personne n’a avancé d’argent non remboursé.', chiffres)
  return ans(
    `L’entreprise doit ${eur(j)} à Jérémy (${plural(nj, 'note')}) et ${eur(m)} à Matheis (${plural(nm, 'note')}), soit ${eur(round2(j + m))} de notes de frais à rembourser.`,
    chiffres,
    ['Quelle est ma trésorerie disponible ?', 'Combien je dois à l’URSSAF ?'],
  )
}

function repTreso(d: AssistantState, today: string): Answer {
  const t = tresorerie(d, today)
  const s = d.settings
  const chiffres = [
    { label: 'Solde estimé', valeur: eur(t.solde) },
    { label: 'Provision URSSAF', valeur: eur(t.provision) },
    { label: 'Notes de frais dues', valeur: eur(t.notes) },
    { label: 'Disponible', valeur: eur(t.disponible) },
  ]
  let reponse = `Le compte pro devrait afficher environ ${eur(t.solde)}. Une fois retirés la provision URSSAF (${eur(t.provision)}) et les notes de frais dues (${eur(t.notes)}), il te reste ${eur(t.disponible)} vraiment disponibles.`
  if (t.disponible < 0) reponse += ' Attention, c’est négatif : ne dépense rien de plus avant les prochains encaissements.'
  reponse += ` Estimation à partir du solde de départ de ${eur(s.soldeInitial)} au ${fdate(s.dateSoldeInitial)} (à ajuster dans Réglages).`
  return ans(reponse, chiffres, ['Combien je dois à l’URSSAF ?', 'Quelles factures sont en retard ?'])
}

function repObjectif(d: AssistantState, today: string): Answer {
  const obj = d.settings.objectifMensuel
  const from = startOfMonth(today)
  const ca = caEncaisse(d.recettes, from, endOfMonth(today))
  if (!obj) return ans('Aucun objectif mensuel n’est défini. Tu peux en fixer un dans Réglages.', [{ label: 'CA du mois', valeur: eur(ca) }])
  const reste = round2(Math.max(0, obj - ca))
  const jours = diffDays(endOfMonth(today), today)
  const reponse =
    reste === 0
      ? `Objectif atteint : ${eur(ca)} encaissés ce mois-ci pour un objectif de ${eur(obj)} (${pct((ca / obj) * 100)}). Bravo !`
      : `Tu en es à ${eur(ca)} sur ${eur(obj)} ce mois-ci (${pct((ca / obj) * 100)}). Il te manque ${eur(reste)} ${jours > 0 ? `en ${plural(jours, 'jour')}` : 'aujourd’hui'}.`
  const enAttente = sum(aEncaisser(d.recettes, today).map((x) => x.r.montant))
  return ans(
    reponse + (reste > 0 && enAttente > 0 ? ` ${eur(enAttente)} de factures en attente pourraient combler l’écart.` : ''),
    [
      { label: 'Encaissé', valeur: eur(ca) },
      { label: 'Objectif', valeur: eur(obj) },
      { label: 'Reste', valeur: eur(reste) },
    ],
    ['Quelles factures sont en retard ?', 'CA du mois dernier'],
  )
}

function repJustificatifs(d: AssistantState): Answer {
  const manquants = sansJustificatif(d.depenses).sort((a, b) => b.montant - a.montant)
  if (!manquants.length) return ans('Aucun justificatif ne manque : toutes tes dépenses ont leur ticket ou leur facture.', [], ['Total des dépenses cette année'])
  const total = sum(manquants.map((x) => x.montant))
  return ans(
    `Il manque ${plural(manquants.length, 'justificatif')} pour ${eur(total)} de dépenses. Le plus important : ${manquants[0]!.fournisseur} du ${fdate(manquants[0]!.date)} (${eur(manquants[0]!.montant)}). Ajoute-les depuis Dépenses, le scan d’un ticket prend quelques secondes.`,
    [
      { label: 'Manquants', valeur: String(manquants.length) },
      { label: 'Montant concerné', valeur: eur(total) },
    ],
    ['Total des dépenses ce mois-ci'],
  )
}

function repMeilleurMois(t: string, d: AssistantState, today: string, per: Periode | null): Answer {
  const p = per ?? { from: addMonths(startOfMonth(today), -11), to: endOfMonth(today), label: '12 derniers mois', phrase: 'sur les 12 derniers mois', explicit: false }
  const mois: { m: string; ca: number }[] = []
  for (let m = startOfMonth(p.from < '2000-01-01' ? addMonths(startOfMonth(today), -23) : p.from); m <= p.to && m <= today; m = addMonths(m, 1)) mois.push({ m, ca: caEncaisse(d.recettes, m, endOfMonth(m)) })
  const actifs = mois.filter((x) => x.ca > 0)
  if (!actifs.length) return ans(`Aucun encaissement ${p.phrase}.`)
  const pire = /\bpire\b|\bmoins bon\b/.test(t)
  const tri = [...(pire ? mois : actifs)].sort((a, b) => (pire ? a.ca - b.ca : b.ca - a.ca))
  const x = tri[0]!
  return ans(
    `${cap(p.phrase)}, ton ${pire ? 'mois le plus faible' : 'meilleur mois'} est ${monthLabel(x.m)} avec ${eur(x.ca)} encaissés. Moyenne : ${eur(round2(sum(mois.map((y) => y.ca)) / mois.length))} par mois.`,
    tri.slice(0, 3).map((y) => ({ label: cap(monthLabel(y.m)), valeur: eur(y.ca) })),
    ['CA encaissé cette année', 'Quel client m’a rapporté le plus cette année ?'],
  )
}

function repAide(inconnu: boolean): Answer {
  return ans(
    `${inconnu ? 'Je n’ai pas bien compris ta question. ' : ''}Je réponds aux questions sur tes chiffres : dépenses par catégorie ou par fournisseur, CA encaissé, meilleur client, seuils de TVA, URSSAF, ce que tu gardes, factures en retard, abonnements, rentabilité des projets, notes de frais et trésorerie. Précise la période si besoin (« ce trimestre », « en mars », « l’année dernière »).`,
    [],
    [EXEMPLES[0]!, EXEMPLES[1]!, EXEMPLES[2]!],
  )
}

/** Moteur local, gratuit : répond aux questions courantes sans IA. */
export function askLocal(question: string, state: AssistantState, today: string): Answer {
  const t = norm(question)
  // « plus que le mois dernier » : la période visée est la période en cours, comparée à la précédente.
  const cmpRe = /\b(plus|moins|autant) (qu|que) (le |la |l )?(mois|trimestre|annee|semaine|an) (dernier|derniere|passe|passee|precedent|precedente)\b/
  const cmp = t.match(cmpRe)
  const sens: Sens = cmp ? (cmp[1] === 'moins' ? 'moins' : 'plus') : null
  const unite = cmp?.[4]
  // La période visée est la période en cours, comparée à la précédente.
  const per = cmp ? parsePeriode(unite === 'an' || unite === 'annee' ? 'cette annee' : unite === 'semaine' ? 'cette semaine' : `ce ${unite}`, today) : parsePeriode(question, today)
  const intent = detectIntent(t, question, state)
  try {
    switch (intent) {
      case 'aide':
        return repAide(false)
      case 'depenses':
        return repDepenses(t, question, state, today, per, sens)
      case 'ca':
        return repCA(t, state, today, per, sens)
      case 'meilleurClient':
        return repMeilleurClient(t, state, today, per)
      case 'seuil':
        return repSeuil(t, state, today)
      case 'urssaf':
        return repUrssaf(state, today)
      case 'resultat':
        return repResultat(state, today, per)
      case 'retards':
        return repRetards(t, state, today)
      case 'abonnements':
        return repAbonnements(t, state, today)
      case 'projets':
        return repProjets(t, state)
      case 'notes':
        return repNotes(t, state)
      case 'treso':
        return repTreso(state, today)
      case 'objectif':
        return repObjectif(state, today)
      case 'justificatifs':
        return repJustificatifs(state)
      case 'meilleurMois':
        return repMeilleurMois(t, state, today, per)
      default:
        return repAide(true)
    }
  } catch (e) {
    console.warn('[assistant] calcul local en échec', e)
    return ans('Je n’ai pas réussi à calculer cette réponse. Reformule ta question, ou consulte directement le tableau de bord.', [], EXEMPLES.slice(0, 3))
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Point d'entrée
// ═════════════════════════════════════════════════════════════════════════════

const clean = (a: Partial<Answer>): Omit<Answer, 'source'> | null => {
  if (!a || typeof a.reponse !== 'string' || !a.reponse.trim()) return null
  return {
    reponse: a.reponse.trim(),
    chiffres: (Array.isArray(a.chiffres) ? a.chiffres : []).filter((c) => c && c.label && c.valeur).slice(0, 4),
    suggestions: (Array.isArray(a.suggestions) ? a.suggestions : []).filter((s) => typeof s === 'string' && s.trim()).slice(0, 3),
  }
}

/** Pose la question à l'IA, ou au moteur local si elle n'est pas disponible. */
export async function ask(question: string, state: AssistantState, today: string): Promise<Answer> {
  try {
    const data = await callAI<{ result: Partial<Answer> }>('ask', { question, context: buildContext(state, today) })
    const ok = clean(data.result)
    if (ok) return { ...ok, source: 'ia' }
    console.warn('[assistant] réponse IA vide, calcul local')
  } catch (e) {
    if (!(e instanceof AiUnavailable)) console.warn('[assistant] IA en échec, calcul local', e)
  }
  return askLocal(question, state, today)
}

export type { Periode }
