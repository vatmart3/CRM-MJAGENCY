import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, TrendingDown, TrendingUp, X } from 'lucide-react'
import { cx, eur, parseAmount } from '../lib/format'
import { RecetteStatut } from '../types'

// ── Mouvement ───────────────────────────────────────────────────────────────

export function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Fait défiler un nombre jusqu'à sa valeur, en repartant de la précédente. */
export function useCountUp(value: number, duration = 900) {
  const reduced = useReducedMotion()
  const [v, setV] = useState(reduced ? value : 0)
  const from = useRef(reduced ? value : 0)
  useEffect(() => {
    if (reduced) {
      setV(value)
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - p, 4)
      const cur = a + (value - a) * e
      setV(cur)
      from.current = cur
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])
  return v
}

export function CountUp({ value, format = eur, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const v = useCountUp(value)
  return <span className={cx('tnum', className)}>{format(v)}</span>
}

/** Montant éditorial : les euros en grand, les centimes en retrait. */
export function Money({ value, className, cents = true, animate = true }: { value: number; className?: string; cents?: boolean; animate?: boolean }) {
  const counted = useCountUp(value)
  const v = animate ? counted : value
  const s = eur(v)
  const m = s.match(/^(.*?)(,\d{2})(\s?€)$/)
  if (!m || !cents) return <span className={cx('tnum', className)}>{cents ? s : s.replace(/,\d{2}/, '')}</span>
  return (
    <span className={cx('tnum whitespace-nowrap', className)}>
      {m[1]}
      <span className="opacity-45 text-[0.62em] font-semibold">{m[2]}</span>
      <span className="text-[0.62em] font-semibold ml-0.5">€</span>
    </span>
  )
}

// ── Structure ───────────────────────────────────────────────────────────────

export function Page({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5 md:mb-6">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-[28px] font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ className, children, onClick, delay = 0 }: { className?: string; children: ReactNode; onClick?: () => void; delay?: number }) {
  return (
    <div
      onClick={onClick}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cx('card p-5 fade-up relative', onClick && 'cursor-pointer hover:border-line transition-colors', className)}
    >
      {children}
    </div>
  )
}

export function CardHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="h-card">{title}</h2>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Delta({ value, suffix = 'vs mois dernier', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-muted">{suffix === 'vs mois dernier' ? 'Premier mois suivi' : '—'}</span>
  if (value === 0) return <span className="text-xs text-muted whitespace-nowrap">stable {suffix}</span>
  const up = value > 0
  const good = invert ? !up : up
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap max-w-full overflow-hidden">
      <span className={cx('inline-flex items-center gap-1 font-semibold tnum', good ? 'text-accent' : 'text-danger')}>
        {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(value) >= 1 ? 0 : 1 })} %
      </span>
      <span className="text-muted truncate">{suffix}</span>
    </span>
  )
}

export const variation = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : cur > 0 ? null : 0)

export function Avatar({ name, tone = 'accent', size = 32 }: { name: string; tone?: 'accent' | 'muted' | 'warn'; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cx(
        'rounded-pill grid place-content-center font-bold shrink-0',
        tone === 'accent' && 'bg-accent text-ink',
        tone === 'muted' && 'bg-card2 text-txt',
        tone === 'warn' && 'bg-warn/20 text-warn',
      )}
    >
      {ini || '?'}
    </span>
  )
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'warn' | 'danger' | 'expense' }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))))
    return () => cancelAnimationFrame(t)
  }, [value])
  const color = { accent: 'rgb(var(--accent))', warn: 'rgb(var(--warn))', danger: 'rgb(var(--danger))', expense: 'rgb(var(--expense))' }[tone]
  return (
    <div className="bar">
      <span style={{ width: `${w * 100}%`, background: color }} />
    </div>
  )
}

// ── Statuts ─────────────────────────────────────────────────────────────────

export function StatutBadge({ statut }: { statut: RecetteStatut }) {
  const cls = {
    Encaissée: 'bg-accent/15 text-accent',
    'En attente': 'bg-card2 text-txt',
    'En retard': 'bg-danger/15 text-danger',
    Annulée: 'bg-card2 text-muted line-through',
  }[statut]
  return <span className={cx('pill', cls)}>{statut}</span>
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'danger' }) {
  const cls = { muted: 'bg-card2 text-muted', accent: 'bg-accent/15 text-accent', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger' }[tone]
  return <span className={cx('pill', cls)}>{children}</span>
}

// ── Formulaires ─────────────────────────────────────────────────────────────

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  )
}

