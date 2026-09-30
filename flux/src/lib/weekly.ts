// ─────────────────────────────────────────────────────────────────────────────
// Résumé de la semaine : chaque lundi, FLUX résume la semaine écoulée
// (lundi → dimanche) et propose 1 à 3 actions concrètes. L'IA rédige si elle
// est disponible ; sinon le calcul local fait le travail, gratuitement.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { Rapport } from '../types'
import { alive, useFlux } from '../store'
import {
  aEncaisser, caEncaisse, clientName, cotisationsSur, coutAnnuel, depensesTotal, FluxData, isEncaissee, joursDeRetard, sansJustificatif, seuils,
  synthese, tauxTotal, urssafPeriods,
} from './finance'
import { addDays, fdate, fdateShort, inRange, startOfMonth, startOfWeek, today as todayFn } from './dates'
import { eur, pct, plural, round2 } from './format'
import { AiUnavailable, callAI } from './ai'
import { periodeUrssaf } from './assistant'
import { getSyncStatus, onSyncStatus } from './sync'

export interface WeeklyReport {
  resume: string
  recommandations: string[]
}

const sum = (l: number[]) => round2(l.reduce((a, b) => a + b, 0))

/** Lundi de la semaine précédente : la semaine que résume le rapport du jour. */
export const previousMonday = (ref = todayFn()) => addDays(startOfWeek(ref), -7)

// ── Faits de la semaine ─────────────────────────────────────────────────────

/** Tout ce que l'on sait de la semaine, calculé par lib/finance.ts. */
export function weeklyFacts(state: FluxData, monday: string, ref = todayFn()) {
  const sunday = addDays(monday, 6)
  const pm = addDays(monday, -7)
  const ps = addDays(monday, -1)
  const cli = (id: string) => clientName(state.clients.find((c) => c.id === id))

  const encaissements = state.recettes.filter((r) => isEncaissee(r) && inRange(r.dateEncaissement, monday, sunday)).sort((a, b) => b.montant - a.montant)
  const ca = caEncaisse(state.recettes, monday, sunday)
  const aMettre = cotisationsSur(encaissements, state).total.total
  const depenses = depensesTotal(state.depenses, monday, sunday)
  const nbDepenses = state.depenses.filter((d) => !d.archived && inRange(d.date, monday, sunday)).length

  const ouvertes = aEncaisser(state.recettes, ref)
  const retards = ouvertes.filter((x) => x.statut === 'En retard').map((x) => x.r).sort((a, b) => b.montant - a.montant)
  const nouveauxRetards = retards.filter((r) => inRange(r.dateEcheance, addDays(monday, -1), addDays(sunday, -1)))

  const abosInutiles = state.abonnements.filter((a) => !a.archived && a.actif && !a.utilise).sort((a, b) => coutAnnuel(b) - coutAnnuel(a))
  const manquants = sansJustificatif(state.depenses)

  const periods = urssafPeriods(state, ref)
  const urssafEchues = periods.filter((p) => p.statut !== 'Payée' && p.statut !== 'En cours' && p.dateLimite < ref && p.detail.total > 0)
  const urssafProches = periods
    .filter((p) => p.statut !== 'Payée' && p.dateLimite >= ref && p.dateLimite <= addDays(ref, 21) && p.detail.total > 0)
    .sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))

  const seuilsHauts = seuils(state, ref)
    .filter((s) => s.key !== 'tvaMajore' && s.seuil > 0 && s.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio)

  return {
    monday,
    sunday,
    ca,
    nbEncaissements: encaissements.length,
    plusGrosEncaissement: encaissements[0] ? { client: cli(encaissements[0].clientId), montant: encaissements[0].montant } : null,
    depenses,
    nbDepenses,
    caSemainePrecedente: caEncaisse(state.recettes, pm, ps),
    depensesSemainePrecedente: depensesTotal(state.depenses, pm, ps),
    aMettreDeCote: aMettre,
    // Taux effectif de la semaine : chaque associé a le sien (ACRE).
    tauxCotisations: ca > 0 ? round2((aMettre / ca) * 100) : tauxTotal(state.settings),
    retards: retards.map((r) => ({ client: cli(r.clientId), facture: r.numeroFacture || r.libelle, montant: r.montant, joursDeRetard: joursDeRetard(r, ref), relances: r.relances?.length ?? 0 })),
    nouveauxRetards: nouveauxRetards.map((r) => ({ client: cli(r.clientId), facture: r.numeroFacture || r.libelle, montant: r.montant })),
    enAttente: sum(ouvertes.filter((x) => x.statut === 'En attente').map((x) => x.r.montant)),
    abonnementsInutilises: abosInutiles.map((a) => ({ nom: a.nom, coutAnnuel: coutAnnuel(a) })),
    justificatifsManquants: { nombre: manquants.length, montant: sum(manquants.map((d) => d.montant)) },
    urssafEchues: urssafEchues.map((p) => ({ periode: p.label, cotisations: p.detail.total, dateLimite: p.dateLimite })),
    urssafProches: urssafProches.map((p) => ({ periode: p.label, cotisations: p.detail.total, dateLimite: p.dateLimite, statut: p.statut })),
    seuils: seuilsHauts.map((s) => ({ seuil: s.key === 'micro' ? 'plafond micro-entreprise' : 'seuil de franchise de TVA', pourcentage: Math.round(s.ratio * 100), ca: s.ca, montant: s.seuil, texte: s.texte })),
    moisEnCours: synthese(state, startOfMonth(ref), ref),
  }
}

