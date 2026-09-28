import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUp, ChevronDown, History, RotateCcw, Sparkles } from 'lucide-react'
import { useFlux } from '../store'
import { Answer, ask, EXEMPLES } from '../lib/assistant'
import { useRapports } from '../lib/weekly'
import { isoWeekLabel } from '../lib/finance'
import { cap, today } from '../lib/dates'
import { cx, uid } from '../lib/format'
import { getSyncStatus, onSyncStatus } from '../lib/sync'
import { Card, CardHead, Page, useReducedMotion } from '../components/ui'
import { Recommandations, SourceTag, WeeklyCard } from '../components/WeeklyCard'

type Msg = { id: string; role: 'user'; text: string } | { id: string; role: 'bot'; answer: Answer }

const STORAGE_KEY = 'flux-assistant-fil'
const MAX_MESSAGES = 40

const loadThread = (): Msg[] => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as Msg[]) : []
    return Array.isArray(list) ? list.filter((m) => m && (m.role === 'user' || m.role === 'bot')) : []
  } catch {
    return []
  }
}
const saveThread = (msgs: Msg[]) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_MESSAGES)))
  } catch {
    /* navigation privée : le fil reste en mémoire */
  }
}

// ── Morceaux du fil ─────────────────────────────────────────────────────────

function BotAvatar() {
  return (
    <span aria-hidden className="w-8 h-8 rounded-pill bg-accent text-ink grid place-content-center shrink-0 mt-0.5">
      <Sparkles size={15} />
    </span>
  )
}

const TILE_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }

