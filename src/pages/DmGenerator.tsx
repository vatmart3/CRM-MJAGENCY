import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Copy, Dices, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { DM_PARTS, DM_PLACEHOLDERS, DmPart, DmSnippet, DmTone } from '../store/types'
import { today } from '../lib/dates'
import { uid } from '../lib/format'
import { Accordion, Card, ConfirmDelete, cx, Editable, Empty, Field, Page, SectionTitle, Toggle } from '../components/ui'

const WHEN_SUGGESTIONS = ['samedi', 'hier', 'ce matin', 'en fin de journée', 'la semaine dernière', 'pendant le marché']
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu

const PART_KEYS = new Set<string>(['observation', 'constat', 'valeur', 'question'])

/**
 * Remplit le modèle. Une phrase dont le temps est resté vide est retirée entièrement,
 * plutôt que de laisser une virgule en suspens.
 */
const fillTemplate = (template: string, vars: Record<string, string>) =>
  template
    .split('\n')
    .filter((line) => {
      const refs = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => PART_KEYS.has(k))
      return refs.length === 0 || refs.some((k) => (vars[k] ?? '').trim())
    })
    .join('\n')
    .replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '')
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()

const pickRandom = <T,>(list: T[]): T | undefined => (list.length ? list[Math.floor(Math.random() * list.length)] : undefined)

/** Ville de l'agence, déduite de l'adresse « 54 rue Marceau, 34200 Sète ». */
const cityFromAddress = (address: string) => address.match(/\d{5}\s+(.+)$/)?.[1]?.trim() || address.split(',').pop()?.trim() || ''

function AutoTextarea({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck
      className={cx('w-full bg-transparent outline-none resize-none overflow-hidden', className)}
    />
  )
}