type Facts = ReturnType<typeof weeklyFacts>

// ── Rédaction locale ────────────────────────────────────────────────────────

const evolution = (cur: number, prev: number) => {
  // Sous 50 €, un pourcentage n'a pas de sens (« +1 378 % »).
  if (prev < 50) return ''
  const v = (cur - prev) / prev
  if (Math.abs(v) < 0.005) return 'stable'
  return `${v > 0 ? '+' : '−'}${pct(Math.abs(v) * 100)}`
}

function resumeOf(f: Facts): string {
  const quand = `Semaine du ${fdateShort(f.monday)} au ${fdateShort(f.sunday)}`
  const phrases: string[] = []
  if (f.ca === 0 && f.depenses === 0) phrases.push(`${quand} : semaine calme, aucun encaissement ni dépense enregistrés.`)
  else {
    const evoCa = evolution(f.ca, f.caSemainePrecedente)
    const evoDep = evolution(f.depenses, f.depensesSemainePrecedente)
    const caTxt = f.ca > 0 ? `${eur(f.ca)} encaissés${evoCa && evoCa !== 'stable' ? ` (${evoCa} par rapport à la semaine d’avant)` : ''}` : 'aucun encaissement'
    const depTxt = f.depenses > 0 ? `${eur(f.depenses)} de dépenses${evoDep && evoDep !== 'stable' ? ` (${evoDep})` : ''}` : 'aucune dépense'
    phrases.push(`${quand} : ${caTxt} et ${depTxt}.`)
  }
  if (f.nouveauxRetards.length) {
    const r = f.nouveauxRetards[0]!
    phrases.push(
      f.nouveauxRetards.length === 1
        ? `Une facture est passée en retard : ${r.client} (${eur(r.montant)}).`
        : `${f.nouveauxRetards.length} factures sont passées en retard, pour ${eur(sum(f.nouveauxRetards.map((x) => x.montant)))}.`,
    )
  } else if (f.plusGrosEncaissement && f.nbEncaissements > 1) phrases.push(`Plus gros encaissement : ${f.plusGrosEncaissement.client} (${eur(f.plusGrosEncaissement.montant)}).`)
  else if (f.plusGrosEncaissement) phrases.push(`Encaissement de la semaine : ${f.plusGrosEncaissement.client}.`)
  const reste = sum(f.retards.map((r) => r.montant)) + f.enAttente
  if (reste > 0 && phrases.length < 3) phrases.push(`Au total, ${eur(round2(reste))} restent à encaisser${f.retards.length ? `, dont ${eur(sum(f.retards.map((r) => r.montant)))} en retard` : ''}.`)
  return phrases.slice(0, 3).join(' ')
}

