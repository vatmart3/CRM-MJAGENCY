import { ArrowUpRight, ChevronDown, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtPct } from '../lib/format'
import { Assignee, User } from '../store/types'
import { useStore } from '../store'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ——— Page shell ———
export function Page({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-[1400px] mx-auto px-5 md:px-8 pb-24 md:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-8">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-white tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-muted mt-1.5 text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ className, children, accent, onClick }: { className?: string; children: ReactNode; accent?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('card p-6 fade-up relative overflow-hidden', onClick && 'cursor-pointer hover:border-muted/40', className)}>
      {accent && <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />}
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-semibold text-white">{children}</h2>
      {right}
    </div>
  )
}

// ——— Counter animation ———
export function useCountUp(value: number, duration = 700) {
  const [v, setV] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    const to = value
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setV(from + (to - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return v
}

export function KpiCard({ label, value, format, variation, sub, primary, to, onClick }: {
  label: string; value: number; format?: (n: number) => string; variation?: number | null; sub?: string; primary?: boolean; to?: string; onClick?: () => void
}) {
  const v = useCountUp(value)
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('fr-FR'))
  const up = (variation ?? 0) >= 0
  return (
    <div
      onClick={onClick}
      className={cx('rounded-card p-6 fade-up flex flex-col justify-between min-h-[172px] border', primary ? 'bg-brand border-brand text-white' : 'card', (onClick || to) && 'cursor-pointer')}
    >
      <div className="flex items-start justify-between">
        <span className={cx('label', primary && 'text-white/75')}>{label}</span>
        <span className={cx('w-8 h-8 rounded-pill grid place-content-center', primary ? 'bg-white/15 text-white' : 'bg-card2 text-muted')}>
          <ArrowUpRight size={15} />
        </span>
      </div>
      <div className={cx('big mt-4', primary && 'text-white')}>{fmt(v)}</div>
      <div className="flex items-center gap-2 mt-4">
        {variation !== null && variation !== undefined && (
          <span className={cx('pill', primary ? 'bg-white/15 text-white' : up ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger')}>
            {up ? '▲' : '▼'} {fmtPct(Math.abs(variation))}
          </span>
        )}
        <span className={cx('text-xs', primary ? 'text-white/70' : 'text-muted')}>{sub ?? 'vs période précédente'}</span>
      </div>
    </div>
  )
}

// ——— Status pills ———
const STATUS_COLORS: Record<string, string> = {
  'À contacter': '#8A8A93', 'Contacté': '#4DA3FF', 'Conversation engagée': '#BF5AF2', 'RDV planifié': '#FFD60A', 'Devis envoyé': '#FF9F0A', 'Gagné': '#30D158', 'Perdu': '#FF453A',
  'Brouillon': '#8A8A93', 'Envoyé': '#4DA3FF', 'Relancé': '#FF9F0A', 'Signé': '#30D158', 'Refusé': '#FF453A', 'Expiré': '#8A8A93',
  'Contrat signé': '#4DA3FF', 'Actif': '#30D158', 'Inactif': '#8A8A93',
  'À produire': '#8A8A93', 'Produit': '#BF5AF2', 'Programmé': '#FF9F0A', 'Publié': '#30D158',
  'Non traitée': '#8A8A93', 'En discussion': '#FF9F0A', 'Tranchée': '#30D158',
  'Preuve': '#0071E3', 'Pédagogie': '#30D158', 'Coulisses': '#BF5AF2', 'Local': '#FF9F0A', 'Offre': '#FFD60A',
}
export const statusColor = (s: string) => STATUS_COLORS[s] ?? '#8A8A93'
export function StatusPill({ status, color }: { status: string; color?: string }) {
  const c = color ?? statusColor(status)
  return (
    <span className="pill" style={{ background: c + '22', color: c }}>
      <span className="w-1.5 h-1.5 rounded-pill" style={{ background: c }} />
      {status}
    </span>
  )
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cx('inline-block w-2 h-2 rounded-pill shrink-0', className)} style={{ background: color }} />
}

// ——— Users / avatars ———
export function Avatar({ user, size = 28, label }: { user?: User | null; size?: number; label?: string }) {
  const bg = user?.color ?? '#3A3A40'
  const txt = user?.id === 'matheis' ? '#0B0B0D' : '#fff'
  const initials = user?.initials ?? label ?? '—'
  return (
    <span title={user?.name ?? label} className="inline-grid place-content-center rounded-pill font-bold shrink-0" style={{ width: size, height: size, background: bg, color: txt, fontSize: size * 0.36 }}>
      {initials}
    </span>
  )
}

export const assigneeLabel = (a: Assignee, users: User[]) => {
  if (a === 'both') return 'Les deux'
  if (a === 'insta') return 'Pilote Insta'
  if (a === 'deliverer') return 'Celui qui livre'
  return users.find((u) => u.id === a)?.name ?? a
}
export function AssigneeBadge({ assignee, size = 24 }: { assignee: Assignee; size?: number }) {
  const users = useStore((s) => s.users)
  if (assignee === 'both')
    return (
      <span className="inline-flex -space-x-1.5" title="Les deux">
        {users.map((u) => <Avatar key={u.id} user={u} size={size} />)}
      </span>
    )
  const u = users.find((x) => x.id === assignee)
  if (u) return <Avatar user={u} size={size} />
  return <span className="pill bg-card2 text-muted border border-line">{assigneeLabel(assignee, users)}</span>
}

// ——— Forms ———
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  )
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-sm">
      <span className={cx('w-10 h-6 rounded-pill relative', checked ? 'bg-brand' : 'bg-white/10')}>
        <span className={cx('absolute top-0.5 w-5 h-5 rounded-pill bg-white', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label && <span className={checked ? 'text-txt' : 'text-muted'}>{label}</span>}
    </button>
  )
}
export function Checkbox({ checked, onChange, className }: { checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return <input type="checkbox" className={cx('cb', className)} checked={checked} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()} />
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex bg-card2 border border-line rounded-pill p-1 gap-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('px-3.5 py-1.5 rounded-pill text-xs font-medium', value === o.value ? 'bg-brand text-white' : 'text-muted hover:text-txt')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ——— Modal ———
export function Modal({ open, onClose, title, children, width = 'max-w-2xl', footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div onMouseDown={(e) => e.stopPropagation()} className={cx('relative w-full bg-card border border-line rounded-t-card md:rounded-card max-h-[92vh] flex flex-col fade-up', width)}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDelete({ onConfirm, label = 'Supprimer' }: { onConfirm: () => void; label?: string }) {
  const [ask, setAsk] = useState(false)
  if (ask)
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted">Confirmer ?</span>
        <button className="btn-danger !py-1.5" onClick={() => { onConfirm(); setAsk(false) }}>Oui, supprimer</button>
        <button className="btn-ghost !py-1.5" onClick={() => setAsk(false)}>Annuler</button>
      </span>
    )
  return <button className="btn-danger" onClick={() => setAsk(true)}><Trash2 size={14} /> {label}</button>
}

// ——— Row menu (⋯) ———
export function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button className="btn-icon" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-card2 border border-line rounded-2xl p-1.5 shadow-xl">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick() }} className={cx('w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-white/5', it.danger ? 'text-danger' : 'text-txt')}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ——— Table ———
export function Table({ head, children, className }: { head: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b border-line">{head}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th className={cx('th', className)}>{children}</th>
export const Td = ({ children, className, onClick }: { children?: ReactNode; className?: string; onClick?: () => void }) => <td onClick={onClick} className={cx('td', className)}>{children}</td>

export function FilterChips({ chips, onRemove, onClear }: { chips: { key: string; label: string }[]; onRemove: (k: string) => void; onClear?: () => void }) {
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span key={c.key} className="chip">
          {c.label}
          <button onClick={() => onRemove(c.key)} className="text-muted hover:text-txt"><X size={12} /></button>
        </span>
      ))}
      {onClear && chips.length > 1 && <button onClick={onClear} className="text-xs text-muted hover:text-txt">Tout effacer</button>}
    </div>
  )
}

