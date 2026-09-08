import { ReactNode, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Check, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { KpiWeek, Meeting, MeetingAction, UserId } from '../store/types'
import { Avatar, Card, Checkbox, ConfirmDelete, Editable, Empty, Page, cx } from '../components/ui'
import { addDays, fmtDate, mondayOf, today, weekLabel } from '../lib/dates'
import { fmtEur, uid } from '../lib/format'

const USERS: UserId[] = ['jeremy', 'matheis']

const numbersText = (k: KpiWeek | undefined) =>
  k ? `${k.contacts} contacts, ${k.conversations} conversations, ${k.meetings} RDV, ${k.quotes} devis, ${k.sales} vente${k.sales > 1 ? 's' : ''}. CA encaissé ${fmtEur(k.revenue)}.` : 'Aucune semaine KPI saisie.'

const linkedKpi = (kpiWeeks: KpiWeek[], weekStart: string) => {
  const prev = addDays(weekStart, -7)
  return kpiWeeks.find((k) => k.weekStart === prev) ?? [...kpiWeeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0]
}

export default function PointHebdo() {
  const { meetings, kpiWeeks, add, remove } = useStore()
  const [params, setParams] = useSearchParams()
  const sorted = [...meetings].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  const [selId, setSelId] = useState<string | null>(params.get('open') ?? sorted[0]?.id ?? null)
  useEffect(() => { const o = params.get('open'); if (o) { setSelId(o); setParams({}, { replace: true }) } }, [params, setParams])
  const meeting = meetings.find((m) => m.id === selId) ?? sorted[0]

  const create = () => {
    const weekStart = mondayOf(today())
    const existing = meetings.find((m) => m.weekStart === weekStart)
    if (existing) { setSelId(existing.id); return }
    const k = linkedKpi(kpiWeeks, weekStart)
    const m: Meeting = {
      id: uid(), weekStart, kpiWeekId: k?.id ?? null, numbers: numbersText(k), blockers: { jeremy: '', matheis: '' },
      priorities: { jeremy: ['', '', ''], matheis: ['', '', ''] }, unsaid: '', decisions: [], actions: [], postponed: [], createdAt: today(),
    }
    add('meetings', m)
    setSelId(m.id)
  }

  return (
    <Page title="Point hebdo" subtitle="30 minutes, chaque lundi soir. 5 · 10 · 10 · 5." actions={<button className="btn-primary" onClick={create}><Plus size={15} /> Nouveau compte-rendu</button>}>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 flex flex-col gap-3">
          <span className="label px-1">Historique</span>
          {sorted.length === 0 && <p className="text-sm text-muted px-1">Aucun compte-rendu pour l’instant.</p>}
          {sorted.map((m) => (
            <button key={m.id} onClick={() => setSelId(m.id)} className={cx('card fade-up p-5 text-left hover:border-muted/50', meeting?.id === m.id && 'border-brand hover:border-brand')}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-white font-semibold">{weekLabel(m.weekStart)}</span>
                {m.weekStart === mondayOf(today()) && <span className="pill bg-brand/15 text-brandLight">Cette semaine</span>}
              </div>
              <div className="text-xs text-muted mt-1.5">{m.decisions.length} décision{m.decisions.length > 1 ? 's' : ''} · {m.actions.length} action{m.actions.length > 1 ? 's' : ''}</div>
            </button>
          ))}
        </div>

        <div className="xl:col-span-2">
          {!meeting ? (
            <Card><Empty text="Aucun compte-rendu. Le premier point hebdo se prépare en 5 minutes." action="Nouveau compte-rendu" onAction={create} /></Card>
          ) : (
            <Editor key={meeting.id} m={meeting} onDelete={() => { remove('meetings', meeting.id); setSelId(null) }} />
          )}
        </div>
      </div>
    </Page>
  )
}

function Editor({ m, onDelete }: { m: Meeting; onDelete: () => void }) {
  const { kpiWeeks, users, tasks, add, patch } = useStore()
  const set = (p: Partial<Meeting>) => patch('meetings', m.id, p)
  const who = (id: UserId) => users.find((u) => u.id === id)
  const reimport = () => {
    const k = kpiWeeks.find((x) => x.id === m.kpiWeekId) ?? linkedKpi(kpiWeeks, m.weekStart)
    set({ kpiWeekId: k?.id ?? null, numbers: numbersText(k) })
  }
  const setPriority = (u: UserId, i: number, v: string) => {
    const list = [...m.priorities[u]]
    while (list.length < 3) list.push('')
    list[i] = v
    set({ priorities: { ...m.priorities, [u]: list } })
  }
  const patchAction = (id: string, p: Partial<MeetingAction>) => set({ actions: m.actions.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const createTask = (a: MeetingAction) => {
    const day = Number(today().slice(8, 10))
    const id = uid()
    add('tasks', { id, title: a.title || 'Action du point hebdo', week: Math.min(4, Math.ceil(day / 7)) as 1 | 2 | 3 | 4, assignee: a.assignee, deadline: a.due, volume: '', done: false, createdAt: today(), source: 'meeting' })
    patchAction(a.id, { taskId: id })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <label className="flex items-center gap-3">
          <span className="label">Semaine du</span>
          <input type="date" className="input !w-auto !py-1.5" value={m.weekStart} onChange={(e) => e.target.value && set({ weekStart: mondayOf(e.target.value) })} />
        </label>
        <ConfirmDelete onConfirm={onDelete} />
      </div>

      <Block minutes={5} title="Les chiffres de la semaine passée" right={<button className="btn-ghost !py-1.5 !text-xs" onClick={reimport}><RefreshCw size={13} /> Réimporter depuis les KPI</button>}>
        <p className="text-[15px] text-white leading-relaxed"><Editable multiline value={m.numbers} onChange={(numbers) => set({ numbers })} /></p>
        <Link to="/kpi" className="inline-flex items-center gap-1 text-xs text-brandLight hover:underline mt-3">Voir les KPI hebdomadaires <ArrowUpRight size={12} /></Link>
      </Block>

      <Block minutes={10} title="Ce qui a bloqué" hint="Un blocage par personne, maximum.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {USERS.map((u) => (
            <div key={u} className="flex items-center gap-3">
              <Avatar user={who(u)} size={32} />
              <input className="input" placeholder={`Blocage de ${who(u)?.name ?? u}`} value={m.blockers[u]} onChange={(e) => set({ blockers: { ...m.blockers, [u]: e.target.value } })} />
            </div>
          ))}
        </div>
      </Block>

      <Block minutes={10} title="Les 3 priorités de la semaine à venir" hint="Par personne.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {USERS.map((u) => (
            <div key={u}>
              <div className="flex items-center gap-2 mb-3"><Avatar user={who(u)} size={26} /><span className="text-sm font-semibold text-white">{who(u)?.name}</span></div>
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-pill bg-brand/15 text-brandLight text-xs font-bold grid place-content-center shrink-0">{i + 1}</span>
                    <input className="input !py-2" placeholder={`Priorité ${i + 1}`} value={m.priorities[u][i] ?? ''} onChange={(e) => setPriority(u, i, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block minutes={5} title="Ce qu’on n’a pas dit">
        <textarea className="input" rows={3} placeholder="Ce qui gêne, ce qu’on repousse, ce qu’on n’ose pas dire…" value={m.unsaid} onChange={(e) => set({ unsaid: e.target.value })} />
      </Block>

      <StringList title="Décisions prises" items={m.decisions} placeholder="Décision…" addLabel="Décision" onChange={(decisions) => set({ decisions })} />

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Actions</h3>
          <span className="pill bg-card2 border border-line text-muted">{m.actions.length}</span>
        </div>
        {m.actions.length === 0 && <p className="text-sm text-muted">Aucune action. Une action a un nom, un responsable et une date.</p>}
        <div className="flex flex-col gap-2">
          {m.actions.map((a) => {
            const task = a.taskId ? tasks.find((t) => t.id === a.taskId) : undefined
            return (
              <div key={a.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 card-2 p-3">
                <input className="input !py-2" placeholder="Action…" value={a.title} onChange={(e) => patchAction(a.id, { title: e.target.value })} />
                <select className="input !py-2 !w-auto" value={a.assignee} onChange={(e) => patchAction(a.id, { assignee: e.target.value as UserId })}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input type="date" className="input !py-2 !w-auto" value={a.due} onChange={(e) => patchAction(a.id, { due: e.target.value })} />
                {task ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="pill bg-ok/15 text-ok"><Check size={12} /> Tâche créée</span>
                    <Checkbox checked={task.done} onChange={(done) => patch('tasks', task.id, { done })} />
                  </span>
                ) : a.taskId ? (
                  <span className="pill bg-card2 border border-line text-muted">Tâche supprimée</span>
                ) : (
                  <button className="btn-ghost !py-1.5 !text-xs" onClick={() => createTask(a)}>Créer la tâche</button>
                )}
                <button className="btn-icon text-muted hover:text-danger justify-self-end" title="Supprimer" onClick={() => set({ actions: m.actions.filter((x) => x.id !== a.id) })}><Trash2 size={15} /></button>
              </div>
            )
          })}
        </div>
        <button className="btn-ghost !py-1.5 mt-4" onClick={() => set({ actions: [...m.actions, { id: uid(), title: '', assignee: 'jeremy', due: addDays(today(), 7) }] })}><Plus size={14} /> Action</button>
      </Card>

      <StringList title="Sujets reportés" items={m.postponed} placeholder="Sujet…" addLabel="Sujet" onChange={(postponed) => set({ postponed })} />

      <p className="text-xs text-muted px-1">Créé le {fmtDate(m.createdAt)} · Chaque modification est enregistrée immédiatement.</p>
    </div>
  )
}

function Block({ minutes, title, hint, right, children }: { minutes: number; title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="pill bg-brand/15 text-brandLight shrink-0">{minutes} min</span>
          <div>
            <h3 className="text-base font-semibold text-white leading-tight">{title}</h3>
            {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}

function StringList({ title, items, placeholder, addLabel, onChange }: { title: string; items: string[]; placeholder: string; addLabel: string; onChange: (items: string[]) => void }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <span className="pill bg-card2 border border-line text-muted">{items.length}</span>
      </div>
      {items.length === 0 && <p className="text-sm text-muted">Rien pour l’instant.</p>}
      <ul className="divide-y divide-line/70">
        {items.map((it, i) => (
          <li key={i} className="group flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="mt-2 w-1.5 h-1.5 rounded-pill bg-brand shrink-0" />
            <p className="flex-1 text-sm text-txt leading-relaxed"><Editable value={it} placeholder={placeholder} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} /></p>
            <button className="btn-icon !w-8 !h-8 opacity-0 group-hover:opacity-100 text-muted hover:text-danger" title="Supprimer" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <button className="btn-ghost !py-1.5 mt-4" onClick={() => onChange([...items, ''])}><Plus size={14} /> {addLabel}</button>
    </Card>
  )
}
