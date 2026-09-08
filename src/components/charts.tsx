import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, CartesianGrid } from 'recharts'
import { fmtEur, fmtNum } from '../lib/format'

const tooltipStyle = { background: '#1A1A1F', border: '1px solid #1F1F24', borderRadius: 14, color: '#F5F5F7', fontSize: 12, padding: '8px 12px' }

export function Bars({ data, money = true, height = 260, color = '#0071E3' }: { data: { name: string; value: number }[]; money?: boolean; height?: number; color?: string }) {
  const fmt = money ? fmtEur : fmtNum
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="#1F1F24" strokeDasharray="0" />
        <XAxis dataKey="name" tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? `${Math.round(v / 100) / 10}k` : String(v))} width={48} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v)), money ? 'Encaissé' : 'Valeur']} labelStyle={{ color: '#8A8A93' }} />
        <Bar dataKey="value" fill={color} radius={[8, 8, 8, 8]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, size = 200, center }: { data: { name: string; value: number; color: string; extra?: string }[]; size?: number; center?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const shown = total > 0 ? data.filter((d) => d.value > 0) : [{ name: 'Aucune donnée', value: 1, color: '#1F1F24' }]
  return (
    <div className="flex flex-col sm:flex-row items-center gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" innerRadius={size * 0.36} outerRadius={size * 0.48} paddingAngle={total > 0 ? 3 : 0} stroke="none" cornerRadius={6}>
              {shown.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            {total > 0 && <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${Math.round((Number(v) / total) * 100)} %`, n]} />}
          </PieChart>
        </ResponsiveContainer>
        {center && <div className="absolute inset-0 grid place-content-center text-center pointer-events-none"><span className="text-white font-bold text-lg">{center}</span></div>}
      </div>
      <ul className="space-y-2.5 text-sm w-full">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-pill shrink-0" style={{ background: d.color }} />
            <span className="flex-1 text-txt/90">{d.name}</span>
            <span className="text-muted tabular-nums">{total ? Math.round((d.value / total) * 100) : 0} %</span>
            {d.extra && <span className="text-[11px] text-muted w-16 text-right">{d.extra}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Lines({ data, keys, height = 240 }: { data: Record<string, number | string>[]; keys: { key: string; label: string; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#1F1F24" />
        <XAxis dataKey="name" tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#8A8A93', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#8A8A93' }} />
        {keys.map((k) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} strokeWidth={2.5} dot={{ r: 3, fill: k.color, strokeWidth: 0 }} activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}
