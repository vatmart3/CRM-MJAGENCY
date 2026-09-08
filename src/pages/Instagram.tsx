import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Minus, Pencil, Plus } from 'lucide-react'
import { useStore } from '../store'
import { Pillar, PILLARS, Post, POST_STATUSES, PostStatus } from '../store/types'
import { PostForm } from '../components/forms'
import { Donut } from '../components/charts'
import { Callout, Card, Checkbox, Editable, Empty, FilterChips, Page, Pagination, Progress, RowMenu, SectionTitle, Segmented, StatusPill, Table, Td, Th, cx, statusColor, usePagination } from '../components/ui'
import { dmStreak, PILLAR_COLORS, pillarSplit } from '../lib/selectors'
import { addDays, fmtDate, today, toISO } from '../lib/dates'
import { fmtNum } from '../lib/format'

type View = 'table' | 'calendar'
const WEEKS = [1, 2, 3, 4] as const
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const nextStatus = (s: PostStatus): PostStatus | null => POST_STATUSES[POST_STATUSES.indexOf(s) + 1] ?? null
const isStatus = (s: string): s is PostStatus => (POST_STATUSES as string[]).includes(s)

export default function InstagramPage() {
  const { posts, dmLogs, settings, setSettings, addDm, patch, remove } = useStore()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('table')
  const [form, setForm] = useState<{ open: boolean; post: Post | null }>({ open: false, post: null })
  const [week, setWeek] = useState<number | 'all'>('all')
  const [pillar, setPillar] = useState<Pillar | 'all'>('all')
  const [status, setStatus] = useState<PostStatus | 'all'>(() => { const s = params.get('status'); return s && isStatus(s) ? s : 'all' })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ?open=<id>
  useEffect(() => {
    const id = params.get('open')
    if (!id) return
    const p = posts.find((x) => x.id === id)
    if (p) setForm({ open: true, post: p })
    params.delete('open')
    setParams(params, { replace: true })
  }, [params, posts, setParams])

  const openNew = () => setForm({ open: true, post: null })
  const openEdit = (post: Post) => setForm({ open: true, post })

  // ——— DM counter ———
  const target = Math.max(1, settings.dmTargetPerDay)
  const todayCount = dmLogs.find((l) => l.date === today())?.count ?? 0
  const streak = dmStreak(dmLogs, target)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today(), i - 6)
    return { date, count: dmLogs.find((l) => l.date === date)?.count ?? 0, label: DAYS[(new Date(date + 'T00:00:00').getDay() + 6) % 7].slice(0, 1) }
  })

  // ——— Pillars ———
  const split = useMemo(() => pillarSplit(posts), [posts])
  const published = posts.filter((p) => p.status === 'Publié').length
  const drifting = split.filter((s) => s.drift)

  // ——— Filters ———
  const filtered = useMemo(
    () => posts.filter((p) => (week === 'all' || p.week === week) && (pillar === 'all' || p.pillar === pillar) && (status === 'all' || p.status === status))
      .sort((a, b) => a.week - b.week || (a.publishDate ?? '9').localeCompare(b.publishDate ?? '9') || a.createdAt.localeCompare(b.createdAt)),
    [posts, week, pillar, status],
  )
  const pag = usePagination(filtered, 16)
  const chips = [
    week !== 'all' && { key: 'week', label: `Semaine S${week}` },
    pillar !== 'all' && { key: 'pillar', label: `Pilier : ${pillar}` },
    status !== 'all' && { key: 'status', label: `Statut : ${status}` },
  ].filter((c): c is { key: string; label: string } => !!c)
  const removeChip = (k: string) => { if (k === 'week') setWeek('all'); if (k === 'pillar') setPillar('all'); if (k === 'status') setStatus('all') }
  const clearChips = () => { setWeek('all'); setPillar('all'); setStatus('all') }
  const toggleSel = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })

  const copy = (text: string) => navigator.clipboard?.writeText(text)

  return (
    <Page title="Instagram" subtitle="Le compteur du jour, les piliers et le calendrier éditorial."
      actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'table', label: 'Tableau' }, { value: 'calendar', label: 'Calendrier' }]} />
        <button className="btn-primary" onClick={openNew}><Plus size={15} /> Publication</button>
      </>}>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
        {/* A — DM counter */}
        <Card accent="#0071E3" className="flex flex-col xl:col-span-3">
          <SectionTitle>Compteur de DM du jour</SectionTitle>
          <div className="flex items-baseline gap-2">
            <span className="big">{todayCount}</span>
            <span className="text-2xl font-semibold text-muted">/ {target}</span>
          </div>
          <Progress value={(todayCount / target) * 100} className="mt-5" color={todayCount >= target ? '#30D158' : undefined} />
          <div className="flex items-center gap-2 mt-5">
            <button className="btn-primary flex-1 justify-center" onClick={() => addDm(1)}><Plus size={15} /> 1 DM envoyé</button>
            <button className="btn-ghost !px-3" title="Retirer un DM" onClick={() => addDm(-1)} disabled={todayCount <= 0}><Minus size={15} /> 1</button>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm">
            <span>🔥</span>
            <span className={cx('font-semibold', streak > 0 ? 'text-white' : 'text-muted')}>{streak} jour{streak > 1 ? 's' : ''} consécutif{streak > 1 ? 's' : ''}</span>
          </div>
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {last7.map((d) => (
              <div key={d.date} className="text-center">
                <div className={cx('h-9 rounded-xl grid place-content-center text-xs font-semibold border', d.count >= target ? 'bg-ok/15 border-ok/30 text-ok' : d.count > 0 ? 'bg-card2 border-line text-txt' : 'bg-card2/40 border-line text-muted')}>{d.count}</div>
                <div className="text-[10px] text-muted mt-1">{d.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-5 border-t border-line text-xs text-muted leading-relaxed">
            <div className="flex items-center gap-1 mb-1"><Pencil size={11} /> Rythme</div>
            <Editable value={settings.rhythm} onChange={(rhythm) => setSettings({ rhythm })} multiline className="text-txt/80" />
          </div>
        </Card>

        {/* B — Pillars */}
        <Card className="xl:col-span-5">
          <SectionTitle right={<span className="label">{published} publié{published > 1 ? 's' : ''}</span>}>Répartition des piliers</SectionTitle>
          <Donut size={160} center={String(published)} data={split.map((s) => ({ name: s.pillar, value: s.count, color: PILLAR_COLORS[s.pillar], extra: `cible ${s.target} %` }))} />
          <div className="mt-5 space-y-2">
            {published < 4 ? (
              <p className="text-xs text-muted">Pas encore assez de publications pour juger.</p>
            ) : drifting.length === 0 ? (
              <Callout tone="ok">Les piliers tiennent la cible.</Callout>
            ) : (
              drifting.map((s) => (
                <Callout key={s.pillar} tone="warn">Le pilier {s.pillar} dérive : {Math.round(s.real)} % publié vs {s.target} % cible.</Callout>
              ))
            )}
          </div>
        </Card>

        {/* C — Memo */}
        <Card className="flex flex-col md:col-span-2 xl:col-span-4">
          <SectionTitle right={<span className="text-xs text-muted flex items-center gap-1"><Pencil size={11} /> Éditable</span>}>Mémo</SectionTitle>
          <div className="space-y-5 overflow-y-auto max-h-[380px] -mr-2 pr-2 text-sm leading-relaxed">
            <MemoBlock label="Bio à appliquer" value={settings.instaBio} onChange={(instaBio) => setSettings({ instaBio })} onCopy={() => copy(settings.instaBio)} />
            <MemoBlock label="Structure du DM en 4 temps" value={settings.dmStructure} onChange={(dmStructure) => setSettings({ dmStructure })} />
            <MemoBlock label="Message type" value={settings.dmTemplate} onChange={(dmTemplate) => setSettings({ dmTemplate })} onCopy={() => copy(settings.dmTemplate)} />
          </div>
        </Card>
      </div>

      {/* ——— Editorial calendar ——— */}
      <div className="flex items-end justify-between mt-10 mb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Calendrier éditorial</h2>
          <p className="text-xs text-muted mt-1">{posts.length} publication{posts.length > 1 ? 's' : ''} planifiée{posts.length > 1 ? 's' : ''} sur le mois.</p>
        </div>
      </div>

      {posts.length === 0 ? (
        <Card><Empty text="Aucune publication planifiée." action="Publication" onAction={openNew} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {POST_STATUSES.map((s) => {
              const n = posts.filter((p) => p.status === s).length
              const active = status === s
              return (
                <Card key={s} accent={statusColor(s)} onClick={() => setStatus(active ? 'all' : s)} className={cx('!p-5', active && 'border-white/30')}>
                  <div className="label">{s}</div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-3xl font-extrabold text-white tracking-tight">{n}</span>
                    <span className="text-xs text-muted">publication{n > 1 ? 's' : ''}</span>
                  </div>
                </Card>
              )
            })}
          </div>

          {view === 'table' ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mt-6 mb-4">
                <select className="input !w-auto !py-2" value={week} onChange={(e) => setWeek(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                  <option value="all">Toutes les semaines</option>
                  {WEEKS.map((w) => <option key={w} value={w}>Semaine S{w}</option>)}
                </select>
                <select className="input !w-auto !py-2" value={pillar} onChange={(e) => setPillar(e.target.value as Pillar | 'all')}>
                  <option value="all">Tous les piliers</option>
                  {PILLARS.map((p) => <option key={p}>{p}</option>)}
                </select>
                <select className="input !w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value as PostStatus | 'all')}>
                  <option value="all">Tous les statuts</option>
                  {POST_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <FilterChips chips={chips} onRemove={removeChip} onClear={clearChips} />
              </div>

              {filtered.length === 0 ? (
                <Card><Empty text="Aucune publication ne correspond à ces filtres." action="Effacer les filtres" onAction={clearChips} /></Card>
              ) : (
                <Table head={<>
                  <Th className="w-10" />
                  <Th>Sem.</Th><Th>Format</Th><Th>Sujet</Th><Th>Pilier</Th><Th>Statut</Th><Th>Publication</Th><Th>Lien</Th>
                  <Th className="text-right">Portée</Th><Th className="text-right">Interactions</Th><Th className="text-right">Messages</Th><Th className="w-12" />
                </>}>
                  {pag.slice.map((p) => {
                    const next = nextStatus(p.status)
                    return (
                      <tr key={p.id} className="tr cursor-pointer" onClick={() => openEdit(p)}>
                        <Td><Checkbox checked={selected.has(p.id)} onChange={(v) => toggleSel(p.id, v)} /></Td>
                        <Td><span className="pill bg-card2 border border-line text-txt">S{p.week}</span></Td>
                        <Td><span className="chip !py-1">{p.format}</span></Td>
                        <Td className="text-white min-w-[260px] max-w-[420px] whitespace-normal leading-snug">{p.subject}</Td>
                        <Td><StatusPill status={p.pillar} color={PILLAR_COLORS[p.pillar]} /></Td>
                        <Td><StatusPill status={p.status} /></Td>
                        <Td className={cx('whitespace-nowrap', !p.publishDate && 'text-muted')}>{fmtDate(p.publishDate)}</Td>
                        <Td>
                          {p.link ? (
                            <a href={p.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="btn-icon !w-8 !h-8 text-brandLight" title={p.link}><ExternalLink size={14} /></a>
                          ) : <span className="text-muted">—</span>}
                        </Td>
                        <Td className="text-right text-muted tabular-nums">{p.reach ? fmtNum(p.reach) : '—'}</Td>
                        <Td className="text-right text-muted tabular-nums">{p.interactions ? fmtNum(p.interactions) : '—'}</Td>
                        <Td className="text-right text-muted tabular-nums">{p.messages ? fmtNum(p.messages) : '—'}</Td>
                        <Td className="text-right">
                          <RowMenu items={[
                            { label: 'Modifier', onClick: () => openEdit(p) },
                            ...(next ? [{ label: `Passer à ${next}`, onClick: () => patch('posts', p.id, { status: next, publishDate: next === 'Publié' && !p.publishDate ? today() : p.publishDate }) }] : []),
                            { label: 'Supprimer', danger: true, onClick: () => remove('posts', p.id) },
                          ]} />
                        </Td>
                      </tr>
                    )
                  })}
                </Table>
              )}
              <div className="mt-3"><Pagination page={pag.page} pages={pag.pages} onChange={pag.setPage} total={pag.total} /></div>
            </>
          ) : (
            <MonthCalendar posts={status === 'all' ? posts : posts.filter((p) => p.status === status)} onOpen={openEdit} />
          )}
        </>
      )}

      <PostForm open={form.open} onClose={() => setForm({ open: false, post: null })} initial={form.post} />
    </Page>
  )
}

function MemoBlock({ label, value, onChange, onCopy }: { label: string; value: string; onChange: (v: string) => void; onCopy?: () => void }) {
  const [done, setDone] = useState(false)
  const handleCopy = () => { onCopy?.(); setDone(true); setTimeout(() => setDone(false), 1500) }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label">{label}</span>
        {onCopy && (
          <button className="btn-ghost !py-1 !px-2.5 !text-xs" onClick={handleCopy}>
            {done ? <Check size={12} className="text-ok" /> : <Copy size={12} />} {done ? 'Copié' : 'Copier'}
          </button>
        )}
      </div>
      <Editable value={value} onChange={onChange} multiline className="text-txt/90 block" />
    </div>
  )
}

function MonthCalendar({ posts, onOpen }: { posts: Post[]; onOpen: (p: Post) => void }) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const t = today()
  const first = month + '-01'
  const d0 = new Date(first + 'T00:00:00')
  const offset = (d0.getDay() + 6) % 7
  const daysInMonth = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate()
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7
  const shift = (n: number) => setMonth(toISO(new Date(d0.getFullYear(), d0.getMonth() + n, 1)).slice(0, 7))
  const byDate = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of posts) if (p.publishDate) m.set(p.publishDate, [...(m.get(p.publishDate) ?? []), p])
    return m
  }, [posts])
  const undated = posts.filter((p) => !p.publishDate).sort((a, b) => a.week - b.week)
  const title = d0.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mt-6">
      <Card className="xl:col-span-3 !p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white capitalize">{title}</h3>
          <div className="flex items-center gap-1">
            <button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => setMonth(t.slice(0, 7))}>Aujourd’hui</button>
            <button className="btn-icon" onClick={() => shift(-1)} title="Mois précédent"><ChevronLeft size={16} /></button>
            <button className="btn-icon" onClick={() => shift(1)} title="Mois suivant"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => <div key={d} className="label text-center py-1">{d}</div>)}
          {Array.from({ length: cells }, (_, i) => {
            const day = i - offset + 1
            const inMonth = day >= 1 && day <= daysInMonth
            const iso = inMonth ? addDays(first, day - 1) : null
            const list = iso ? byDate.get(iso) ?? [] : []
            const isToday = iso === t
            return (
              <div key={i} className={cx('min-h-[92px] rounded-2xl border p-1.5', inMonth ? 'bg-card2/60 border-line' : 'border-transparent')}>
                {inMonth && (
                  <>
                    <div className={cx('w-6 h-6 grid place-content-center rounded-pill text-xs font-semibold mb-1', isToday ? 'bg-brand text-white' : 'text-muted')}>{day}</div>
                    <div className="space-y-1">
                      {list.map((p) => (
                        <button key={p.id} onClick={() => onOpen(p)} title={p.subject}
                          className="w-full text-left text-[11px] font-medium leading-tight rounded-lg px-1.5 py-1 truncate hover:brightness-125"
                          style={{ background: PILLAR_COLORS[p.pillar] + '22', color: PILLAR_COLORS[p.pillar], borderLeft: `2px solid ${PILLAR_COLORS[p.pillar]}` }}>
                          {p.subject}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-line">
          {PILLARS.map((p) => <span key={p} className="flex items-center gap-1.5 text-xs text-muted"><span className="w-2 h-2 rounded-pill" style={{ background: PILLAR_COLORS[p] }} />{p}</span>)}
        </div>
      </Card>

      <Card className="!p-5">
        <SectionTitle>Sans date <span className="text-muted font-normal">({undated.length})</span></SectionTitle>
        {undated.length === 0 ? (
          <p className="text-xs text-muted">Toutes les publications ont une date.</p>
        ) : (
          <ul className="space-y-2 max-h-[560px] overflow-y-auto -mr-2 pr-2">
            {undated.map((p) => (
              <li key={p.id}>
                <button onClick={() => onOpen(p)} className="w-full text-left rounded-2xl border border-line bg-card2/60 hover:border-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="pill bg-card2 border border-line text-txt">S{p.week}</span>
                    <span className="text-[11px] text-muted">{p.format}</span>
                    <span className="ml-auto"><StatusPill status={p.status} /></span>
                  </div>
                  <div className="text-sm text-white leading-snug line-clamp-2">{p.subject}</div>
                  <div className="text-[11px] mt-1.5 font-semibold" style={{ color: PILLAR_COLORS[p.pillar] }}>{p.pillar}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
