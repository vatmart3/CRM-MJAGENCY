import { useFlux } from '../store'
import { Abonnement, Recette } from '../types'
import { aMettreDeCote, clientName, joursDeRetard, nextEcheance, statutOf } from './finance'
import { fdate, nowISO, today } from './dates'
import { eur, plain } from './format'
import { toast } from '../components/ui'

// Actions en un clic, partagées entre le tableau de bord, les listes et les notifications.

/** Transforme l'échéance d'un abonnement en dépense, puis avance la date au prochain prélèvement. */
export function confirmerPrelevement(a: Abonnement) {
  const s = useFlux.getState()
  if (a.montant <= 0) {
    toast({ title: 'Montant à compléter', text: `Renseigne le montant de ${a.nom} avant de confirmer le prélèvement.`, tone: 'error' })
    return false
  }
  s.create('depenses', {
    date: a.prochainPrelevement,
    fournisseur: a.fournisseur || a.nom,
    libelle: `Abonnement ${a.nom} (${a.frequence})`,
    categorieId: a.categorieId,
    montant: a.montant,
    mode: 'Prélèvement',
    payePar: a.payePar,
    aRembourser: a.payePar !== 'pro',
    rembourseLe: '',
    projetId: '',
    recurrente: true,
    abonnementId: a.id,
  })
  s.update('abonnements', a.id, { prochainPrelevement: nextEcheance(a) }, { silent: true })
  toast({ title: `${a.nom} : prélèvement confirmé`, text: `${eur(a.montant)} ajoutés aux dépenses. Prochain le ${fdate(nextEcheance(a))}.`, tone: 'success' })
  return true
}

/** L'échéance n'a pas été prélevée (essai gratuit, report…) : on passe à la suivante sans dépense. */
export function ignorerPrelevement(a: Abonnement) {
  useFlux.getState().update('abonnements', a.id, { prochainPrelevement: nextEcheance(a) }, { details: `Échéance du ${fdate(a.prochainPrelevement)} ignorée` })
  toast({ title: 'Échéance ignorée', text: `Prochain prélèvement de ${a.nom} le ${fdate(nextEcheance(a))}.`, tone: 'info' })
}

export function marquerEncaissee(r: Recette, date = today()) {
  const s = useFlux.getState()
  s.update('recettes', r.id, { statut: 'Encaissée', dateEncaissement: date })
  toast({ title: 'Encaissée !', text: `Mets ${eur(aMettreDeCote(r.montant, s.settings))} de côté pour l’URSSAF.`, tone: 'success' })
}

export function marquerRembourse(ids: string[], date = today()) {
  const s = useFlux.getState()
  for (const id of ids) s.update('depenses', id, { rembourseLe: date })
  toast({ title: ids.length > 1 ? 'Notes de frais remboursées' : 'Note de frais remboursée', tone: 'success' })
}

// ── Relance ─────────────────────────────────────────────────────────────────

export interface RelanceMail {
  to: string
  subject: string
  body: string
}

/** E-mail de relance poli, plus ferme d'un cran quand la facture est en retard ou déjà relancée. */
export function relanceMail(r: Recette): RelanceMail {
  const s = useFlux.getState()
  const client = s.clients.find((c) => c.id === r.clientId)
  const retard = statutOf(r) === 'En retard'
  const jours = joursDeRetard(r)
  const deja = r.relances?.length ?? 0
  const bonjour = client?.nom ? `Bonjour ${client.nom.split(' ')[0]},` : 'Bonjour,'
  const ref = r.numeroFacture ? `la facture n° ${r.numeroFacture}` : 'notre facture'
  const montant = plain(eur(r.montant))

  const lignes = [bonjour, '']
  if (!retard) {
    lignes.push(
      `Je me permets un petit rappel concernant ${ref} du ${fdate(r.dateFacture)} (${r.libelle}), d’un montant de ${montant}, qui arrive à échéance le ${fdate(r.dateEcheance)}.`,
      '',
      'Si le règlement est déjà en route, merci beaucoup, et ne tenez pas compte de ce message.',
    )
  } else {
    lignes.push(
      deja > 0
        ? `Je reviens vers vous au sujet de ${ref} du ${fdate(r.dateFacture)} (${r.libelle}), d’un montant de ${montant}. Sauf erreur de ma part, elle reste impayée à ce jour, ${jours} jours après son échéance du ${fdate(r.dateEcheance)}.`
        : `Sauf erreur de ma part, ${ref} du ${fdate(r.dateFacture)} (${r.libelle}), d’un montant de ${montant}, arrivée à échéance le ${fdate(r.dateEcheance)}, n’a pas encore été réglée.`,
      '',
      'Pourriez-vous me confirmer la date de règlement prévue ? Si un point de la prestation vous pose question, je suis bien sûr disponible pour en parler.',
      '',
      'Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.',
    )
  }
  lignes.push('', 'Belle journée,', '', s.settings.signatureRelance)

  return {
    to: client?.email ?? '',
    subject: `${retard ? 'Relance' : 'Rappel'} — ${r.numeroFacture ? `facture ${r.numeroFacture}` : 'facture'} ${s.settings.entreprise.nom}`,
    body: lignes.join('\n'),
  }
}

export const mailtoHref = (m: RelanceMail) => `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`

export function noterRelance(r: Recette) {
  const s = useFlux.getState()
  s.update('recettes', r.id, { relances: [...(r.relances ?? []), { at: nowISO(), by: s.currentUser }] }, { silent: true })
  s.log({ action: 'relance', entity: 'recettes', entityId: r.id, label: `${clientName(s.clients.find((c) => c.id === r.clientId))} · ${r.numeroFacture || r.libelle}`, details: `Relance n° ${(r.relances?.length ?? 0) + 1}` })
}
