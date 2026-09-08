import { useMemo, useState } from 'react'
import { AlertCircle, Calendar, Plus } from 'lucide-react'
import { useStore } from '../store'
import { Task, WeekMeta } from '../store/types'
import { TaskForm } from '../components/forms'
import { UserFilter } from '../components/Layout'
import { AssigneeBadge, Card, Checkbox, Editable, Empty, Page, Progress, RowMenu, SectionTitle, Table, Td, Th, cx } from '../components/ui'
import { fmtDateLong, today } from '../lib/dates'
import { fmtPct, uid } from '../lib/format'

type Week = WeekMeta['week']
const WEEKS: Week[] = [1, 2, 3, 4]
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const isLate = (t: Task) => !t.done && isIso(t.deadline) && t.deadline < today()

export default function Planning() {
  const { tasks, weekMeta, weekSlots, ui, add, patch, remove } = useStore()
  const [form, setForm] = useState<{ open: boolean; initial?: Task | null; defaults?: Partial<Task> }>({ open: false })

  const visible = useMemo(() => {
    const f = ui.userFilter
    return f === 'all' ? tasks : tasks.filter((t) => t.assignee === f || t.assignee === 'both' || t.assignee === 'insta' || t.assignee === 'deliverer')
  }, [tasks, ui.userFilter])
  const done = visible.filter((t) => t.done).length
  const late = visible.filter(isLate).length
  const pct = visible.length ? (done / visible.length) * 100 : 0

  const metaOf = (week: Week): WeekMeta => weekMeta.find((m) => m.week === week) ?? { week, title: '', goal: '' }
  const patchMeta = (week: Week, p: Partial<WeekMeta>) => (weekMeta.some((m) => m.week === week) ? patch('weekMeta', week, p) : add('weekMeta', { ...metaOf(week), ...p }))
  const openNew = (week?: Week) => setForm({ open: true, initial: null, defaults: week ? { week } : undefined })
  const openEdit = (t: Task) => setForm({ open: true, initial: t })
  const addSlot = () => add('weekSlots', { id: uid(), slot: 'Nouveau créneau', activity: 'Activité' })

  return (
    <Page title="Planning du mois" subtitle="Quatre semaines, un objectif par semaine." actions={<><UserFilter /><button className="btn-primary" onClick={() => openNew()}><Plus size={15} /> Tâche</button></>}>
      <Card className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="shrink-0 md:w-52">
          <div className="label">Avancement du mois</div>
          <div className="text-3xl font-extrabold text-white tracking-tight mt-2">{fmtPct(pct, 0)}</div>
        </div>
        <div className="flex-1">
          <Progress value={pct} className="!h-2" />
          <div className="flex items-center justify-between mt-2.5 text-xs text-muted">
            <span><span className="text-txt font-medium">{done} / {visible.length}</span> tâches terminées</span>
            <span>{visible.length - done} restante{visible.length - done > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className={cx('shrink-0 pill', late ? 'bg-danger/15 text-danger' : 'bg-ok/15 text-ok')}>
          {late ? <><AlertCircle size={12} /> {late} tâche{late > 1 ? 's' : ''} en retard</> : 'Aucun retard'}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        {WEEKS.map((w) => {
          const meta = metaOf(w)
          const list = visible.filter((t) => t.week === w)
          const wDone = list.filter((t) => t.done).length
          const wPct = list.length ? (wDone / list.length) * 100 : 0
          return (
            <Card key={w} className="!p-0 flex flex-col">
              <div className="px-5 pt-5 pb-4">
                <div className="text-base font-semibold text-white leading-snug">
                  Semaine {w} — <Editable value={meta.title} onChange={(title) => patchMeta(w, { title })} placeholder="Titre" />
                </div>
                <div className="text-sm text-muted italic mt-1.5">
                  Objectif : <Editable value={meta.goal} onChange={(goal) => patchMeta(w, { goal })} placeholder="À définir" />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Progress value={wPct} className="flex-1" color={wPct >= 100 ? '#30D158' : undefined} />
                  <span className="text-xs text-muted whitespace-nowrap">{wDone} / {list.length} tâche{list.length > 1 ? 's' : ''} · {fmtPct(wPct, 0)}</span>
                </div>
              </div>
              <div className="border-t border-line flex-1">
                {list.length === 0 ? (
                  <p className="text-sm text-muted text-center px-5 py-8">Aucune tâche cette semaine.</p>
                ) : list.map((t) => <TaskRow key={t.id} t={t} onEdit={() => openEdit(t)} />)}
              </div>
              <div className="border-t border-line p-2">
                <button className="btn-ghost w-full justify-center !bg-transparent !border-0 text-muted hover:text-txt" onClick={() => openNew(w)}><Plus size={14} /> Tâche</button>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-10">
        <SectionTitle right={<button className="btn-ghost !py-1.5" onClick={addSlot}><Plus size={14} /> Créneau</button>}>Semaine type</SectionTitle>
        {weekSlots.length === 0 ? (
          <Card><Empty text="Aucun créneau. Une semaine type protège le temps de production." action="Créneau" onAction={addSlot} /></Card>
        ) : (
          <Table head={<><Th>Créneau</Th><Th>Activité</Th><Th className="w-12" /></>}>
            {weekSlots.map((s) => (
              <tr key={s.id} className="tr">
                <Td className="text-white font-medium whitespace-nowrap"><Editable value={s.slot} onChange={(slot) => patch('weekSlots', s.id, { slot })} /></Td>
                <Td><Editable value={s.activity} onChange={(activity) => patch('weekSlots', s.id, { activity })} /></Td>
                <Td className="text-right"><RowMenu items={[{ label: 'Supprimer', onClick: () => remove('weekSlots', s.id), danger: true }]} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <TaskForm open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} initial={form.initial} defaults={form.defaults} />
    </Page>
  )
}

function TaskRow({ t, onEdit }: { t: Task; onEdit: () => void }) {
  const { patch, remove } = useStore()
  const late = isLate(t)
  return (
    <div onClick={onEdit} className="flex items-start gap-3 px-4 py-3.5 border-b border-line/70 last:border-0 hover:bg-white/[0.02] cursor-pointer">
      <Checkbox className="mt-0.5" checked={t.done} onChange={(done) => patch('tasks', t.id, { done })} />
      <div className="flex-1 min-w-0">
        <div className={cx('text-sm leading-snug', t.done ? 'line-through text-muted' : 'text-txt')}>{t.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <AssigneeBadge assignee={t.assignee} size={20} />
          <span className={cx('pill border', late ? 'bg-danger/15 text-danger border-danger/30' : 'bg-card2 text-muted border-line')}>
            <Calendar size={11} /> {isIso(t.deadline) ? fmtDateLong(t.deadline) : t.deadline}
          </span>
          {t.volume && t.volume !== '—' && <span className="pill bg-brand/10 text-brandLight">{t.volume}</span>}
        </div>
      </div>
      <RowMenu items={[
        { label: 'Modifier', onClick: onEdit },
        ...(t.week < 4 ? [{ label: 'Semaine suivante', onClick: () => patch('tasks', t.id, { week: (t.week + 1) as Task['week'] }) }] : []),
        { label: 'Supprimer', onClick: () => remove('tasks', t.id), danger: true },
      ]} />
    </div>
  )
}
