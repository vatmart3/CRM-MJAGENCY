import { ReactNode, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { PeriodFilter } from '../store'
import { rangeFor } from '../lib/finance'
import { today } from '../lib/dates'
import { cx } from '../lib/format'
import { PeriodPicker } from './PeriodPicker'

/** Barre de recherche + filtres repliables, commune aux listes. */
export function FilterBar({ q, onQ, placeholder, children, active, onReset, right }: {
  q: string; onQ: (v: string) => void; placeholder: string; children?: ReactNode; active: number; onReset: () => void; right?: ReactNode
}) {
  const [open, setOpen] = useState(active > 0)
  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input className="input !rounded-pill pl-10 !bg-card" placeholder={placeholder} value={q} onChange={(e) => onQ(e.target.value)} />
          {q && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" onClick={() => onQ('')} aria-label="Effacer">
              <X size={15} />
            </button>
          )}
        </div>
        {children && (
          <button className={cx('btn-ghost !px-3.5 relative', open && '!bg-line/70')} onClick={() => setOpen(!open)} aria-label="Filtres">
            <SlidersHorizontal size={16} />
            <span className="hidden sm:inline">Filtres</span>
            {active > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-pill bg-accent text-ink text-[10px] font-bold grid place-content-center">{active}</span>}
          </button>
        )}
        {right}
      </div>
      {open && children && (
        <div className="card p-3.5 flex flex-wrap gap-2.5 items-end animate-fadeIn">
          {children}
          {active > 0 && (
            <button className="text-xs font-semibold text-accent ml-auto py-2" onClick={onReset}>
              Réinitialiser
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="min-w-[140px] flex-1 sm:flex-none">
      <span className="block text-[11px] text-muted mb-1">{label}</span>
      <select className="input !py-2 !text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Période optionnelle pour une liste : « Toutes les dates » ou une période précise. */
export function ListPeriod({ value, onChange }: { value: PeriodFilter | null; onChange: (p: PeriodFilter | null) => void }) {
  return (
    <div>
      <span className="block text-[11px] text-muted mb-1">Période</span>
      <div className="flex gap-2 items-center">
        <button className={cx('chip !py-2', !value && 'chip-on')} onClick={() => onChange(null)}>
          Toutes
        </button>
        {value ? <PeriodPicker value={value} onChange={onChange} align="left" /> : <button className="chip !py-2" onClick={() => onChange(rangeFor('mois', today()))}>Choisir…</button>}
      </div>
    </div>
  )
}

/** Bandeau de totaux au-dessus d'une liste. */
export function Totals({ items }: { items: { label: string; value: ReactNode; tone?: 'accent' | 'danger' | 'warn' | 'muted' }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {items.map((i) => (
        <div key={i.label} className="card px-4 py-3.5 fade-up">
          <p className="text-xs text-muted">{i.label}</p>
          <p className={cx('text-lg md:text-xl font-bold tracking-tight tnum mt-0.5', i.tone === 'accent' && 'text-accent', i.tone === 'danger' && 'text-danger', i.tone === 'warn' && 'text-warn')}>
            {i.value}
          </p>
        </div>
      ))}
    </div>
  )
}
