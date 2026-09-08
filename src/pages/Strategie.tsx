import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../store'
import { Question, QUESTION_STATUSES, QuestionStatus } from '../store/types'
import { Accordion, Card, Checkbox, Editable, Page, Progress, RowMenu, SectionTitle, Segmented, cx, statusColor } from '../components/ui'
import { today } from '../lib/dates'
import { uid } from '../lib/format'

type Filter = 'all' | QuestionStatus

export default function Strategie() {
  const { decisions, questions, patch, add, remove } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const done = decisions.filter((d) => d.done).length

  const themes = useMemo(() => {
    const order: string[] = []
    for (const q of questions) if (!order.includes(q.theme)) order.push(q.theme)
    return order.map((theme) => ({ theme, all: questions.filter((q) => q.theme === theme) }))
  }, [questions])
  const settled = questions.filter((q) => q.status === 'Tranchée').length

  const newQuestion = (theme: string): Question => ({ id: uid(), theme, text: '', answer: '', status: 'Non traitée', decidedAt: null })
  const setStatus = (q: Question, status: QuestionStatus) =>
    patch('questions', q.id, { status, decidedAt: status === 'Tranchée' && !q.decidedAt ? today() : q.decidedAt })

  return (
    <Page title="Stratégie" subtitle="Ce qu’on a décidé, et ce qu’il reste à trancher.">
      <SectionTitle>A. Les {decisions.length} décisions à acter</SectionTitle>
      <Card>
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-sm text-muted"><span className="text-white font-semibold text-base">{done}</span> / {decisions.length} actées</span>
          <span className="text-xs text-muted">{decisions.length ? Math.round((done / decisions.length) * 100) : 0} %</span>
        </div>
        <Progress value={decisions.length ? (done / decisions.length) * 100 : 0} className="mb-3" />
        <ul className="divide-y divide-line/70">
          {decisions.map((d, i) => (
            <li key={d.id} className={cx('flex flex-wrap items-center gap-3 py-3.5', d.done && 'opacity-60')}>
              <Checkbox checked={d.done} onChange={(done) => patch('decisions', d.id, { done })} />
              <span className="text-xs text-muted w-5 tabular-nums">{i + 1}.</span>
              <span className={cx('flex-1 min-w-[200px] text-[15px] text-txt', d.done && 'line-through')}>
                <Editable value={d.text} onChange={(text) => patch('decisions', d.id, { text })} placeholder="Nouvelle décision…" />
              </span>
              {d.field && (
                <span className="flex items-center gap-2">
                  <input className="input !w-[180px] !py-1.5" placeholder={d.fieldLabel} value={d.value ?? ''} onChange={(e) => patch('decisions', d.id, { value: e.target.value })} />
                  {d.fieldLabel === '%' && <span className="text-sm text-muted">%</span>}
                  {d.field2 && (
                    <input className="input !w-[140px] !py-1.5" type={d.fieldLabel2 === 'Heure' ? 'time' : 'text'} placeholder={d.fieldLabel2} value={d.value2 ?? ''} onChange={(e) => patch('decisions', d.id, { value2: e.target.value })} />
                  )}
                </span>
              )}
              <RowMenu items={[{ label: 'Supprimer', danger: true, onClick: () => remove('decisions', d.id) }]} />
            </li>
          ))}
        </ul>
        <button className="btn-ghost !py-1.5 mt-3" onClick={() => add('decisions', { id: uid(), text: '', done: false })}><Plus size={14} /> Décision</button>
      </Card>

      <div className="mt-10">
        <SectionTitle right={
          <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Toutes' }, { value: 'Non traitée', label: 'Non traitées' }, { value: 'En discussion', label: 'En discussion' }, { value: 'Tranchée', label: 'Tranchées' }]} />
        }>B. Les questions structurantes</SectionTitle>
        <p className="text-sm text-muted -mt-2 mb-5">{questions.length} questions · {settled} tranchée{settled > 1 ? 's' : ''}</p>

        <div className="flex flex-col gap-4">
          {themes.map(({ theme, all }, ti) => {
            const shown = filter === 'all' ? all : all.filter((q) => q.status === filter)
            const n = all.filter((q) => q.status === 'Tranchée').length
            return (
              <Accordion key={theme} title={theme} defaultOpen={ti === 0} right={<span className={cx('pill', n === all.length && all.length ? 'bg-ok/15 text-ok' : 'bg-card2 border border-line text-muted')}>{n}/{all.length} tranchée{n > 1 ? 's' : ''}</span>}>
                {shown.length === 0 && <p className="text-sm text-muted py-2">Aucune question dans ce filtre.</p>}
                <div className="divide-y divide-line/70">
                  {shown.map((q) => {
                    const c = statusColor(q.status)
                    return (
                      <div key={q.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          <p className="flex-1 text-sm text-white leading-relaxed"><Editable value={q.text} onChange={(text) => patch('questions', q.id, { text })} placeholder="Nouvelle question…" /></p>
                          <RowMenu items={[{ label: 'Supprimer', danger: true, onClick: () => remove('questions', q.id) }]} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <span className="relative inline-flex">
                            <select value={q.status} onChange={(e) => setStatus(q, e.target.value as QuestionStatus)} className="pill appearance-none cursor-pointer outline-none pl-5 pr-3" style={{ background: c + '22', color: c }}>
                              {QUESTION_STATUSES.map((s) => <option key={s} value={s} className="bg-card text-txt">{s}</option>)}
                            </select>
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-pill pointer-events-none" style={{ background: c }} />
                          </span>
                          <label className="inline-flex items-center gap-2 text-xs text-muted">
                            Date de décision
                            <input type="date" className="input !w-auto !py-1 !px-2.5 !text-xs" value={q.decidedAt ?? ''} onChange={(e) => patch('questions', q.id, { decidedAt: e.target.value || null })} />
                          </label>
                        </div>
                        <div className="mt-2.5 text-sm text-txt/85 leading-relaxed">
                          <Editable multiline value={q.answer} onChange={(answer) => patch('questions', q.id, { answer })} placeholder="Réponse libre…" />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button className="btn-ghost !py-1.5 mt-5" onClick={() => add('questions', newQuestion(theme))}><Plus size={14} /> Question</button>
              </Accordion>
            )
          })}
        </div>
        <button className="btn-ghost mt-4" onClick={() => add('questions', newQuestion('Nouveau thème'))}><Plus size={15} /> Thème</button>
      </div>
    </Page>
  )
}
