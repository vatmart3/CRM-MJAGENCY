import { useState } from 'react'
import { create } from 'zustand'
import { Copy, Mail } from 'lucide-react'
import { useFlux } from '../store'
import { mailtoHref, noterRelance, relanceMail } from '../lib/actions'
import { fdate } from '../lib/dates'
import { clientName, joursDeRetard, statutOf } from '../lib/finance'
import { eur } from '../lib/format'
import { Field, Notice, Sheet, StatutBadge, toast } from './ui'

const useRelance = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }))
export const openRelance = (id: string) => useRelance.getState().set(id)

/** Fenêtre de relance : e-mail pré-rempli, modifiable, à ouvrir dans la messagerie ou à copier. */
export function RelanceSheet() {
  const id = useRelance((s) => s.id)
  if (!id) return null
  return <Inner key={id} id={id} />
}

function Inner({ id }: { id: string }) {
  const close = () => useRelance.getState().set(null)
  const r = useFlux((s) => s.recettes.find((x) => x.id === id))
  const clients = useFlux((s) => s.clients)
  const [mail, setMail] = useState(() => (r ? relanceMail(r) : null))
  if (!r || !mail) return null
  const client = clients.find((c) => c.id === r.clientId)
  const statut = statutOf(r)
  const send = () => {
    noterRelance(r)
    window.location.href = mailtoHref(mail)
    close()
    toast({ title: 'Relance préparée', text: 'Ta messagerie s’ouvre avec l’e-mail prêt à partir.', tone: 'success' })
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`)
      noterRelance(r)
      toast({ title: 'E-mail copié', tone: 'success' })
      close()
    } catch {
      toast({ title: 'Copie impossible', text: 'Sélectionne le texte à la main.', tone: 'error' })
    }
  }
  return (
    <Sheet
      open
      onClose={close}
      title="Relancer le client"
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={copy}>
            <Copy size={15} /> Copier
          </button>
          <button className="btn-primary" onClick={send}>
            <Mail size={15} /> Ouvrir dans ma messagerie
          </button>
        </>
      }
    >
      <div className="card-2 p-4 flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <div>
          <p className="text-xs text-muted">Client</p>
          <p className="font-semibold">{clientName(client)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Facture</p>
          <p className="font-semibold">{r.numeroFacture || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Montant</p>
          <p className="font-semibold tnum">{eur(r.montant)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Échéance</p>
          <p className="font-semibold">{fdate(r.dateEcheance)}</p>
        </div>
        <StatutBadge statut={statut} />
        {statut === 'En retard' && <span className="text-xs text-danger font-semibold">{joursDeRetard(r)} jours de retard</span>}
      </div>
      {!!r.relances?.length && (
        <Notice tone="warn">
          Déjà relancé {r.relances.length} fois, la dernière le {fdate(r.relances[r.relances.length - 1]!.at.slice(0, 10))}. Le ton est ajusté.
        </Notice>
      )}
      <div className="space-y-3 mt-3">
        <Field label="Destinataire" hint={!mail.to ? 'Aucun e-mail dans la fiche client : complète-la, ou saisis-le ici.' : undefined}>
          <input className="input" type="email" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
        </Field>
        <Field label="Objet">
          <input className="input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
        </Field>
        <Field label="Message">
          <textarea className="input !min-h-[260px] leading-relaxed" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  )
}
