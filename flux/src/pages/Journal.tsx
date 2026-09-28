import { useMemo, useState } from 'react'
import { Archive, BookOpen, Check, FilePlus2, Landmark, Mail, Pencil, RotateCcw, Settings } from 'lucide-react'
import { useFlux, useIsAdmin } from '../store'
import { ENTITY_LABEL, EntityName, JournalAction, USERS, UserId } from '../types'
import { fdatetime } from '../lib/dates'
import { cx, normalize } from '../lib/format'
import { Avatar, Card, Empty, Page, Segmented, Tag } from '../components/ui'
import { FilterBar, FilterSelect } from '../components/ListTools'
import { labelOf } from '../store'

const ICON: Record<JournalAction, typeof Pencil> = {
  création: FilePlus2,
  modification: Pencil,
  archivage: Archive,
  restauration: RotateCcw,
  réglages: Settings,
  relance: Mail,
  déclaration: Landmark,
}
const TONE: Partial<Record<JournalAction, string>> = { archivage: 'bg-danger/15 text-danger', création: 'bg-accent/15 text-accent', restauration: 'bg-accent/15 text-accent' }

export default function Journal() {
  const s = useFlux()
  const [vue, setVue] = useState<'journal' | 'archives'>('journal')
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')

  const list = useMemo(() => {
    const n = normalize(q)
    return s.journal.filter(
      (j) =>
        (!who || j.by === who) &&
        (!action || j.action === action) &&
        (!entity || j.entity === entity) &&
        (!n || normalize(`${j.label} ${j.details ?? ''} ${j.motif ?? ''}`).includes(n)),
    )
  }, [s.journal, q, who, action, entity])

  return (
    <Page title="Journal d’historique" subtitle="Chaque saisie, modification et archivage, avec son auteur, sa date et son heure. Rien ne s’efface.">
      <div className="mb-4">
        <Segmented value={vue} onChange={setVue} options={[{ value: 'journal', label: 'Journal' }, { value: 'archives', label: 'Archives' }]} />
      </div>
      {vue === 'archives' ? (
        <Archives />
      ) : (
        <>
          <FilterBar q={q} onQ={setQ} placeholder="Rechercher dans le journal…" active={[who, action, entity].filter(Boolean).length} onReset={() => (setWho(''), setAction(''), setEntity(''))}>
            <FilterSelect label="Auteur" value={who} onChange={setWho} options={(Object.keys(USERS) as UserId[]).map((u) => ({ value: u, label: USERS[u].prenom }))} />
            <FilterSelect label="Action" value={action} onChange={setAction} options={(Object.keys(ICON) as JournalAction[]).map((a) => ({ value: a, label: a }))} />
            <FilterSelect label="Type" value={entity} onChange={setEntity} options={Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }))} />
          </FilterBar>
          {list.length === 0 ? (
            <Card>
              <Empty icon={<BookOpen size={22} />} title="Le journal est vide" text="Chaque saisie y sera inscrite automatiquement." />
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              {list.slice(0, 500).map((j) => {
                const Icon = ICON[j.action] ?? Pencil
                return (
                  <div key={j.id} className="row flex items-start gap-3 px-5 py-3.5">
                    <span className={cx('w-8 h-8 rounded-xl grid place-content-center shrink-0', TONE[j.action] ?? 'bg-card2 text-muted')}>
                      <Icon size={15} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{USERS[j.by]?.prenom ?? j.by}</span> · <span className="text-muted">{j.action}</span> · {ENTITY_LABEL[j.entity]}
                      </p>
                      <p className="text-sm truncate">{j.label}</p>
                      {j.details && <p className="text-xs text-muted mt-0.5">{j.details}</p>}
                      {j.motif && <p className="text-xs mt-0.5"><span className="text-muted">Motif :</span> {j.motif}</p>}
                    </div>
                    <span className="text-[11px] text-muted whitespace-nowrap tnum">{fdatetime(j.at)}</span>
                  </div>
                )
              })}
            </Card>
          )}
          {list.length > 500 && <p className="text-xs text-muted text-center mt-3">500 dernières entrées affichées. L’export CSV du journal contient tout.</p>}
        </>
      )}
    </Page>
  )
}

function Archives() {
  const s = useFlux()
  const restore = useFlux((x) => x.restore)
  const isAdmin = useIsAdmin()
  const colls: EntityName[] = ['recettes', 'depenses', 'clients', 'projets', 'abonnements', 'categories']
  const items = colls.flatMap((c) =>
    (s[c] as { id: string; archived?: { at: string; by: UserId; motif: string } }[]).filter((x) => x.archived).map((x) => ({ c, x })),
  )
  items.sort((a, b) => b.x.archived!.at.localeCompare(a.x.archived!.at))
  if (!items.length)
    return (
      <Card>
        <Empty icon={<Archive size={22} />} title="Aucun élément archivé" text="Un élément archivé sort des listes et des calculs, mais reste ici avec son motif." />
      </Card>
    )
  return (
    <Card className="!p-0 overflow-hidden">
      {items.map(({ c, x }) => (
        <div key={c + x.id} className="row flex items-center gap-3 px-5 py-3.5">
          <Avatar name={USERS[x.archived!.by]?.nom ?? '?'} size={30} tone="muted" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              <Tag>{ENTITY_LABEL[c]}</Tag> {labelOf(c, x as unknown as Record<string, unknown>)}
            </p>
            <p className="text-xs text-muted mt-0.5">
              Archivé par {USERS[x.archived!.by]?.prenom} le {fdatetime(x.archived!.at)} · {x.archived!.motif}
            </p>
          </div>
          {isAdmin && (
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => restore(c, x.id)}>
              <Check size={13} /> Restaurer
            </button>
          )}
        </div>
      ))}
    </Card>
  )
}