export default function DmGenerator() {
  const { prospects, dmTones, dmSnippets, settings, users, add, patch, remove, addDm, moveProspect } = useStore()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()

  const [toneId, setToneId] = useState(dmTones[0]?.id ?? '')
  const [prospectId, setProspectId] = useState(params.get('prospect') ?? '')
  const [commerce, setCommerce] = useState('')
  const [prenom, setPrenom] = useState('')
  const [ville, setVille] = useState('')
  const [secteur, setSecteur] = useState('')
  const [quand, setQuand] = useState('samedi')
  // Premier brouillon tiré au hasard : la page s'ouvre sur un message complet, pas sur du vide.
  const [parts, setParts] = useState<Record<DmPart, string>>(() => {
    const draft: Record<DmPart, string> = { observation: '', constat: '', valeur: '', question: '' }
    for (const { key } of DM_PARTS) draft[key] = pickRandom(dmSnippets.filter((s) => s.part === key))?.text ?? ''
    return draft
  })
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [stripEmoji, setStripEmoji] = useState(false)

  const tone = dmTones.find((t) => t.id === toneId) ?? dmTones[0]
  const me = users.find((u) => u.id === settings.currentUser) ?? users[0]
  const snippetsOf = (part: DmPart) => dmSnippets.filter((s) => s.part === part)

  // Choisir un prospect remplit la fiche depuis le CRM.
  const applyProspect = (id: string) => {
    setProspectId(id)
    setSent(false)
    const p = prospects.find((x) => x.id === id)
    if (!p) return
    setCommerce(p.business)
    setPrenom(p.contactFirst)
    setVille(p.city)
    setSecteur(p.sector)
  }
  useEffect(() => {
    const fromUrl = params.get('prospect')
    if (fromUrl && prospects.some((p) => p.id === fromUrl)) applyProspect(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rollPart = (part: DmPart) => {
    const s = pickRandom(snippetsOf(part))
    if (s) setParts((x) => ({ ...x, [part]: s.text }))
  }
  const rollAll = () => {
    const next = { ...parts }
    for (const { key } of DM_PARTS) {
      const s = pickRandom(snippetsOf(key))
      if (s) next[key] = s.text
    }
    setParts(next)
    setManual(false)
  }

  const vars = useMemo(() => {
    const resolve = (raw: string) =>
      raw.replace(/\{(prenom|commerce|ville|secteur)\}/g, (_, k: string) =>
        ({ prenom: prenom || 'vous', commerce: commerce || 'votre commerce', ville, secteur })[k] ?? '',
      )
    return {
      prenom: prenom.trim(),
      commerce: commerce.trim() || 'votre commerce',
      ville: ville.trim(),
      secteur: secteur.trim() || 'votre activité',
      quand: quand.trim(),
      moi: me?.name ?? '',
      agence: settings.agency.name,
      villeAgence: cityFromAddress(settings.agency.address),
      observation: resolve(parts.observation),
      constat: resolve(parts.constat),
      valeur: resolve(parts.valeur),
      question: resolve(parts.question),
    }
  }, [prenom, commerce, ville, secteur, quand, parts, me, settings.agency])

  const generated = useMemo(() => {
    if (!tone) return ''
    const text = fillTemplate(tone.template, vars)
    return stripEmoji ? text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '') : text
  }, [tone, vars, stripEmoji])

  // Tant que le texte n'a pas été retouché à la main, il suit les champs.
  useEffect(() => {
    if (!manual) setMessage(generated)
  }, [generated, manual])
  useEffect(() => {
    if (tone) setStripEmoji(!tone.emoji)
  }, [toneId]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* presse-papiers indisponible */
    }
  }

  const markSent = () => {
    addDm(1)
    const p = prospects.find((x) => x.id === prospectId)
    if (p) {
      if (p.stage === settings.pipelineStages[0]) moveProspect(p.id, 'Contacté')
      else patch('prospects', p.id, { lastContact: today() })
    }
    setSent(true)
    setTimeout(() => setSent(false), 2600)
  }

  const dmToday = useStore((s) => s.dmLogs.find((l) => l.date === today())?.count ?? 0)
  const openProspects = prospects.filter((p) => p.stage !== 'Gagné' && p.stage !== 'Perdu')

  if (!dmTones.length)
    return (
      <Page title="Générateur de DM">
        <Card>
          <Empty
            text="Aucun style de message. Créez-en un pour commencer à écrire vos DM."
            action="Créer un style"
            onAction={() =>
              add('dmTones', { id: uid(), label: 'Nouveau style', hint: '', emoji: false, template: 'Bonjour {prenom},\n\n{observation}\n\n{constat}\n\n{valeur}\n\n{question}' })
            }
          />
        </Card>
      </Page>
    )

  return (
    <Page
      title="Générateur de DM"
      subtitle="Vous donnez les informations, l’app écrit le message dans le style choisi."
      actions={
        <>
          <span className="chip">{dmToday} / {settings.dmTargetPerDay} DM aujourd’hui</span>
          <button className="btn-ghost" onClick={() => nav('/instagram')}>Voir Instagram</button>
        </>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ————— Colonne de saisie ————— */}
        <div className="xl:col-span-7 space-y-4">
          <Card>
            <SectionTitle>Le commerce</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Reprendre un prospect du CRM" className="md:col-span-2" hint="Remplit les champs automatiquement.">
                <select className="input" value={prospectId} onChange={(e) => applyProspect(e.target.value)}>
                  <option value="">Saisie libre</option>
                  {openProspects.map((p) => (
                    <option key={p.id} value={p.id}>{p.business} · {p.city} · {p.stage}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nom du commerce"><input className="input" value={commerce} onChange={(e) => setCommerce(e.target.value)} placeholder="Boulangerie du Port" /></Field>
              <Field label="Prénom du contact"><input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Laissez vide si inconnu" /></Field>
              <Field label="Ville"><input className="input" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Sète" /></Field>
              <Field label="Secteur d’activité"><input className="input" value={secteur} onChange={(e) => setSecteur(e.target.value)} placeholder="Boulangerie" /></Field>
              <Field label="Moment du passage" className="md:col-span-2" hint="Utilisé par les styles qui évoquent un passage devant la boutique.">
                <input className="input" list="dm-quand" value={quand} onChange={(e) => setQuand(e.target.value)} />
                <datalist id="dm-quand">{WHEN_SUGGESTIONS.map((w) => <option key={w} value={w} />)}</datalist>
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle right={<button className="btn-ghost !py-1.5" onClick={rollAll}><Dices size={14} /> Tout tirer</button>}>Le style du message</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {dmTones.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setToneId(t.id); setManual(false) }}
                  className={cx('card-2 !rounded-2xl p-3 text-left border', t.id === toneId ? 'border-brand ring-1 ring-brand/40' : 'hover:border-muted/50')}
                >
                  <span className={cx('block text-sm font-semibold', t.id === toneId ? 'text-white' : 'text-txt')}>{t.label}</span>
                  <span className="block text-[11px] text-muted mt-1 leading-snug line-clamp-3">{t.hint}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Les quatre temps</SectionTitle>
            <div className="space-y-6">
              {DM_PARTS.map(({ key, label, help }, i) => (
                <div key={key}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="label">{i + 1}. {label}</span>
                    <button className="btn-icon !w-7 !h-7" title="Tirer une formulation" onClick={() => rollPart(key)}><Dices size={14} /></button>
                  </div>
                  <p className="text-[11px] text-muted mb-2 leading-snug">{help}</p>
                  <textarea
                    className="input !min-h-[64px]"
                    value={parts[key]}
                    onChange={(e) => { setParts((x) => ({ ...x, [key]: e.target.value })); setManual(false) }}
                    placeholder="Écrivez, ou choisissez une formulation ci-dessous"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {snippetsOf(key).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setParts((x) => ({ ...x, [key]: s.text })); setManual(false) }}
                        className={cx('chip text-left !text-[11px] hover:border-brand/60', parts[key] === s.text && 'border-brand text-white')}
                      >
                        {s.text.length > 58 ? s.text.slice(0, 58) + '…' : s.text}
                      </button>
                    ))}
                    {!snippetsOf(key).length && <span className="text-[11px] text-muted">Aucune formulation enregistrée pour ce temps.</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ————— Colonne d'aperçu ————— */}
        <div className="xl:col-span-5 xl:sticky xl:top-[84px] space-y-4">
          <Card>
            <SectionTitle right={<span className="text-[11px] text-muted tabular-nums">{message.length} caractères</span>}>Le message</SectionTitle>

            <div className="rounded-2xl bg-card2 border border-line p-4">
              <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-line">
                <span className="w-8 h-8 rounded-pill bg-white/10 grid place-content-center text-[11px] font-bold text-txt">
                  {(commerce || '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-white truncate">{commerce || 'Le commerce'}</span>
                  <span className="block text-[11px] text-muted truncate">{[secteur, ville].filter(Boolean).join(' · ') || 'Instagram'}</span>
                </span>
              </div>
              <div className="bg-brand text-white rounded-2xl rounded-br-md px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                <AutoTextarea value={message} onChange={(v) => { setMessage(v); setManual(true) }} className="text-white placeholder:text-white/60" />
              </div>
              {manual && <p className="text-[11px] text-muted mt-2">Texte retouché à la main. Il ne suit plus les champs.</p>}
            </div>

            <div className="flex items-center justify-between gap-3 mt-4">
              <Toggle checked={!stripEmoji} onChange={(v) => { setStripEmoji(!v); setManual(false) }} label="Emoji" />
              <button className="btn-ghost !py-1.5" onClick={() => { setManual(false); setMessage(generated) }}><RotateCcw size={14} /> Repartir du modèle</button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button className="btn-ghost justify-center" onClick={copy}>
                {copied ? <><Check size={15} className="text-ok" /> Copié</> : <><Copy size={15} /> Copier</>}
              </button>
              <button className="btn-primary justify-center" onClick={markSent} disabled={!message.trim()}>
                {sent ? <><Check size={15} /> Enregistré</> : <><Send size={15} /> DM envoyé</>}
              </button>
            </div>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              « DM envoyé » incrémente le compteur du jour{prospectId ? ' et met le prospect à jour dans le pipeline.' : '. Choisissez un prospect pour mettre aussi le pipeline à jour.'}
            </p>
          </Card>

          <Card>
            <SectionTitle>Le rappel</SectionTitle>
            <p className="text-sm text-txt/90 leading-relaxed whitespace-pre-wrap">{settings.dmStructure}</p>
            <p className="text-[11px] text-muted mt-3">Une observation inventée se voit tout de suite. Mieux vaut ne rien dire que de flatter à côté.</p>
          </Card>
        </div>
      </div>

      {/* ————— Personnalisation ————— */}
      <div className="space-y-4 mt-4">
        <Accordion title="Modèles de message" right={<span className="pill bg-card2 text-muted border border-line">{dmTones.length}</span>}>
          <p className="text-xs text-muted mb-4 leading-relaxed">
            Chaque style est un texte à trous. Les champs disponibles :{' '}
            {DM_PLACEHOLDERS.map((p) => <code key={p.key} className="text-brandLight mr-1.5" title={p.label}>{`{${p.key}}`}</code>)}
          </p>
          <div className="space-y-3">
            {dmTones.map((t) => (
              <ToneEditor key={t.id} tone={t} onPatch={(v) => patch('dmTones', t.id, v)} onRemove={() => remove('dmTones', t.id)} />
            ))}
          </div>
          <button
            className="btn-ghost mt-3"
            onClick={() =>
              add('dmTones', { id: uid(), label: 'Nouveau style', hint: 'Quand l’utiliser', emoji: false, template: 'Bonjour {prenom},\n\n{observation}\n\n{constat}\n\n{valeur}\n\n{question}' })
            }
          >
            <Plus size={14} /> Style
          </button>
        </Accordion>

        <Accordion title="Formulations proposées" right={<span className="pill bg-card2 text-muted border border-line">{dmSnippets.length}</span>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DM_PARTS.map(({ key, label }) => (
              <div key={key}>
                <div className="label mb-2">{label}</div>
                <div className="space-y-1.5">
                  {snippetsOf(key).map((s) => (
                    <div key={s.id} className="flex items-start gap-2 group">
                      <span className="flex-1 text-sm text-txt/90 leading-snug">
                        <Editable value={s.text} onChange={(text) => patch('dmSnippets', s.id, { text })} multiline />
                      </span>
                      <button onClick={() => remove('dmSnippets', s.id)} className="btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100 hover:text-danger" title="Supprimer"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {!snippetsOf(key).length && <p className="text-xs text-muted">Aucune formulation.</p>}
                </div>
                <button className="btn-ghost !py-1.5 mt-2.5" onClick={() => add('dmSnippets', { id: uid(), part: key, text: 'Nouvelle formulation' } as DmSnippet)}>
                  <Plus size={13} /> Formulation
                </button>
              </div>
            ))}
          </div>
        </Accordion>
      </div>

      {params.get('prospect') && (
        <button className="sr-only" onClick={() => setParams({})}>Effacer le prospect</button>
      )}
    </Page>
  )
}

function ToneEditor({ tone, onPatch, onRemove }: { tone: DmTone; onPatch: (v: Partial<DmTone>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card-2 !rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white"><Editable value={tone.label} onChange={(label) => onPatch({ label })} /></div>
          <div className="text-[11px] text-muted mt-1"><Editable value={tone.hint} onChange={(hint) => onPatch({ hint })} multiline placeholder="Quand l’utiliser" /></div>
        </div>
        <button className="btn-ghost !py-1.5 shrink-0" onClick={() => setOpen((o) => !o)}>{open ? 'Replier' : 'Modifier le texte'}</button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <textarea className="input !min-h-[190px] font-mono !text-[12.5px] leading-relaxed" value={tone.template} onChange={(e) => onPatch({ template: e.target.value })} />
          <div className="flex items-center justify-between gap-3">
            <Toggle checked={tone.emoji} onChange={(emoji) => onPatch({ emoji })} label="Emoji par défaut" />
            <ConfirmDelete onConfirm={onRemove} label="Supprimer ce style" />
          </div>
        </div>
      )}
    </div>
  )
}
