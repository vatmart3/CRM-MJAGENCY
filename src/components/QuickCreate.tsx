import { CalendarCheck, FileText, Handshake, Instagram, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Modal } from './ui'
import { PartnerForm, PostForm, ProspectForm, QuoteForm, TaskForm } from './forms'

type Kind = 'prospect' | 'task' | 'quote' | 'partner' | 'post' | null

export function QuickCreate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(null)
  const items: { kind: Kind; label: string; icon: typeof UserPlus; desc: string }[] = [
    { kind: 'prospect', label: 'Prospect', icon: UserPlus, desc: 'Un commerce à contacter' },
    { kind: 'task', label: 'Tâche', icon: CalendarCheck, desc: 'Un nom, une date' },
    { kind: 'quote', label: 'Devis', icon: FileText, desc: 'Infos légales pré-remplies' },
    { kind: 'partner', label: 'Apporteur', icon: Handshake, desc: 'Un relais d’affaires' },
    { kind: 'post', label: 'Publication', icon: Instagram, desc: 'Calendrier éditorial' },
  ]
  const close = () => { setKind(null); onClose() }
  return (
    <>
      <Modal open={open && !kind} onClose={onClose} title="Création rapide" width="max-w-lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map(({ kind: k, label, icon: Icon, desc }) => (
            <button key={label} onClick={() => setKind(k)} className="card-2 p-4 text-left hover:border-brand/60 flex items-center gap-3 !rounded-2xl">
              <span className="w-10 h-10 rounded-pill bg-brand/15 text-brand grid place-content-center"><Icon size={18} /></span>
              <span><span className="block text-sm font-semibold text-white">{label}</span><span className="block text-xs text-muted">{desc}</span></span>
            </button>
          ))}
        </div>
      </Modal>
      <ProspectForm open={kind === 'prospect'} onClose={close} />
      <TaskForm open={kind === 'task'} onClose={close} />
      <QuoteForm open={kind === 'quote'} onClose={close} />
      <PartnerForm open={kind === 'partner'} onClose={close} />
      <PostForm open={kind === 'post'} onClose={close} />
    </>
  )
}