function recommandationsOf(f: Facts): string[] {
  const c: { score: number; texte: string }[] = []

  if (f.urssafEchues.length) {
    const tot = sum(f.urssafEchues.map((p) => p.cotisations))
    c.push({
      score: 100000 + tot,
      texte:
        f.urssafEchues.length === 1
          ? `Déclare et paie ${periodeUrssaf(f.urssafEchues[0]!.periode)} à l’URSSAF (${eur(tot)}, échéance du ${fdate(f.urssafEchues[0]!.dateLimite)} dépassée), ou marque-la comme payée si c’est fait.`
          : `Régularise ${f.urssafEchues.length} périodes URSSAF échues (${eur(tot)} de cotisations), ou marque-les comme payées si c’est fait.`,
    })
  }
  for (const s of f.seuils.slice(0, 1))
    c.push({ score: s.pourcentage >= 95 ? 90000 : 3000 + s.pourcentage * 10, texte: `Surveille le ${s.seuil} : ${s.pourcentage} % atteint (${eur(s.ca)} sur ${eur(s.montant)}). ${s.texte}` })
  if (f.urssafProches.length) {
    const p = f.urssafProches[0]!
    c.push({ score: 50000 + p.cotisations, texte: `Déclare ${periodeUrssaf(p.periode)} avant le ${fdate(p.dateLimite)} : ${eur(p.cotisations)} de cotisations à payer.` })
  }
  if (f.retards.length) {
    const r = f.retards[0]!
    c.push({
      score: r.montant * (r.joursDeRetard > 30 ? 1.4 : 1.2),
      texte: `Relance ${r.client} pour ${/^[A-Z]{1,4}-\d/.test(r.facture) ? `la facture ${r.facture}` : `« ${r.facture} »`} : ${eur(r.montant)}, ${plural(r.joursDeRetard, 'jour')} de retard${r.relances ? ` (déjà ${r.relances} relance${r.relances > 1 ? 's' : ''})` : ''}.`,
    })
  }
  if (f.abonnementsInutilises.length) {
    const a = f.abonnementsInutilises[0]!
    const autres = f.abonnementsInutilises.length - 1
    c.push({
      score: sum(f.abonnementsInutilises.map((x) => x.coutAnnuel)),
      texte: `Coupe l’abonnement ${a.nom}, marqué inutilisé : ${eur(a.coutAnnuel)} économisés par an${autres ? ` (et ${plural(autres, 'autre')} à revoir)` : ''}.`,
    })
  }
  if (f.aMettreDeCote > 0) c.push({ score: f.aMettreDeCote * 0.8, texte: `Mets ${eur(f.aMettreDeCote)} de côté pour l’URSSAF : ${pct(f.tauxCotisations, 1)} des ${eur(f.ca)} encaissés cette semaine.` })
  if (f.justificatifsManquants.nombre > 0)
    c.push({
      score: Math.max(100, f.justificatifsManquants.nombre * 50),
      texte: `Ajoute ${f.justificatifsManquants.nombre > 1 ? `les ${f.justificatifsManquants.nombre} justificatifs manquants` : 'le justificatif manquant'} (${eur(f.justificatifsManquants.montant)} de dépenses) : un scan de ticket suffit.`,
    })

  const out = c.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.texte)
  if (!out.length) out.push(f.ca > 0 || f.depenses > 0 ? 'Rien d’urgent : tout est à jour. Continue comme ça.' : 'Saisis tes encaissements et dépenses de la semaine pour un résumé plus utile lundi prochain.')
  return out
}

