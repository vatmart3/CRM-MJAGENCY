import { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { Offer } from '../store/types'
import { Accordion, Editable, Page, RowMenu, Table, Td, Th, cx } from '../components/ui'
import { uid } from '../lib/format'

const MAIN_OFFERS = ['essentiel', 'signature', 'surmesure']

const CountPill = ({ n }: { n: number }) => <span className="pill bg-card2 border border-line text-muted">{n}</span>
const AddButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button className="btn-ghost !py-1.5 mt-4" onClick={onClick}><Plus size={14} /> {label}</button>
)
const Note = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted mt-4">{children}</p>

export default function Playbook() {
  const { offers, addons, priceRules, script, objections, followupSequence, rules, patch, add, remove, setScript } = useStore()
  const mains = MAIN_OFFERS.map((id) => offers.find((o) => o.id === id)).filter((o): o is Offer => !!o)
  const extras = offers.filter((o) => !MAIN_OFFERS.includes(o.id))

  return (
    <Page title="Playbook" subtitle="Offres, script, objections, relances et règles. Tout se modifie en cliquant sur le texte.">
      <div className="flex flex-col gap-4">
        <Accordion title="Offres et tarifs" defaultOpen right={<CountPill n={offers.length} />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mains.map((o) => (
              <div key={o.id} className="card-2 p-5 flex flex-col gap-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: o.color }} />
                <span className="label" style={{ color: o.color }}>{o.name}</span>
                <div className="text-3xl font-extrabold text-white tracking-tight leading-none">
                  <Editable value={o.priceLabel} onChange={(priceLabel) => patch('offers', o.id, { priceLabel })} />
                </div>
                <p className="text-sm text-txt/85 leading-relaxed"><Editable multiline value={o.content} onChange={(content) => patch('offers', o.id, { content })} /></p>
                <div className="mt-auto pt-3 border-t border-line">
                  <span className="label block mb-1">Pour qui</span>
                  <p className="text-sm text-muted leading-relaxed"><Editable multiline value={o.audience} onChange={(audience) => patch('offers', o.id, { audience })} /></p>
                </div>
              </div>
            ))}
          </div>
          {extras.length > 0 && (
            <div className="mt-5">
              <span className="label block mb-2">Compléments</span>
              <div className="flex flex-wrap gap-2">
                {extras.map((o) => (
                  <span key={o.id} className="chip gap-2.5">
                    <span className="w-2 h-2 rounded-pill" style={{ background: o.color }} />
                    <Editable value={o.name} onChange={(name) => patch('offers', o.id, { name })} className="text-txt" />
                    <span className="text-muted">·</span>
                    <Editable value={o.priceLabel} onChange={(priceLabel) => patch('offers', o.id, { priceLabel })} className="text-white font-semibold" />
                  </span>
                ))}
              </div>
            </div>
          )}
          <Note>Ajouter ou supprimer une offre se fait dans les <Link to="/reglages" className="text-brandLight hover:underline">Réglages</Link>.</Note>
        </Accordion>

        <Accordion title="Add-ons" right={<CountPill n={addons.length} />}>
          <Table className="!rounded-2xl" head={<><Th>Add-on</Th><Th>Prix</Th><Th>Argument</Th><Th /></>}>
            {addons.map((a) => (
              <tr key={a.id} className="tr">
                <Td className="font-medium text-white w-[260px]"><Editable value={a.name} onChange={(name) => patch('addons', a.id, { name })} /></Td>
                <Td className="whitespace-nowrap w-[140px]"><Editable value={a.price} onChange={(price) => patch('addons', a.id, { price })} /></Td>
                <Td className="text-txt/85"><Editable multiline value={a.pitch} onChange={(pitch) => patch('addons', a.id, { pitch })} /></Td>
                <Td className="text-right w-12"><RowMenu items={[{ label: 'Supprimer', danger: true, onClick: () => remove('addons', a.id) }]} /></Td>
              </tr>
            ))}
          </Table>
          <AddButton label="Add-on" onClick={() => add('addons', { id: uid(), name: 'Nouvel add-on', price: '0 €', pitch: '' })} />
        </Accordion>

        <Accordion title="Règles de prix" right={<CountPill n={priceRules.length} />}>
          <NumberedList items={priceRules} onChange={(id, text) => patch('priceRules', id, { text })} onRemove={(id) => remove('priceRules', id)} />
          <AddButton label="Règle" onClick={() => add('priceRules', { id: uid(), text: '' })} />
        </Accordion>

        <Accordion title={<Editable value={script.title} onChange={(title) => setScript({ title })} />}>
          <blockquote className="border-l-2 border-brand pl-5 py-1 text-[15px] leading-relaxed text-txt">
            <Editable multiline value={script.text} onChange={(text) => setScript({ text })} />
          </blockquote>
          <p className="text-sm text-muted italic mt-5"><span className="not-italic font-semibold text-txt/80">Note : </span><Editable multiline value={script.note} onChange={(note) => setScript({ note })} /></p>
        </Accordion>

        <Accordion title={`Les ${objections.length} objections`} right={<CountPill n={objections.length} />}>
          <Table className="!rounded-2xl" head={<><Th>Objection</Th><Th>Réponse</Th><Th /></>}>
            {objections.map((o) => (
              <tr key={o.id} className="tr">
                <Td className="font-medium text-white w-[280px] align-top"><Editable multiline value={o.objection} onChange={(objection) => patch('objections', o.id, { objection })} /></Td>
                <Td className="text-txt/85 leading-relaxed"><Editable multiline value={o.answer} onChange={(answer) => patch('objections', o.id, { answer })} /></Td>
                <Td className="text-right w-12"><RowMenu items={[{ label: 'Supprimer', danger: true, onClick: () => remove('objections', o.id) }]} /></Td>
              </tr>
            ))}
          </Table>
          <AddButton label="Objection" onClick={() => add('objections', { id: uid(), objection: '« … »', answer: '' })} />
          <Note>Chaque objection est sélectionnable depuis la fiche prospect.</Note>
        </Accordion>

        <Accordion title="Séquence de relance" right={<CountPill n={followupSequence.length} />}>
          <Table className="!rounded-2xl" head={<><Th>Moment</Th><Th>Canal</Th><Th>Message</Th><Th /></>}>
            {[...followupSequence].sort((a, b) => a.day - b.day).map((s) => (
              <tr key={s.id} className="tr">
                <Td className="w-[150px]">
                  <span className="inline-flex items-center gap-1 pill bg-brand/15 text-brandLight">
                    J+<input type="number" min={0} value={s.day} onChange={(e) => { const day = Number(e.target.value); patch('followupSequence', s.id, { day, moment: `J+${day}` }) }} className="bg-transparent outline-none w-10 text-brandLight font-semibold text-[12px]" />
                  </span>
                </Td>
                <Td className="w-[160px] text-white font-medium"><Editable value={s.channel} onChange={(channel) => patch('followupSequence', s.id, { channel })} /></Td>
                <Td className="text-txt/85"><Editable multiline value={s.message} onChange={(message) => patch('followupSequence', s.id, { message })} /></Td>
                <Td className="text-right w-12"><RowMenu items={[{ label: 'Supprimer', danger: true, onClick: () => remove('followupSequence', s.id) }]} /></Td>
              </tr>
            ))}
          </Table>
          <AddButton label="Étape" onClick={() => { const day = (followupSequence[followupSequence.length - 1]?.day ?? 0) + 7; add('followupSequence', { id: uid(), day, moment: `J+${day}`, channel: 'Mail', message: '' }) }} />
          <Note>Déclenchée automatiquement dès qu’un prospect passe en « Devis envoyé ».</Note>
        </Accordion>

        <Accordion title={`Les ${rules.length} règles de fonctionnement`} right={<CountPill n={rules.length} />}>
          <NumberedList items={rules} onChange={(id, text) => patch('rules', id, { text })} onRemove={(id) => remove('rules', id)} />
          <AddButton label="Règle" onClick={() => add('rules', { id: uid(), text: '' })} />
        </Accordion>
      </div>
    </Page>
  )
}

function NumberedList({ items, onChange, onRemove }: { items: { id: string; text: string }[]; onChange: (id: string, text: string) => void; onRemove: (id: string) => void }) {
  return (
    <ol className="divide-y divide-line/70">
      {items.map((r, i) => (
        <li key={r.id} className={cx('group flex items-start gap-4 py-3.5', i === 0 && 'pt-0')}>
          <span className="w-8 h-8 rounded-pill bg-brand/15 text-brandLight font-bold text-sm grid place-content-center shrink-0">{i + 1}</span>
          <p className="flex-1 text-[15px] text-txt leading-relaxed pt-1"><Editable multiline value={r.text} onChange={(t) => onChange(r.id, t)} placeholder="Nouvelle règle…" /></p>
          <button title="Supprimer" onClick={() => onRemove(r.id)} className="btn-icon opacity-0 group-hover:opacity-100 text-muted hover:text-danger"><Trash2 size={15} /></button>
        </li>
      ))}
    </ol>
  )
}
