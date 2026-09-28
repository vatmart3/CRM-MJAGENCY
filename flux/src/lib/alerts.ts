import { useMemo } from 'react'
import { alive, useFlux } from '../store'
import { USERS } from '../types'
import {
  aEncaisser, clientName, echeancesAConfirmer, echeancesAVenir, FluxData, joursDeRetard, sansJustificatif, seuils, totalDu, urssafPeriods,
} from './finance'
import { diffDays, fdate, monthLabel, addMonths, startOfMonth, today } from './dates'
import { eur, plural } from './format'

export type AlertTone = 'danger' | 'warn' | 'info' | 'accent'
export type AlertKind = 'retard' | 'prelevement' | 'urssaf' | 'justificatifs' | 'seuil' | 'reglages' | 'rapport' | 'note' | 'abonnement'
export interface Alert {
  id: string
  kind: AlertKind
  tone: AlertTone
  title: string
  text: string
  to: string
  /** Identifiant de l'objet visé (facture, abonnement…), pour les actions en un clic. */
  ref?: string
  date?: string
}

export const useFluxData = (): FluxData => {
  const s = useFlux()
  return useMemo(
    () => ({
      recettes: alive(s.recettes),
      depenses: alive(s.depenses),
      projets: alive(s.projets),
      clients: s.clients,
      categories: s.categories,
      abonnements: alive(s.abonnements),
      declarations: alive(s.declarations),
      settings: s.settings,
    }),
    [s.recettes, s.depenses, s.projets, s.clients, s.categories, s.abonnements, s.declarations, s.settings],
  )
}

/** Tout ce qui mérite l'attention, du plus urgent au moins urgent. */
export function computeAlerts(d: FluxData, opts: { isAdmin: boolean; ref?: string }): Alert[] {
  const ref = opts.ref ?? today()
  const out: Alert[] = []

  for (const { r, statut } of aEncaisser(d.recettes, ref)) {
    if (statut !== 'En retard') continue
    const c = d.clients.find((x) => x.id === r.clientId)
    out.push({
      id: 'retard-' + r.id,
      kind: 'retard',
      tone: 'danger',
      title: `${clientName(c)} : ${eur(r.montant)} en retard`,
      text: `${r.numeroFacture || r.libelle} · ${joursDeRetard(r, ref)} j de retard${r.relances?.length ? ` · relancé ${r.relances.length}×` : ''}`,
      to: '/recettes?statut=En retard',
      ref: r.id,
      date: r.dateEcheance,
    })
  }

  for (const a of echeancesAConfirmer(d.abonnements, ref))
    out.push({
      id: 'prel-' + a.id + a.prochainPrelevement,
      kind: 'prelevement',
      tone: a.montant > 0 ? 'accent' : 'warn',
      title: `${a.nom} : prélèvement à confirmer`,
      text: a.montant > 0 ? `${eur(a.montant)} le ${fdate(a.prochainPrelevement)}` : `Échéance du ${fdate(a.prochainPrelevement)} · montant à compléter`,
      to: '/abonnements',
      ref: a.id,
      date: a.prochainPrelevement,
    })

  const next = urssafPeriods(d, ref).find((p) => p.statut === 'À faire' || p.statut === 'Déclarée')
  if (next) {
    const j = diffDays(next.dateLimite, ref)
    if (j <= 21)
      out.push({
        id: 'urssaf-' + next.key,
        kind: 'urssaf',
        tone: j < 0 ? 'danger' : j <= 7 ? 'warn' : 'info',
        title: next.statut === 'Déclarée' ? `URSSAF ${next.label} : paiement à faire` : `Déclaration URSSAF ${next.label}`,
        text: `${eur(next.detail.total)} · ${j < 0 ? `date limite dépassée (${fdate(next.dateLimite)})` : j === 0 ? 'date limite aujourd’hui' : `avant le ${fdate(next.dateLimite)} (${j} j)`}`,
        to: '/urssaf',
        ref: next.key,
        date: next.dateLimite,
      })
  }

  for (const a of echeancesAVenir(d.abonnements, 15, ref))
    out.push({
      id: 'abo-' + a.id,
      kind: 'abonnement',
      tone: 'info',
      title: `${a.nom} le ${fdate(a.prochainPrelevement).slice(0, 5)}`,
      text: a.montant > 0 ? `${eur(a.montant)} · ${a.frequence}` : 'Montant à compléter',
      to: '/abonnements',
      ref: a.id,
      date: a.prochainPrelevement,
    })

  const manquants = sansJustificatif(d.depenses)
  if (manquants.length)
    out.push({
      id: 'justif',
      kind: 'justificatifs',
      tone: 'warn',
      title: `${plural(manquants.length, 'justificatif manquant', 'justificatifs manquants')}`,
      text: `${eur(manquants.reduce((a, x) => a + x.montant, 0))} de dépenses sans pièce`,
      to: '/depenses?justif=manquant',
    })

  for (const s of seuils(d, ref))
    if (s.key !== 'tvaMajore' && s.seuil > 0 && s.ratio >= 0.8)
      out.push({
        id: 'seuil-' + s.key,
        kind: 'seuil',
        tone: s.niveau === 'critique' ? 'danger' : 'warn',
        title: `${s.label} : ${Math.round(s.ratio * 100)} %`,
        text: s.texte,
        to: '/',
      })

  for (const who of ['jeremy', 'matheis'] as const) {
    const du = totalDu(d.depenses, who)
    if (du > 0)
      out.push({ id: 'note-' + who, kind: 'note', tone: 'info', title: `Notes de frais : ${eur(du)} dus à ${USERS[who].prenom}`, text: 'À rembourser depuis le compte pro', to: '/depenses?onglet=notes' })
  }

  const unused = d.abonnements.filter((a) => a.actif && !a.utilise)
  if (unused.length)
    out.push({
      id: 'inutilises',
      kind: 'abonnement',
      tone: 'warn',
      title: `${plural(unused.length, 'abonnement inutilisé', 'abonnements inutilisés')}`,
      text: `Piste d’économie : ${unused.map((a) => a.nom).join(', ')}`,
      to: '/abonnements',
    })

  if (Number(ref.slice(8, 10)) <= 10 && (d.recettes.length || d.depenses.length)) {
    const prev = addMonths(startOfMonth(ref), -1)
    out.push({ id: 'rapport-' + prev, kind: 'rapport', tone: 'accent', title: `Rapport de ${monthLabel(prev)} prêt`, text: 'PDF aux couleurs MJAGENCY', to: '/exports' })
  }

  if (opts.isAdmin && !d.settings.tauxVerifies)
    out.push({ id: 'taux', kind: 'reglages', tone: 'warn', title: 'Vérifie tes taux URSSAF', text: 'Taux et seuils indicatifs à confirmer dans Réglages', to: '/reglages' })

  const rank: Record<AlertTone, number> = { danger: 0, warn: 1, accent: 2, info: 3 }
  return out.sort((a, b) => rank[a.tone] - rank[b.tone])
}

export const useAlerts = () => {
  const d = useFluxData()
  const role = USERS[useFlux((s) => s.currentUser)].role
  return useMemo(() => computeAlerts(d, { isAdmin: role === 'admin' }), [d, role])
}
