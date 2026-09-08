import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildFollowupSequence, useStore } from '../store'
import { CITIES, Partner, PARTNER_STATUSES, PartnerStatus, Post, POST_STATUSES, PILLARS, Prospect, Quote, QUOTE_STATUSES, SOURCES, Task, Assignee } from '../store/types'
import { today, addDays } from '../lib/dates'
import { fmtEur, uid } from '../lib/format'
import { ConfirmDelete, Field, Modal, Toggle, Stars } from './ui'
import { quoteTotal } from '../lib/selectors'

const ASSIGNEES: { value: Assignee; label: string }[] = [
  { value: 'jeremy', label: 'Jérémy' }, { value: 'matheis', label: 'Matheis' }, { value: 'both', label: 'Les deux' }, { value: 'insta', label: 'Pilote Insta' }, { value: 'deliverer', label: 'Celui qui livre' },
]

// ——————————————————— Prospect ———————————————————
export function ProspectForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Prospect | null }) {
  const { add, patch, remove, settings, offers, partners, objections, followupSequence, moveProspect } = useStore()
  const empty = (): Prospect => ({
    id: uid(), business: '', contactFirst: '', contactLast: '', phone: '', email: '', instagram: '', city: 'Sète', sector: '', source: 'Terrain', partnerId: null,
    stage: settings.pipelineStages[0], offerId: 'essentiel', amount: 990, assignee: 'matheis', lastContact: today(), nextFollowup: null, notes: '', objectionId: null, createdAt: today(),
  })
  const [p, setP] = useState<Prospect>(initial ?? empty())
  useEffect(() => { if (open) setP(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Prospect, v: unknown) => setP((x) => ({ ...x, [k]: v }))
  const save = () => {
    if (!p.business.trim()) return
    if (initial) {
      const stageChanged = initial.stage !== p.stage
      patch('prospects', p.id, { ...p, stage: initial.stage })
      if (stageChanged) moveProspect(p.id, p.stage)
    } else {
      add('prospects', p)
      if (p.stage === 'Devis envoyé') {
        const seq = buildFollowupSequence(followupSequence, p, null)
        for (const f of seq) add('followups', f)
      }
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier le prospect' : 'Nouveau prospect'} width="max-w-3xl"
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('prospects', p.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={save} disabled={!p.business.trim()}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nom du commerce" className="md:col-span-2"><input className="input" value={p.business} onChange={(e) => set('business', e.target.value)} autoFocus placeholder="Ex. Boulangerie du Port" /></Field>
        <Field label="Prénom du contact"><input className="input" value={p.contactFirst} onChange={(e) => set('contactFirst', e.target.value)} /></Field>
        <Field label="Nom du contact"><input className="input" value={p.contactLast} onChange={(e) => set('contactLast', e.target.value)} /></Field>
        <Field label="Téléphone"><input className="input" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Instagram"><input className="input" value={p.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@compte" /></Field>
        <Field label="Ville">
          <input className="input" list="cities" value={p.city} onChange={(e) => set('city', e.target.value)} />
          <datalist id="cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Secteur d’activité"><input className="input" value={p.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Boulangerie, garage, institut…" /></Field>
        <Field label="Source"><select className="input" value={p.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Apporteur lié"><select className="input" value={p.partnerId ?? ''} onChange={(e) => set('partnerId', e.target.value || null)}><option value="">Aucun</option>{partners.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Statut"><select className="input" value={p.stage} onChange={(e) => set('stage', e.target.value)}>{settings.pipelineStages.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Offre pressentie"><select className="input" value={p.offerId ?? ''} onChange={(e) => { const o = offers.find((x) => x.id === e.target.value); setP((x) => ({ ...x, offerId: o?.id ?? null, amount: o ? o.price : x.amount })) }}><option value="">—</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.priceLabel}</option>)}</select></Field>
        <Field label="Montant estimé (€)"><input className="input" type="number" value={p.amount} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
        <Field label="Assigné"><select className="input" value={p.assignee} onChange={(e) => set('assignee', e.target.value)}><option value="jeremy">Jérémy</option><option value="matheis">Matheis</option></select></Field>
        <Field label="Date du dernier contact"><input className="input" type="date" value={p.lastContact ?? ''} onChange={(e) => set('lastContact', e.target.value || null)} /></Field>
        <Field label="Date de la prochaine relance"><input className="input" type="date" value={p.nextFollowup ?? ''} onChange={(e) => set('nextFollowup', e.target.value || null)} /></Field>
        <Field label="Objection rencontrée" className="md:col-span-2"><select className="input" value={p.objectionId ?? ''} onChange={(e) => set('objectionId', e.target.value || null)}><option value="">Aucune</option>{objections.map((o) => <option key={o.id} value={o.id}>{o.objection}</option>)}</select></Field>
        {p.objectionId && <div className="md:col-span-2 text-sm text-muted italic -mt-2 px-1">Réponse : {objections.find((o) => o.id === p.objectionId)?.answer}</div>}
        <Field label="Notes" className="md:col-span-2"><textarea className="input" value={p.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ——————————————————— Task ———————————————————
export function TaskForm({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Task | null; defaults?: Partial<Task> }) {
  const { add, patch, remove } = useStore()
  const empty = (): Task => ({ id: uid(), title: '', week: 1, assignee: 'jeremy', deadline: today(), volume: '', done: false, createdAt: today(), source: 'quick', ...defaults })
  const [t, setT] = useState<Task>(initial ?? empty())
  useEffect(() => { if (open) setT(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Task, v: unknown) => setT((x) => ({ ...x, [k]: v }))
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier la tâche' : 'Nouvelle tâche'}
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('tasks', t.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!t.title.trim() || !t.deadline} onClick={() => { initial ? patch('tasks', t.id, t) : add('tasks', t); onClose() }}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Intitulé" className="md:col-span-2"><input className="input" autoFocus value={t.title} onChange={(e) => set('title', e.target.value)} placeholder="Aucune tâche n’existe sans un nom et une date" /></Field>
        <Field label="Semaine"><select className="input" value={t.week} onChange={(e) => set('week', Number(e.target.value))}>{[1, 2, 3, 4].map((w) => <option key={w} value={w}>Semaine {w}</option>)}</select></Field>
        <Field label="Assigné"><select className="input" value={t.assignee} onChange={(e) => set('assignee', e.target.value)}>{ASSIGNEES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></Field>
        <Field label="Deadline" hint="Une date ou un jour (« Mardi », « Dimanche »)">
          <div className="flex gap-2">
            <input className="input" value={t.deadline} onChange={(e) => set('deadline', e.target.value)} placeholder="Mardi" />
            <input className="input !w-auto" type="date" value={isDate ? t.deadline : ''} onChange={(e) => set('deadline', e.target.value)} />
          </div>
        </Field>
        <Field label="Volume / objectif"><input className="input" value={t.volume} onChange={(e) => set('volume', e.target.value)} placeholder="5 / jour, 15 appels…" /></Field>
        <div className="md:col-span-2"><Toggle checked={t.done} onChange={(v) => set('done', v)} label="Terminée" /></div>
      </div>
    </Modal>
  )
}

// ——————————————————— Quote ———————————————————
export function QuoteForm({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Quote | null; defaults?: Partial<Quote> }) {
  const { add, patch, remove, quotes, offers, prospects, followupSequence, followups, moveProspect } = useStore()
  const nextNumber = () => {
    const year = new Date().getFullYear()
    const nums = quotes.map((q) => Number(q.number.split('-').pop())).filter((n) => !isNaN(n))
    return `DEV-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
  }
  const empty = (): Quote => ({
    id: uid(), number: nextNumber(), client: '', clientAddress: '', clientEmail: '', prospectId: null, offerId: 'essentiel',
    lines: [{ id: uid(), label: offers[0]?.name ? `Site ${offers[0].name} — ${offers[0].content}` : '', qty: 1, unitPrice: offers[0]?.price ?? 990 }],
    sentAt: null, nextFollowup: null, status: 'Brouillon', notes: '', validityDays: 30, createdAt: today(), ...defaults,
  })
  const [q, setQ] = useState<Quote>(initial ?? empty())
  useEffect(() => { if (open) setQ(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Quote, v: unknown) => setQ((x) => ({ ...x, [k]: v }))
  const setLine = (id: string, patchL: Partial<Quote['lines'][number]>) => setQ((x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...patchL } : l)) }))
  const total = quoteTotal(q)
  const save = () => {
    const wasSent = initial && initial.status !== 'Brouillon'
    const nowSent = q.status !== 'Brouillon'
    const next = { ...q }
    if (nowSent && !next.sentAt) next.sentAt = today()
    if (q.status === 'Signé' && !next.signedAt) next.signedAt = today()
    if (initial) patch('quotes', q.id, next); else add('quotes', next)
    // Automation: sending a quote pushes the linked prospect to "Devis envoyé" (which spawns the follow-up sequence).
    if (nowSent && !wasSent && (q.status === 'Envoyé' || q.status === 'Relancé')) {
      if (q.prospectId) {
        const pr = prospects.find((p) => p.id === q.prospectId)
        if (pr && pr.stage !== 'Devis envoyé' && pr.stage !== 'Gagné') moveProspect(pr.id, 'Devis envoyé')
        else if (pr && !followups.some((f) => f.quoteId === q.id)) for (const f of buildFollowupSequence(followupSequence, pr, q.id, next.sentAt ?? today())) add('followups', f)
      }
      if (!next.nextFollowup) patch('quotes', q.id, { nextFollowup: addDays(next.sentAt ?? today(), followupSequence[0]?.day ?? 1) })
    }
    if (q.status === 'Signé' && q.prospectId) {
      const pr = prospects.find((p) => p.id === q.prospectId)
      if (pr && pr.stage !== 'Gagné') moveProspect(pr.id, 'Gagné')
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? `Devis ${q.number}` : 'Nouveau devis'} width="max-w-3xl"
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('quotes', q.id); onClose() }} />}<span className="flex-1" /><span className="text-sm text-muted mr-2">Total HT <b className="text-white">{fmtEur(total)}</b></span><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!q.client.trim()} onClick={save}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Numéro"><input className="input" value={q.number} onChange={(e) => set('number', e.target.value)} /></Field>
        <Field label="Statut"><select className="input" value={q.status} onChange={(e) => set('status', e.target.value)}>{QUOTE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Prospect lié">
          <select className="input" value={q.prospectId ?? ''} onChange={(e) => { const pr = prospects.find((p) => p.id === e.target.value); setQ((x) => ({ ...x, prospectId: pr?.id ?? null, client: pr ? pr.business : x.client, clientAddress: pr ? pr.city : x.clientAddress, clientEmail: pr ? pr.email : x.clientEmail })) }}>
            <option value="">Aucun</option>{prospects.map((p) => <option key={p.id} value={p.id}>{p.business} · {p.city}</option>)}
          </select>
        </Field>
        <Field label="Client"><input className="input" value={q.client} onChange={(e) => set('client', e.target.value)} /></Field>
        <Field label="Adresse du client"><input className="input" value={q.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} /></Field>
        <Field label="Email du client"><input className="input" value={q.clientEmail} onChange={(e) => set('clientEmail', e.target.value)} /></Field>
        <Field label="Offre"><select className="input" value={q.offerId ?? ''} onChange={(e) => set('offerId', e.target.value || null)}><option value="">—</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Validité (jours)"><input className="input" type="number" value={q.validityDays} onChange={(e) => set('validityDays', Number(e.target.value))} /></Field>
        <Field label="Date d’envoi"><input className="input" type="date" value={q.sentAt ?? ''} onChange={(e) => set('sentAt', e.target.value || null)} /></Field>
        <Field label="Prochaine relance"><input className="input" type="date" value={q.nextFollowup ?? ''} onChange={(e) => set('nextFollowup', e.target.value || null)} /></Field>
        <div className="md:col-span-2">
          <div className="label mb-2">Lignes</div>
          <div className="space-y-2">
            {q.lines.map((l) => (
              <div key={l.id} className="flex gap-2 items-center">
                <input className="input flex-1" value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value })} placeholder="Désignation" />
                <input className="input !w-16" type="number" value={l.qty} onChange={(e) => setLine(l.id, { qty: Number(e.target.value) })} />
                <input className="input !w-28" type="number" value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: Number(e.target.value) })} />
                <button className="btn-icon" onClick={() => setQ((x) => ({ ...x, lines: x.lines.filter((y) => y.id !== l.id) }))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-ghost !py-1.5" onClick={() => setQ((x) => ({ ...x, lines: [...x.lines, { id: uid(), label: '', qty: 1, unitPrice: 0 }] }))}><Plus size={14} /> Ligne</button>
            {offers.map((o) => <button key={o.id} className="chip hover:border-muted/60" onClick={() => setQ((x) => ({ ...x, lines: [...x.lines, { id: uid(), label: `${o.name} — ${o.content}`, qty: 1, unitPrice: o.price }] }))}>+ {o.name}</button>)}
          </div>
        </div>
        <Field label="Notes / promesses faites au client" className="md:col-span-2" hint="Toute promesse faite à un client est écrite dans le devis."><textarea className="input" value={q.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ——————————————————— Partner ———————————————————
export function PartnerForm({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Partner | null; defaults?: Partial<Partner> }) {
  const { add, patch, remove, partnerProfiles } = useStore()
  const empty = (): Partner => ({
    id: uid(), name: '', profile: partnerProfiles[0]?.label ?? '', canInvoice: true, priority: 2, status: 'À contacter', commissionRate: 10, contactsBrought: 0, revenueGenerated: 0,
    commissionsDue: 0, commissionsPaid: 0, lastFollowup: today(), dueSince: null, phone: '', email: '', notes: '', createdAt: today(), ...defaults,
  })
  const [p, setP] = useState<Partner>(initial ?? empty())
  useEffect(() => { if (open) setP(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Partner, v: unknown) => setP((x) => ({ ...x, [k]: v }))
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier l’apporteur' : 'Nouvel apporteur'} width="max-w-3xl"
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('partners', p.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!p.name.trim()} onClick={() => { initial ? patch('partners', p.id, p) : add('partners', p); onClose() }}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nom" className="md:col-span-2"><input className="input" autoFocus value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Profil"><input className="input" list="profiles" value={p.profile} onChange={(e) => { const pp = partnerProfiles.find((x) => x.label === e.target.value); setP((x) => ({ ...x, profile: e.target.value, priority: pp ? pp.priority : x.priority })) }} /><datalist id="profiles">{partnerProfiles.map((x) => <option key={x.id} value={x.label} />)}</datalist></Field>
        <Field label="Priorité"><div className="input flex items-center"><Stars n={p.priority} onChange={(n) => set('priority', n)} /></div></Field>
        <Field label="Statut"><select className="input" value={p.status} onChange={(e) => set('status', e.target.value as PartnerStatus)}>{PARTNER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Taux de commission (%)"><input className="input" type="number" value={p.commissionRate} onChange={(e) => set('commissionRate', Number(e.target.value))} /></Field>
        <Field label="Téléphone"><input className="input" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input" value={p.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Contacts amenés"><input className="input" type="number" value={p.contactsBrought} onChange={(e) => set('contactsBrought', Number(e.target.value))} /></Field>
        <Field label="CA généré (€)"><input className="input" type="number" value={p.revenueGenerated} onChange={(e) => set('revenueGenerated', Number(e.target.value))} /></Field>
        <Field label="Commissions dues (€)"><input className="input" type="number" value={p.commissionsDue} onChange={(e) => set('commissionsDue', Number(e.target.value))} /></Field>
        <Field label="Commissions payées (€)"><input className="input" type="number" value={p.commissionsPaid} onChange={(e) => set('commissionsPaid', Number(e.target.value))} /></Field>
        <Field label="Encaissement client (départ du délai de 7 j)"><input className="input" type="date" value={p.dueSince ?? ''} onChange={(e) => set('dueSince', e.target.value || null)} /></Field>
        <Field label="Date de la dernière relance"><input className="input" type="date" value={p.lastFollowup ?? ''} onChange={(e) => set('lastFollowup', e.target.value || null)} /></Field>
        <div className="md:col-span-2"><Toggle checked={p.canInvoice} onChange={(v) => set('canInvoice', v)} label="Structure : peut facturer" /></div>
        {!p.canInvoice && <div className="md:col-span-2 text-xs text-warn -mt-2">Un apporteur qui ne peut pas facturer : privilégier la recommandation réciproque sans rémunération.</div>}
        <Field label="Notes" className="md:col-span-2"><textarea className="input" value={p.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ——————————————————— Post ———————————————————
export function PostForm({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Post | null; defaults?: Partial<Post> }) {
  const { add, patch, remove } = useStore()
  const empty = (): Post => ({ id: uid(), week: 1, format: 'Carrousel', subject: '', pillar: 'Preuve', status: 'À produire', publishDate: null, link: '', reach: 0, interactions: 0, messages: 0, createdAt: today(), ...defaults })
  const [p, setP] = useState<Post>(initial ?? empty())
  useEffect(() => { if (open) setP(initial ?? empty()) }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Post, v: unknown) => setP((x) => ({ ...x, [k]: v }))
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Modifier la publication' : 'Nouvelle publication'}
      footer={<>{initial && <ConfirmDelete onConfirm={() => { remove('posts', p.id); onClose() }} />}<span className="flex-1" /><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" disabled={!p.subject.trim()} onClick={() => { initial ? patch('posts', p.id, p) : add('posts', p); onClose() }}>Enregistrer</button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Sujet" className="md:col-span-2"><input className="input" autoFocus value={p.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
        <Field label="Semaine"><select className="input" value={p.week} onChange={(e) => set('week', Number(e.target.value))}>{[1, 2, 3, 4].map((w) => <option key={w} value={w}>S{w}</option>)}</select></Field>
        <Field label="Format"><select className="input" value={p.format} onChange={(e) => set('format', e.target.value)}>{['Carrousel', 'Reel', 'Story', 'Post'].map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Pilier"><select className="input" value={p.pillar} onChange={(e) => set('pillar', e.target.value)}>{PILLARS.map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Statut"><select className="input" value={p.status} onChange={(e) => set('status', e.target.value)}>{POST_STATUSES.map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Field label="Date de publication"><input className="input" type="date" value={p.publishDate ?? ''} onChange={(e) => set('publishDate', e.target.value || null)} /></Field>
        <Field label="Lien du post"><input className="input" value={p.link} onChange={(e) => set('link', e.target.value)} placeholder="https://instagram.com/p/…" /></Field>
        <Field label="Portée"><input className="input" type="number" value={p.reach} onChange={(e) => set('reach', Number(e.target.value))} /></Field>
        <Field label="Interactions"><input className="input" type="number" value={p.interactions} onChange={(e) => set('interactions', Number(e.target.value))} /></Field>
        <Field label="Messages reçus"><input className="input" type="number" value={p.messages} onChange={(e) => set('messages', Number(e.target.value))} /></Field>
      </div>
    </Modal>
  )
}