/** Saisie de montant : clavier numérique sur mobile, accepte « 1 234,50 ». */
export function MoneyInput({ value, onChange, autoFocus, big, placeholder = '0,00', className }: {
  value: number; onChange: (n: number) => void; autoFocus?: boolean; big?: boolean; placeholder?: string; className?: string
}) {
  const [raw, setRaw] = useState(value ? String(value).replace('.', ',') : '')
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      setRaw(value ? String(value).replace('.', ',') : '')
      last.current = value
    }
  }, [value])
  return (
    <div className={cx('relative', className)}>
      <input
        className={cx('input tnum pr-9', big && '!text-[34px] !font-bold !py-3 tracking-tight')}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={raw}
        onChange={(e) => {
          const s = e.target.value.replace(/[^\d.,\s]/g, '')
          setRaw(s)
          const n = parseAmount(s)
          last.current = n
          onChange(n)
        }}
      />
      <span className={cx('absolute right-3.5 top-1/2 -translate-y-1/2 text-muted font-semibold pointer-events-none', big ? 'text-2xl' : 'text-sm')}>€</span>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex p-1 rounded-pill bg-card2 gap-0.5 max-w-full overflow-x-auto">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-pill font-semibold whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
            value === o.value ? 'bg-accent text-ink shadow-sm' : 'text-muted hover:text-txt',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <label htmlFor={id} className={cx('inline-flex items-center gap-3 cursor-pointer select-none', disabled && 'opacity-50 pointer-events-none')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-11 h-[26px] rounded-pill transition-colors shrink-0', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-[3px] left-[3px] w-5 h-5 rounded-pill bg-white shadow transition-transform duration-200', checked && 'translate-x-[18px]')} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button type="button" key={o.value} onClick={() => onChange(o.value)} className={cx('chip', value === o.value && 'chip-on')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Fenêtres ────────────────────────────────────────────────────────────────

let locks = 0

/** Feuille qui monte du bas sur mobile, fenêtre centrée sur ordinateur. */
export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    // Compteur partagé : plusieurs feuilles peuvent s'empiler (scan → dépense).
    locks++
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      locks = Math.max(0, locks - 1)
      if (!locks) document.body.style.overflow = ''
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <div
        className={cx(
          'relative w-full bg-panel border border-line/70 shadow-lift animate-sheetUp flex flex-col',
          'rounded-t-[28px] md:rounded-[26px] max-h-[92dvh] md:max-h-[88vh]',
          wide ? 'md:max-w-3xl' : 'md:max-w-lg',
        )}
      >
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1 rounded-pill bg-line" />
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 pt-4 md:pt-5 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button className="btn-icon -mr-2" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 md:px-6 pb-5 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="px-5 md:px-6 py-4 border-t border-line/60 safe-bottom flex flex-wrap gap-2 justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ── États vides ─────────────────────────────────────────────────────────────

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-pill bg-accent/20 blur-xl" />
        <div className="relative w-14 h-14 rounded-2xl bg-card2 border border-line/70 grid place-content-center text-accent">{icon}</div>
      </div>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm text-muted mt-1 max-w-xs">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      className={cx(
        'flex items-start gap-3 rounded-2xl px-4 py-3 text-sm',
        tone === 'info' && 'bg-accent/10 text-txt',
        tone === 'warn' && 'bg-warn/12 text-txt',
        tone === 'danger' && 'bg-danger/12 text-txt',
      )}
    >
      <Icon size={17} className={cx('mt-0.5 shrink-0', tone === 'info' ? 'text-accent' : tone === 'warn' ? 'text-warn' : 'text-danger')} />
      <div className="flex-1 min-w-0">{children}</div>
      {action}
    </div>
  )
}

// ── Notifications éphémères et coche de validation ─────────────────────────

export interface Toast {
  id: number
  title: string
  text?: string
  tone?: 'success' | 'error' | 'info'
}
interface ToastState {
  toasts: Toast[]
  check: number
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}
let seq = 0
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  check: 0,
  push: (t) => {
    const id = ++seq
    set({ toasts: [...get().toasts, { ...t, id }], check: t.tone === 'success' ? id : get().check })
    setTimeout(() => get().dismiss(id), t.tone === 'error' ? 7000 : 5200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))