function AnswerCard({ answer, onAsk, disabled }: { answer: Answer; onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex items-start gap-3 fade-up">
      <BotAvatar />
      <div className="card flex-1 min-w-0 p-4 md:p-5 !rounded-tl-lg">
        <p className="text-[15px] leading-relaxed">{answer.reponse}</p>
        {answer.chiffres.length > 0 && (
          <div className={cx('grid grid-cols-2 gap-2 mt-4', TILE_COLS[answer.chiffres.length])}>
            {answer.chiffres.map((c, i) => (
              <div key={i} className="card-2 px-3 py-2.5 min-w-0">
                <p className="text-[11px] text-muted leading-snug">{c.label}</p>
                <p className="font-bold tnum text-[17px] tracking-tight leading-tight mt-1 break-words">{c.valeur}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          {answer.suggestions.map((s) => (
            <button key={s} type="button" className="chip hover:border-line" onClick={() => onAsk(s)} disabled={disabled}>
              {s}
            </button>
          ))}
          <span className="ml-auto pl-1">
            <SourceTag source={answer.source} />
          </span>
        </div>
      </div>
    </div>
  )
}

function Thinking() {
  const reduced = useReducedMotion()
  return (
    <div className="flex items-start gap-3" role="status" aria-label="Calcul de la réponse">
      <BotAvatar />
      <div className="card px-4 py-3.5 !rounded-tl-lg inline-flex items-center gap-1.5">
        {reduced ? (
          <span className="text-sm text-muted">Je calcule…</span>
        ) : (
          [0, 150, 300].map((d) => <span key={d} className="w-2 h-2 rounded-pill bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />)
        )}
      </div>
    </div>
  )
}

// ── Historique des résumés hebdomadaires ────────────────────────────────────

function PastReports() {
  const rapports = useRapports().slice(1)
  if (!rapports.length) return null
  return (
    <Card>
      <CardHead title="Résumés précédents" sub={`${rapports.length} semaine${rapports.length > 1 ? 's' : ''}`} right={<History size={17} className="text-muted" />} />
      <div className="space-y-2">
        {rapports.map((r) => (
          <details key={r.id} className="group card-2 px-3.5 py-3">
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold">{cap(isoWeekLabel(r.semaine))}</span>
              <span className="flex items-center gap-2 shrink-0">
                <SourceTag source={r.source} />
                <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <p className="text-sm leading-relaxed mt-3">{r.resume}</p>
            {r.recommandations.length > 0 && (
              <div className="mt-3 [&_li]:!bg-card">
                <Recommandations items={r.recommandations} />
              </div>
            )}
          </details>
        ))}
      </div>
    </Card>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>(loadThread)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduced = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus)
  const dataReady = status !== 'connecting'
  const askedFromUrl = useRef(false)

  useEffect(() => saveThread(msgs), [msgs])

  const send = useCallback(async (q: string) => {
    const question = q.trim()
    if (!question || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setInput('')
    setMsgs((m) => [...m, { id: uid(), role: 'user' as const, text: question }].slice(-MAX_MESSAGES))
    try {
      const answer = await ask(question, useFlux.getState(), today())
      setMsgs((m) => [...m, { id: uid(), role: 'bot' as const, answer }].slice(-MAX_MESSAGES))
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  // ?q=… : la question arrive d'ailleurs (recherche, tableau de bord). On la pose une fois les données chargées.
  useEffect(() => {
    const q = params.get('q')
    if (!q || askedFromUrl.current || !dataReady) return
    askedFromUrl.current = true
    void send(q)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [params, dataReady, send, setParams])

  // Garde la dernière réponse et le champ de saisie en vue.
  useEffect(() => {
    if (msgs.length || pending) endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  }, [msgs.length, pending, reduced])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(input)
    inputRef.current?.focus()
  }

  const clear = () => {
    setMsgs([])
    inputRef.current?.focus()
  }

  return (
    <Page
      title="Assistant"
      subtitle="Pose une question sur tes chiffres"
      actions={
        msgs.length > 0 && (
          <button className="btn-ghost" onClick={clear} disabled={pending}>
            <RotateCcw size={15} />
            Nouvelle conversation
          </button>
        )
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="min-w-0 space-y-4" aria-label="Conversation">
          {msgs.length === 0 && (
            <Card className="hero-grad overflow-hidden">
              <div className="absolute inset-0 mosaic pointer-events-none" aria-hidden />
              <div className="relative">
                <span className="w-11 h-11 rounded-2xl bg-accent text-ink grid place-content-center mb-4" aria-hidden>
                  <Sparkles size={20} />
                </span>
                <h2 className="text-xl font-semibold tracking-tight">Une question sur tes chiffres ?</h2>
                <p className="text-sm text-muted mt-1.5 max-w-md">
                  Dépenses, chiffre d’affaires, clients, URSSAF, seuils de TVA, trésorerie… Demande comme tu le dirais à ton comptable.
                </p>
                <div className="flex flex-wrap gap-2 mt-5">
                  {EXEMPLES.map((q) => (
                    <button key={q} type="button" className="chip !py-2 hover:border-line text-left" onClick={() => void send(q)} disabled={pending}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-4" aria-live="polite">
            {msgs.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end fade-up">
                  <p className="max-w-[85%] bg-accent text-ink rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-snug break-words">{m.text}</p>
                </div>
              ) : (
                <AnswerCard key={m.id} answer={m.answer} onAsk={(q) => void send(q)} disabled={pending} />
              ),
            )}
            {pending && <Thinking />}
          </div>

          <form onSubmit={onSubmit} className="relative" role="search">
            <label htmlFor="assistant-q" className="sr-only">
              Ta question
            </label>
            <input
              id="assistant-q"
              ref={inputRef}
              className="input !rounded-pill !h-14 !pl-5 !pr-16 !text-base !bg-card shadow-soft"
              placeholder="Ex. : combien j’ai dépensé en pub ce trimestre ?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              enterKeyHint="send"
              maxLength={500}
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-pill bg-accent text-ink grid place-content-center transition-[opacity,transform] active:scale-95 disabled:opacity-40"
              disabled={!input.trim() || pending}
              aria-label="Envoyer la question"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          </form>
          {msgs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {EXEMPLES.slice(3).map((q) => (
                <button key={q} type="button" className="chip hover:border-line" onClick={() => void send(q)} disabled={pending}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Résumés hebdomadaires">
          <WeeklyCard />
          <PastReports />
        </aside>
      </div>
    </Page>
  )
}
