import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { PeriodFilter, PeriodKind } from '../store'
import { periodLabel, rangeFor, shiftPeriod } from '../lib/finance'
import { today } from '../lib/dates'
import { Segmented, Stepper } from './ui'

/** Filtre de période : Mois / Trimestre / Année / Personnalisé, avec navigation. */
export function PeriodPicker({ value, onChange, align = 'right' }: { value: PeriodFilter; onChange: (p: PeriodFilter) => void; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const setKind = (k: PeriodKind) => {
    if (k === 'perso') onChange({ ...value, kind: 'perso' })
    else onChange(rangeFor(k, value.kind === 'perso' ? today() : value.ref))
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="btn-ghost !py-2 !pl-3.5 !pr-3 text-[13px]">
        <CalendarDays size={15} className="text-muted" />
        {periodLabel(value)}
        <ChevronDown size={15} className="text-muted" />
      </button>
      {open && (
        <div className={`absolute z-40 top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} card !bg-panel shadow-lift p-3 w-[300px] animate-fadeIn space-y-3`}>
          <Segmented
            size="sm"
            value={value.kind}
            onChange={setKind}
            options={[
              { value: 'mois', label: 'Mois' },
              { value: 'trimestre', label: 'Trimestre' },
              { value: 'annee', label: 'Année' },
              { value: 'perso', label: 'Perso' },
            ]}
          />
          {value.kind === 'perso' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Du
                <input type="date" className="input mt-1 !py-2" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
              </label>
              <label className="text-xs text-muted">
                Au
                <input type="date" className="input mt-1 !py-2" value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
              </label>
            </div>
          ) : (
            <div className="flex justify-center">
              <Stepper label={periodLabel(value)} onPrev={() => onChange(shiftPeriod(value, -1))} onNext={() => onChange(shiftPeriod(value, 1))} />
            </div>
          )}
          <button className="text-xs font-semibold text-accent" onClick={() => (onChange(rangeFor(value.kind === 'perso' ? 'mois' : value.kind, today())), setOpen(false))}>
            Revenir à aujourd’hui
          </button>
        </div>
      )}
    </div>
  )
}
