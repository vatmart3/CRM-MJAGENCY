import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MonthPoint, Niveau } from '../lib/finance'
import { cx, eur, eurK, pct } from '../lib/format'
import { useThemeColors } from '../lib/theme'
import { useReducedMotion } from './ui'

// ── Tooltip commun ──────────────────────────────────────────────────────────

type TipItem = { name?: string; value?: number; color?: string; dataKey?: string | number }
function Tip({ active, payload, label }: { active?: boolean; payload?: TipItem[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card !bg-panel shadow-lift px-3.5 py-2.5 text-xs min-w-[150px]">
      {label && <p className="font-semibold mb-1.5 capitalize">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="w-2 h-2 rounded-pill" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tnum">{eur(Number(p.value) || 0)}</span>
        </p>
      ))}
    </div>
  )
}

// ── 12 mois : barres recettes / dépenses + courbe du résultat ──────────────

export function TwelveMonths({ data, height = 260 }: { data: MonthPoint[]; height?: number }) {
  const c = useThemeColors()
  const reduced = useReducedMotion()
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} barGap={3} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={1} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: c.muted }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: c.muted }} tickFormatter={(v: number) => (v === 0 ? '0' : eurK(v))} />
          <Tooltip content={<Tip />} cursor={{ fill: c.alpha(c.txt, 0.04) }} />
          <Bar dataKey="recettes" name="Recettes" fill="url(#gRec)" radius={[6, 6, 2, 2]} maxBarSize={18} isAnimationActive={!reduced} animationDuration={900} />
          <Bar dataKey="depenses" name="Dépenses" fill={c.expense} radius={[6, 6, 2, 2]} maxBarSize={18} isAnimationActive={!reduced} animationDuration={900} animationBegin={150} />
          <Line
            dataKey="resultat"
            name="Résultat"
            type="monotone"
            stroke={c.txt}
            strokeWidth={2}
            dot={{ r: 2.5, fill: c.txt, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: c.accent, stroke: c.card, strokeWidth: 2 }}
            isAnimationActive={!reduced}
            animationDuration={1400}
            animationBegin={400}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className={cx(i.line ? 'w-3.5 h-0.5' : 'w-2.5 h-2.5 rounded-[3px]')} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

// ── Anneau des dépenses par catégorie ───────────────────────────────────────

export function Donut({ data, center, sub, size = 200 }: { data: { nom: string; total: number }[]; center: string; sub: string; size?: number }) {
  const c = useThemeColors()
  const reduced = useReducedMotion()
  const empty = data.length === 0
  const rows = empty ? [{ nom: 'vide', total: 1 }] : data
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="total"
            nameKey="nom"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={empty || rows.length === 1 ? 0 : 2.5}
            cornerRadius={6}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={!reduced}
            animationDuration={1000}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={empty ? c.card2 : c.palette[i % c.palette.length]} />
            ))}
          </Pie>
          {!empty && <Tooltip content={<Tip />} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-content-center text-center pointer-events-none">
        <span className="text-[22px] font-bold tracking-tight tnum">{center}</span>
        <span className="text-xs text-muted">{sub}</span>
      </div>
    </div>
  )
}

// ── Mini barres (tendance dans une carte chiffre) ──────────────────────────

export function Sparkbars({ values, tone = 'accent', height = 34 }: { values: number[]; tone?: 'accent' | 'expense'; height?: number }) {
  const max = Math.max(...values, 1)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(t)
  }, [])
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={cx('w-[6px] rounded-[2px] transition-[height] duration-700', tone === 'accent' ? 'bg-accent' : 'bg-expense', i < values.length - 1 && 'opacity-40')}
          style={{ height: on ? `${Math.max(8, (v / max) * 100)}%` : '8%', transitionDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  )
}

// ── Jauge en demi-cercle (objectif, seuils) ────────────────────────────────

const niveauColor = (n: Niveau | 'accent', c: ReturnType<typeof useThemeColors>) => (n === 'critique' ? c.danger : n === 'attention' ? c.warn : c.accent)

export function HalfGauge({ value, niveau = 'accent', size = 150, stroke = 12, children }: {
  value: number; niveau?: Niveau | 'accent'; size?: number; stroke?: number; children?: React.ReactNode
}) {
  const c = useThemeColors()
  const r = (size - stroke) / 2
  const len = Math.PI * r
  const [v, setV] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setV(Math.max(0, Math.min(1, value))))
    return () => cancelAnimationFrame(t)
  }, [value])
  const h = size / 2 + stroke / 2
  return (
    <div className="relative" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke={c.alpha(c.txt, 0.08)} strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={niveauColor(niveau, c)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - v)}
          style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(.2,.8,.2,1), stroke 300ms' }}
        />
        {/* Aiguille, comme la jauge de la maquette */}
        <g style={{ transform: `rotate(${-90 + v * 180}deg)`, transformOrigin: `${size / 2}px ${size / 2}px`, transition: 'transform 1100ms cubic-bezier(.2,.8,.2,1)' }}>
          <line x1={size / 2} y1={size / 2} x2={size / 2} y2={size / 2 - r + stroke * 1.4} stroke={c.txt} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={4} fill={c.txt} />
        </g>
      </svg>
      {children && <div className="absolute inset-x-0 bottom-0 text-center">{children}</div>}
    </div>
  )
}

/** Jauge linéaire de seuil, avec marques à 80 % et 95 %. */
export function ThresholdBar({ ratio, niveau }: { ratio: number; niveau: Niveau }) {
  const c = useThemeColors()
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(Math.min(1, ratio)))
    return () => cancelAnimationFrame(t)
  }, [ratio])
  return (
    <div className="relative h-3 rounded-pill overflow-hidden" style={{ background: c.alpha(c.txt, 0.07) }}>
      <span
        className="absolute inset-y-0 left-0 rounded-pill"
        style={{ width: `${w * 100}%`, background: niveauColor(niveau, c), transition: 'width 1100ms cubic-bezier(.2,.8,.2,1), background 300ms' }}
      />
      <span className="absolute inset-y-0 w-px" style={{ left: '80%', background: c.alpha(c.txt, 0.25) }} />
      <span className="absolute inset-y-0 w-px" style={{ left: '95%', background: c.alpha(c.txt, 0.25) }} />
    </div>
  )
}

export const ratioLabel = (r: number) => pct(r * 100)