export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t)

/** Grande coche animée affichée au centre après chaque saisie réussie. */
function SuccessCheck() {
  const check = useToasts((s) => s.check)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!check) return
    setShown(check)
    const t = setTimeout(() => setShown(0), 1100)
    return () => clearTimeout(t)
  }, [check])
  if (!shown) return null
  return (
    <div key={shown} className="fixed inset-0 z-[80] pointer-events-none grid place-content-center">
      <div className="w-24 h-24 rounded-[30px] bg-panel/90 border border-line/60 shadow-lift grid place-content-center animate-pop backdrop-blur">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="29" stroke="rgb(var(--accent))" strokeWidth="3.5" className="ring-draw" strokeLinecap="round" transform="rotate(-90 32 32)" />
          <path d="M20 33.5l8 8 16-17" stroke="rgb(var(--accent))" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="check-draw" />
        </svg>
      </div>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return createPortal(
    <>
      <SuccessCheck />
      <div className="fixed z-[90] left-1/2 -translate-x-1/2 top-3 md:top-5 md:left-auto md:right-6 md:translate-x-0 w-[calc(100%-24px)] max-w-sm space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="card !bg-panel shadow-lift px-4 py-3 flex items-start gap-3 animate-sheetUp" role="status">
            <span
              className={cx(
                'mt-0.5 w-6 h-6 rounded-pill grid place-content-center shrink-0',
                t.tone === 'error' ? 'bg-danger/15 text-danger' : t.tone === 'info' ? 'bg-card2 text-txt' : 'bg-accent text-ink',
              )}
            >
              {t.tone === 'error' ? <AlertTriangle size={13} /> : t.tone === 'info' ? <Info size={13} /> : <Check size={14} strokeWidth={3} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.text && <p className="text-[13px] text-muted mt-0.5 leading-snug">{t.text}</p>}
            </div>
            <button className="text-muted hover:text-txt" onClick={() => dismiss(t.id)} aria-label="Fermer">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body,
  )
}

// ── Navigation de période ───────────────────────────────────────────────────

export function Stepper({ label, onPrev, onNext }: { label: ReactNode; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="inline-flex items-center gap-1 bg-card2 rounded-pill p-1">
      <button className="btn-icon !w-8 !h-8" onClick={onPrev} aria-label="Période précédente">
        <ChevronLeft size={16} />
      </button>
      <span className="text-[13px] font-semibold px-1.5 min-w-[7rem] text-center">{label}</span>
      <button className="btn-icon !w-8 !h-8" onClick={onNext} aria-label="Période suivante">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

/** Petit menu d'actions déroulant, rendu hors du flux pour ne jamais être rogné par une carte. */
export function Menu({ trigger, items }: { trigger: ReactNode; items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }[] }) {
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pos) return
    const close = (e: Event) => {
      if (e.type === 'mousedown' && (panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node))) return
      setPos(null)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])
  const visible = items.filter((i) => !i.hidden)
  return (
    <>
      <span
        ref={anchor}
        className="inline-flex"
        onClick={(e) => {
          e.stopPropagation()
          if (pos) return setPos(null)
          const r = anchor.current!.getBoundingClientRect()
          const up = window.innerHeight - r.bottom < visible.length * 40 + 24
          setPos({ top: up ? r.top - 4 : r.bottom + 4, right: Math.max(8, window.innerWidth - r.right), up })
        }}
      >
        {trigger}
      </span>
      {pos &&
        createPortal(
          <div
            ref={panel}
            style={{ top: pos.top, right: pos.right, transform: pos.up ? 'translateY(-100%)' : undefined }}
            className="fixed z-[75] min-w-[200px] max-w-[calc(100vw-16px)] card !bg-panel shadow-lift p-1.5 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((i) => (
              <button
                key={i.label}
                onClick={() => {
                  setPos(null)
                  i.onClick()
                }}
                className={cx('w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left hover:bg-card2', i.danger && 'text-danger')}
              >
                {i.icon}
                {i.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

/** Détection simple de la largeur, pour choisir entre tableau et cartes. */
export function useIsDesktop(min = 768) {
  const q = `(min-width: ${min}px)`
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setOk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return ok
}
