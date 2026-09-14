import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Copy, Dices, Loader2, Plus, RotateCcw, ScanSearch, Send, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { DM_PARTS, DM_PLACEHOLDERS, DmPart, DmSnippet, DmTone } from '../store/types'
import { today } from '../lib/dates'
import { uid } from '../lib/format'
import { Accordion, Callout, Card, Checkbox, ConfirmDelete, cx, Editable, Empty, Field, Page, Progress, SectionTitle, Toggle } from '../components/ui'
import { AnalyseError, AnalyseResult, analyseSite } from '../lib/ai'

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
    .replace(/[ \t]+([,.])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()

const NEW_TEMPLATE = 'Bonjour {prenom},\n\n{observation}.\n\n{constat}.\n\n{valeur}\n\n{question}'
const NEW_TEMPLATE_SITE = 'Bonjour {prenom},\n\nJ’ai regardé le site de {commerce}.\n\n{constat}.\n\n{valeur}\n\n{question}'

/** Quand le commerce n'a pas de site du tout, l'angle ne vient pas d'une mesure. */
const NO_SITE_ANGLES: { angle: string; constat: string; valeur: string }[] = [
  {
    angle: 'Aucun site',
    constat: 'en cherchant « {secteur} {ville} » sur Google, je ne trouve pas de site à votre nom, seulement votre fiche',
    valeur: 'Je peux vous envoyer les trois réglages de la fiche Google qui rapportent le plus quand on n’a pas de site. C’est gratuit et vous les faites vous-même.',
  },
  {
    angle: 'Les concurrents',
    constat: 'deux {secteur}s de {ville} sortent avant vous parce qu’ils ont un site, même très simple',
    valeur: 'Je peux vous montrer lesquels et ce qu’ils ont de plus. Vous verrez que ce n’est pas grand-chose.',
  },
  {
    angle: 'Le soir, sur téléphone',
    constat: 'quelqu’un qui vous cherche à 19 h sur son téléphone ne trouve ni vos horaires ni un moyen de vous joindre en un clic',
    valeur: 'Je peux vous dire comment régler ça sans site, en dix minutes, directement depuis votre fiche Google.',
  },
]

const scoreColor = (score: number) => (score >= 75 ? '#30D158' : score >= 45 ? '#FF9F0A' : '#FF453A')

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
  const [website, setWebsite] = useState('')
  const [noSite, setNoSite] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalyseResult | null>(null)
  const [analyseError, setAnalyseError] = useState('')

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
    setWebsite(p.website ?? '')
    setNoSite(!(p.website ?? '').trim())
    setAnalysis(null)
    setAnalyseError('')
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
      secteur: (secteur.trim() || 'votre activité').toLowerCase(),
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
    const text = fillTemplate(tone.template || NEW_TEMPLATE, vars)
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

  const runAnalyse = async () => {
    setAnalysing(true)
    setAnalyseError('')
    setAnalysis(null)
    try {
      const result = await analyseSite({
        url: website, noSite, business: commerce, city: ville, sector: secteur, prenom,
        toneLabel: tone?.label ?? '', toneTemplate: tone?.template ?? '',
      })
      setAnalysis(result)
      // Le site analysé mérite d'être conservé sur la fiche du prospect.
      const p = prospects.find((x) => x.id === prospectId)
      if (p && website.trim() && p.website !== website.trim()) patch('prospects', p.id, { website: website.trim() })
    } catch (e) {
      setAnalyseError(e instanceof AnalyseError ? e.message : 'L’analyse a échoué.')
    } finally {
      setAnalysing(false)
    }
  }

  /** Compose un message à partir d'un constat mesuré, sans passer par l'IA. */
  const buildFromFinding = (constat: string, valeur: string, useSiteTemplate: boolean) => {
    if (!tone) return ''
    const template = (useSiteTemplate ? tone.templateSite : tone.template) || (useSiteTemplate ? NEW_TEMPLATE_SITE : NEW_TEMPLATE)
    const text = fillTemplate(template, {
      ...vars,
      constat: constat.replace(/\{(ville|secteur|commerce)\}/g, (_, k: string) => vars[k as 'ville' | 'secteur' | 'commerce'] ?? ''),
      valeur,
      question: vars.question || 'Je vous envoie ça ?',
    })
    return stripEmoji ? text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '') : text
  }

  /** Les propositions de l'IA quand elle est active, sinon celles construites depuis les mesures. */
  const proposals = useMemo(() => {
    if (analysis?.ai?.dms.length) return analysis.ai.dms.map((d) => ({ angle: d.angle, texte: d.texte, ia: true }))
    if (!analysis) return []
    if (noSite || !analysis.audit)
      return NO_SITE_ANGLES.map((a) => ({ angle: a.angle, texte: buildFromFinding(a.constat, a.valeur, false), ia: false }))
    const usable = analysis.audit.problems.filter((f) => f.dm)
    return usable.slice(0, 3).map((f) => ({ angle: f.label, texte: buildFromFinding(f.dm!.constat, f.dm!.valeur, true), ia: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, tone, vars, stripEmoji, noSite])

  const useProposal = (texte: string) => {
    setMessage(texte)
    setManual(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
              add('dmTones', { id: uid(), label: 'Nouveau style', hint: '', emoji: false, template: NEW_TEMPLATE, templateSite: NEW_TEMPLATE_SITE })
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
            <SectionTitle
              right={
                analysis?.audit?.reachable ? (
                  <span className="pill" style={{ background: scoreColor(analysis.audit.score) + '22', color: scoreColor(analysis.audit.score) }}>
                    {analysis.audit.score} / 100
                  </span>
                ) : undefined
              }
            >
              Analyse du site
            </SectionTitle>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              L’app ouvre le site, mesure ce qui cloche, puis compose des messages à partir de ces seuls constats. Rien n’est inventé. C’est gratuit. Avec une clé d’API renseignée sur le serveur, la rédaction est confiée à l’IA.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input"
                placeholder="boulangerieduport.fr"
                value={website}
                disabled={noSite}
                onChange={(e) => setWebsite(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !analysing) void runAnalyse() }}
              />
              <button className="btn-primary justify-center shrink-0" onClick={() => void runAnalyse()} disabled={analysing || (!noSite && !website.trim())}>
                {analysing ? <><Loader2 size={15} className="animate-spin" /> Analyse…</> : <><ScanSearch size={15} /> Analyser</>}
              </button>
            </div>
            <label className="inline-flex items-center gap-2.5 mt-3 text-sm text-muted cursor-pointer">
              <Checkbox checked={noSite} onChange={(v) => { setNoSite(v); setAnalysis(null) }} />
              Ce commerce n’a pas de site du tout
            </label>

            {analyseError && <div className="mt-4"><Callout tone="danger" title="Analyse impossible.">{analyseError}</Callout></div>}

            {analysis && (
              <div className="mt-5 space-y-5">
                {analysis.audit && !analysis.audit.reachable && (
                  <Callout tone="warn" title="Le site ne répond pas.">
                    {analysis.audit.error} C’est en soi le constat le plus parlant pour le commerçant.
                  </Callout>
                )}

                {analysis.audit?.reachable && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="label">Ce qui cloche</span>
                      <span className="text-[11px] text-muted">{analysis.audit.problems.length} défaut{analysis.audit.problems.length > 1 ? 's' : ''} sur {analysis.audit.findings.length} points vérifiés</span>
                    </div>
                    <Progress value={analysis.audit.score} color={scoreColor(analysis.audit.score)} />
                    <ul className="mt-3 space-y-2">
                      {analysis.audit.problems.slice(0, 7).map((f) => (
                        <li key={f.key} className="flex items-start gap-2.5 text-sm">
                          <AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />
                          <span className="text-txt/90 leading-snug"><b className="text-white font-medium">{f.label}.</b> {f.detail}</span>
                        </li>
                      ))}
                      {!analysis.audit.problems.length && <li className="text-sm text-ok">Aucun défaut mesurable. Le site est propre.</li>}
                    </ul>
                  </div>
                )}

                {analysis.aiError && <Callout tone="warn" title="Rédaction par IA indisponible.">{analysis.aiError}</Callout>}

                {analysis.ai && (
                  <>
                    <div>
                      <span className="label block mb-1.5">En une phrase</span>
                      <p className="text-[15px] text-white leading-relaxed">{analysis.ai.resume}</p>
                    </div>
                    {analysis.ai.priorites.length > 0 && (
                      <div>
                        <span className="label block mb-2">Les priorités</span>
                        <ol className="space-y-1.5">
                          {analysis.ai.priorites.map((t, i) => (
                            <li key={i} className="flex gap-2.5 text-sm text-txt/90">
                              <span className="w-5 h-5 rounded-pill bg-brand/15 text-brand text-[11px] font-bold grid place-content-center shrink-0">{i + 1}</span>
                              <span className="leading-snug">{t}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                )}

                {proposals.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="label">{proposals.length} message{proposals.length > 1 ? 's' : ''} proposé{proposals.length > 1 ? 's' : ''}</span>
                      <span className="text-[11px] text-muted">{proposals[0].ia ? 'Rédigés par l’IA' : 'Composés depuis les constats mesurés'}</span>
                    </div>
                    <div className="space-y-2">
                      {proposals.map((d, i) => (
                        <div key={i} className="card-2 !rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="pill bg-brand/15 text-brand"><Sparkles size={11} /> {d.angle}</span>
                            <button className="btn-ghost !py-1.5" onClick={() => useProposal(d.texte)}>Utiliser</button>
                          </div>
                          <p className="text-sm text-txt/90 leading-relaxed whitespace-pre-wrap">{d.texte}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
              add('dmTones', { id: uid(), label: 'Nouveau style', hint: 'Quand l’utiliser', emoji: false, template: NEW_TEMPLATE, templateSite: NEW_TEMPLATE_SITE })
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
          <div>
            <span className="label block mb-1.5">Message après un passage devant la boutique</span>
            <textarea className="input !min-h-[170px] font-mono !text-[12.5px] leading-relaxed" value={tone.template} onChange={(e) => onPatch({ template: e.target.value })} />
          </div>
          <div>
            <span className="label block mb-1.5">Message après l’analyse du site</span>
            <textarea className="input !min-h-[150px] font-mono !text-[12.5px] leading-relaxed" value={tone.templateSite ?? ''} onChange={(e) => onPatch({ templateSite: e.target.value })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Toggle checked={tone.emoji} onChange={(emoji) => onPatch({ emoji })} label="Emoji par défaut" />
            <ConfirmDelete onConfirm={onRemove} label="Supprimer ce style" />
          </div>
        </div>
      )}
    </div>
  )
}