/** Résumé calculé localement, sans IA. `monday` est le lundi de la semaine résumée. */
export function buildWeeklyLocal(state: FluxData, monday: string, ref = todayFn()): WeeklyReport {
  const f = weeklyFacts(state, monday, ref)
  return { resume: resumeOf(f), recommandations: recommandationsOf(f) }
}

/** Rédige le résumé : IA d'abord, calcul local en secours. */
export async function generateWeekly(state: FluxData, monday: string, ref = todayFn()): Promise<WeeklyReport & { source: Rapport['source'] }> {
  const local = buildWeeklyLocal(state, monday, ref)
  try {
    const facts = weeklyFacts(state, monday, ref)
    const data = await callAI<{ result: Partial<WeeklyReport> }>('weekly', {
      context: {
        aujourdhui: ref,
        entreprise: state.settings.entreprise.nom,
        objectifMensuel: state.settings.objectifMensuel,
        faits: facts,
        recommandationsCalculees: local.recommandations,
      },
    })
    const r = data.result
    const recos = (Array.isArray(r?.recommandations) ? r.recommandations : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 3)
    if (r && typeof r.resume === 'string' && r.resume.trim() && recos.length) return { resume: r.resume.trim(), recommandations: recos, source: 'ia' }
    console.warn('[hebdo] réponse IA incomplète, calcul local')
  } catch (e) {
    if (!(e instanceof AiUnavailable)) console.warn('[hebdo] IA en échec, calcul local', e)
  }
  return { ...local, source: 'local' }
}

// ── Hook ────────────────────────────────────────────────────────────────────

const useBusy = create<{ busy: boolean }>(() => ({ busy: false }))
/** Une seule génération à la fois, même si plusieurs composants utilisent le hook. */
let inFlight: Promise<void> | null = null

function run(monday: string, force: boolean): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    useBusy.setState({ busy: true })
    try {
      const id = 'rapport-' + monday
      const exists = (s: ReturnType<typeof useFlux.getState>) => s.rapports.find((r) => r.id === id) ?? alive(s.rapports).find((r) => r.semaine === monday)
      if (!force && exists(useFlux.getState())) return
      const r = await generateWeekly(useFlux.getState(), monday)
      const st = useFlux.getState()
      const cur = exists(st)
      if (cur) {
        if (force) st.update('rapports', cur.id, { resume: r.resume, recommandations: r.recommandations, source: r.source }, { silent: true })
      } else st.create('rapports', { id, semaine: monday, resume: r.resume, recommandations: r.recommandations, source: r.source }, { silent: true })
    } catch (e) {
      console.warn('[hebdo] génération impossible', e)
    } finally {
      useBusy.setState({ busy: false })
      inFlight = null
    }
  })()
  return inFlight
}

/** Les résumés non archivés, du plus récent au plus ancien. */
export function useRapports(): Rapport[] {
  const rapports = useFlux((s) => s.rapports)
  return useMemo(() => alive(rapports).sort((a, b) => b.semaine.localeCompare(a.semaine)), [rapports])
}

/**
 * Génère une fois le résumé de la semaine écoulée s'il n'existe pas encore
 * (dès que les données sont chargées et qu'il y a au moins une saisie), et
 * donne le dernier résumé disponible.
 */
export function useWeeklyReport(): { latest: Rapport | undefined; regenerate: () => Promise<void>; busy: boolean } {
  const rapports = useRapports()
  const hasData = useFlux((s) => s.recettes.some((r) => !r.archived) || s.depenses.some((d) => !d.archived))
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const busy = useBusy((s) => s.busy)
  const ready = status === 'local' || status === 'live'
  const monday = previousMonday()
  const exists = rapports.some((r) => r.semaine === monday)

  useEffect(() => {
    if (ready && hasData && !exists) void run(monday, false)
  }, [ready, hasData, exists, monday])

  const regenerate = useCallback(() => run(monday, true), [monday])
  return { latest: rapports[0], regenerate, busy }
}