export function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (p: number) => void; total: number }) {
  if (pages <= 1) return <div className="text-xs text-muted px-1">{total} élément{total > 1 ? 's' : ''}</div>
  return (
    <div className="flex items-center justify-between text-xs text-muted px-1">
      <span>{total} éléments</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-ghost !py-1 !px-3">‹</button>
        <span className="px-2">{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn-ghost !py-1 !px-3">›</button>
      </div>
    </div>
  )
}

export function usePagination<T>(items: T[], perPage = 12) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const safe = Math.min(page, pages)
  const slice = items.slice((safe - 1) * perPage, safe * perPage)
  return { page: safe, pages, setPage, slice, total: items.length }
}

// ——— Empty state ———
export function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 gap-4">
      <p className="text-muted text-sm max-w-sm">{text}</p>
      {action && onAction && <button className="btn-primary" onClick={onAction}><Plus size={15} /> {action}</button>}
    </div>
  )
}

// ——— Accordion ———
export function Accordion({ title, children, defaultOpen = false, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card fade-up overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-6 py-5 text-left">
        <span className="text-base font-semibold text-white">{title}</span>
        <span className="flex items-center gap-3">
          {right}
          <ChevronDown size={18} className={cx('text-muted transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="px-6 pb-6 border-t border-line pt-5">{children}</div>}
    </div>
  )
}

// ——— Progress ———
export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx('progress', className)}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

// ——— Inline editable text ———
export function Editable({ value, onChange, className, multiline, placeholder }: { value: string; onChange: (v: string) => void; className?: string; multiline?: boolean; placeholder?: string }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (edit) {
    const common = {
      autoFocus: true, value: v, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
      onBlur: () => { setEdit(false); if (v !== value) onChange(v) },
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') { setV(value); setEdit(false) } if (e.key === 'Enter' && !multiline) { (e.target as HTMLElement).blur() } },
      className: cx('input', className),
    }
    return multiline ? <textarea {...common} rows={4} /> : <input {...common} />
  }
  return (
    <span onClick={() => setEdit(true)} title="Cliquer pour modifier" className={cx('cursor-text hover:bg-white/5 rounded-lg -mx-1 px-1 whitespace-pre-wrap', !value && 'text-muted italic', className)}>
      {value || placeholder || 'Cliquer pour renseigner'}
    </span>
  )
}

export function Stars({ n, onChange }: { n: number; onChange?: (n: 1 | 2 | 3) => void }) {
  return (
    <span className="inline-flex gap-0.5 text-sm">
      {[1, 2, 3].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i as 1 | 2 | 3)} className={cx(i <= n ? 'text-yellow' : 'text-white/15', onChange && 'hover:text-yellow')}>★</button>
      ))}
    </span>
  )
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children: ReactNode }) {
  const c = { info: '#0071E3', warn: '#FF9F0A', danger: '#FF453A', ok: '#30D158' }[tone]
  return (
    <div className="rounded-2xl p-4 border text-sm" style={{ background: c + '12', borderColor: c + '44' }}>
      {title && <div className="font-semibold mb-1" style={{ color: c }}>{title}</div>}
      <div className="text-txt/90 leading-relaxed">{children}</div>
    </div>
  )
}
