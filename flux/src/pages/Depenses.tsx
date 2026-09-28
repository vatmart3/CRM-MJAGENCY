import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Archive, ArrowUpRight, Camera, Check, FileText, MoreHorizontal, Paperclip, Pencil, Plus, Repeat, ScanLine, Wallet } from 'lucide-react'
import { alive, PeriodFilter, useFlux, useIsAdmin } from '../store'
import { Depense, PAYE_PAR_LABEL, USERS, UserId } from '../types'
import { notesDeFrais, totalDu } from '../lib/finance'
import { fdate, inRange } from '../lib/dates'
import { cx, eur, normalize, plural, round2 } from '../lib/format'
import { marquerRembourse } from '../lib/actions'
import { openFile } from '../lib/files'
import { Avatar, Card, CardHead, Empty, Menu, Page, Segmented, Tag, toast, Toggle, useIsDesktop } from '../components/ui'
import { FilterBar, FilterSelect, ListPeriod, Totals } from '../components/ListTools'
import { openEditor } from '../components/editors'

export default function Depenses() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('onglet') === 'notes' ? 'notes' : 'toutes'
  return (
    <Page
      title="Dépenses"
      subtitle="Saisies en TTC : la TVA n’est pas récupérable en franchise."
      actions={
        <>
          <button className="btn-ghost" onClick={() => openEditor('scan')}>
            <ScanLine size={16} /> Scanner
          </button>
          <button className="btn-primary" onClick={() => openEditor('depense')}>
            <Plus size={16} /> Nouvelle dépense
          </button>
        </>
      }
    >
      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'notes' ? { onglet: 'notes' } : {})}
          options={[
            { value: 'toutes', label: 'Toutes les dépenses' },
            { value: 'notes', label: 'Notes de frais' },
          ]}
        />
      </div>
      {tab === 'notes' ? <NotesDeFrais /> : <Liste />}
    </Page>
  )
}

function Liste() {
  const s = useFlux()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [payePar, setPayePar] = useState('')
  const [projet, setProjet] = useState('')
  const [justif, setJustif] = useState(params.get('justif') ?? '')
  const [period, setPeriod] = useState<PeriodFilter | null>(null)
  const [archived, setArchived] = useState(false)
  const desktop = useIsDesktop()
  const cats = alive(s.categories).sort((a, b) => a.ordre - b.ordre)

  const list = useMemo(() => {
    const n = normalize(q)
    return (archived ? s.depenses.filter((d) => d.archived) : alive(s.depenses))
      .filter((d) => {
        if (cat && d.categorieId !== cat) return false
        if (payePar && d.payePar !== payePar) return false
        if (projet && d.projetId !== projet) return false
        if (justif === 'manquant' && d.justificatif) return false
        if (justif === 'present' && !d.justificatif) return false
        if (period && !inRange(d.date, period.from, period.to)) return false
        const catNom = s.categories.find((c) => c.id === d.categorieId)?.nom ?? ''
        if (n && !normalize(`${d.fournisseur} ${d.libelle} ${catNom} ${d.montant}`).includes(n)) return false
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [s.depenses, s.categories, q, cat, payePar, projet, justif, period, archived])

  const total = round2(list.reduce((a, d) => a + d.montant, 0))
  const manquants = list.filter((d) => !d.justificatif)
  const active = [cat, payePar, projet, justif, period ? 'p' : '', archived ? 'a' : ''].filter(Boolean).length
  const reset = () => {
    setCat('')
    setPayePar('')
    setProjet('')
    setJustif('')
    setPeriod(null)
    setArchived(false)
  }

  return (
    <>
      <Totals
        items={[
          { label: 'Total TTC', value: eur(total) },
          { label: 'Compte pro', value: eur(round2(list.filter((d) => d.payePar === 'pro').reduce((a, d) => a + d.montant, 0))) },
          { label: 'Payé en perso', value: eur(round2(list.filter((d) => d.payePar !== 'pro').reduce((a, d) => a + d.montant, 0))) },
          { label: 'Sans justificatif', value: manquants.length, tone: manquants.length ? 'warn' : undefined },
        ]}
      />
      <FilterBar q={q} onQ={setQ} placeholder="Fournisseur, libellé, catégorie…" active={active} onReset={reset}>
        <FilterSelect label="Catégorie" value={cat} onChange={setCat} options={cats.map((c) => ({ value: c.id, label: c.nom }))} />
        <FilterSelect label="Payé par" value={payePar} onChange={setPayePar} options={Object.entries(PAYE_PAR_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Projet" value={projet} onChange={setProjet} options={alive(s.projets).map((p) => ({ value: p.id, label: p.nom }))} />
        <FilterSelect label="Justificatif" value={justif} onChange={setJustif} options={[{ value: 'manquant', label: 'Manquant' }, { value: 'present', label: 'Présent' }]} />
        <ListPeriod value={period} onChange={setPeriod} />
        <div className="py-2">
          <Toggle checked={archived} onChange={setArchived} label="Archivées" />
        </div>
      </FilterBar>

      {list.length === 0 ? (
        <Card>
          {alive(s.depenses).length === 0 && !archived ? (
            <Empty
              icon={<ArrowUpRight size={24} />}
              title="Ajoute ta première dépense"
              text="Ou prends directement un ticket en photo : FLUX lit le fournisseur, la date et le montant."
              action={
                <div className="flex flex-wrap gap-2 justify-center">
                  <button className="btn-primary" onClick={() => openEditor('scan')}><Camera size={16} /> Scanner un ticket</button>
                  <button className="btn-ghost" onClick={() => openEditor('depense')}><Plus size={16} /> Saisir</button>
                </div>
              }
            />
          ) : (
            <Empty icon={<FileText size={22} />} title="Aucune dépense ne correspond" action={<button className="btn-ghost" onClick={reset}>Réinitialiser</button>} />
          )}
        </Card>
      ) : desktop ? (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th pl-5">Date</th>
                <th className="th">Fournisseur</th>
                <th className="th">Catégorie</th>
                <th className="th">Payé par</th>
                <th className="th">Pièce</th>
                <th className="th text-right">Montant TTC</th>
                <th className="th w-12" />
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="row cursor-pointer" onClick={() => !d.archived && openEditor('depense', { id: d.id })}>
                  <td className="td pl-5 tnum whitespace-nowrap">{fdate(d.date)}</td>
                  <td className="td">
                    <span className="flex items-center gap-1.5 font-medium">
                      {d.fournisseur}
                      {d.recurrente && <Repeat size={12} className="text-muted" />}
                    </span>
                    <span className="block text-xs text-muted truncate max-w-[260px]">{d.archived ? `Archivée : ${d.archived.motif}` : d.libelle}</span>
                  </td>
                  <td className="td text-muted">{s.categories.find((c) => c.id === d.categorieId)?.nom ?? '—'}</td>
                  <td className="td">
                    {d.payePar === 'pro' ? <span className="text-muted">Compte pro</span> : (
                      <span className="flex items-center gap-1.5">
                        {USERS[d.payePar as UserId].prenom}
                        {d.aRembourser && <Tag tone={d.rembourseLe ? 'muted' : 'warn'}>{d.rembourseLe ? 'remboursé' : 'à rembourser'}</Tag>}
                      </span>
                    )}
                  </td>
                  <td className="td">
                    <Justif d={d} />
                  </td>
                  <td className="td text-right font-semibold tnum whitespace-nowrap">{eur(d.montant)}</td>
                  <td className="td pr-4" onClick={(e) => e.stopPropagation()}>
                    <RowMenu d={d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {list.map((d) => (
            <Card key={d.id} className="!p-4" onClick={() => !d.archived && openEditor('depense', { id: d.id })}>
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-card2 text-expense grid place-content-center shrink-0">
                  <ArrowUpRight size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{d.fournisseur}</p>
                    <p className="font-bold tnum whitespace-nowrap">{eur(d.montant)}</p>
                  </div>
                  <p className="text-xs text-muted truncate">
                    {fdate(d.date)} · {s.categories.find((c) => c.id === d.categorieId)?.nom}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Justif d={d} />
                    {d.payePar !== 'pro' && <Tag tone={d.aRembourser && !d.rembourseLe ? 'warn' : 'muted'}>{PAYE_PAR_LABEL[d.payePar]}</Tag>}
                    <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                      <RowMenu d={d} />
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {list.length > 0 && <p className="text-xs text-muted text-center mt-4">{plural(list.length, 'dépense')}</p>}
    </>
  )
}

/** Indicateur de pièce jointe : ouvre le justificatif, ou signale qu'il manque. */
function Justif({ d }: { d: Depense }) {
  if (d.justificatif)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          openFile(d.justificatif!).catch((err: Error) => toast({ title: 'Ouverture impossible', text: err.message, tone: 'error' }))
        }}
        className="pill bg-accent/15 text-accent hover:bg-accent/25"
      >
        <Paperclip size={11} /> Pièce
      </button>
    )
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        openEditor('depense', { id: d.id })
      }}
      className="pill bg-warn/15 text-warn hover:bg-warn/25"
    >
      <AlertTriangle size={11} /> Manquant
    </button>
  )
}

function RowMenu({ d }: { d: Depense }) {
  const restore = useFlux((s) => s.restore)
  const isAdmin = useIsAdmin()
  return (
    <Menu
      trigger={<button className="btn-icon !w-8 !h-8" aria-label="Actions"><MoreHorizontal size={16} /></button>}
      items={
        d.archived
          ? [{ label: 'Restaurer', icon: <Check size={15} />, onClick: () => restore('depenses', d.id), hidden: !isAdmin }]
          : [
              { label: 'Modifier', icon: <Pencil size={15} />, onClick: () => openEditor('depense', { id: d.id }) },
              { label: 'Marquer remboursée', icon: <Wallet size={15} />, onClick: () => marquerRembourse([d.id]), hidden: !(d.aRembourser && !d.rembourseLe) },
              { label: 'Archiver', icon: <Archive size={15} />, onClick: () => openEditor('archive', { id: d.id, coll: 'depenses' }), danger: true },
            ]
      }
    />
  )
}

// ── Notes de frais ──────────────────────────────────────────────────────────

function NotesDeFrais() {
  const depenses = useFlux((s) => s.depenses)
  const categories = useFlux((s) => s.categories)
  const [sel, setSel] = useState<string[]>([])
  const [histo, setHisto] = useState(false)
  const notes = notesDeFrais(depenses).sort((a, b) => b.date.localeCompare(a.date))
  const dues = notes.filter((d) => !d.rembourseLe)
  const faites = notes.filter((d) => d.rembourseLe)
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
        {(['jeremy', 'matheis'] as UserId[]).map((who) => {
          const du = totalDu(depenses, who)
          const n = dues.filter((d) => d.payePar === who)
          return (
            <Card key={who} className={cx(du > 0 && 'hero-grad')}>
              <div className="flex items-center gap-3">
                <Avatar name={USERS[who].nom} size={40} tone={du > 0 ? 'accent' : 'muted'} />
                <div className="flex-1">
                  <p className="text-sm text-muted">Dû à {USERS[who].prenom}</p>
                  <p className="big text-[30px]">{eur(du)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted">{plural(n.length, 'dépense')} à rembourser</span>
                {n.length > 0 && (
                  <button className="btn-primary !py-2 text-xs" onClick={() => marquerRembourse(n.map((d) => d.id))}>
                    <Check size={14} /> Tout rembourser
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 pt-5 flex items-center justify-between gap-2">
          <CardHead title="À rembourser" sub="Dépenses payées avec un compte perso, à rendre depuis le compte pro." />
          {sel.length > 0 && (
            <button
              className="btn-primary !py-2 text-xs mb-4"
              onClick={() => {
                marquerRembourse(sel)
                setSel([])
              }}
            >
              Rembourser {sel.length} ({eur(round2(dues.filter((d) => sel.includes(d.id)).reduce((a, d) => a + d.montant, 0)))})
            </button>
          )}
        </div>
        {dues.length === 0 ? (
          <Empty icon={<Wallet size={22} />} title="Aucune note de frais en attente" text="Quand un associé paie avec sa carte perso, coche « À rembourser » dans la dépense." />
        ) : (
          <div>
            {dues.map((d) => (
              <label key={d.id} className="row flex items-center gap-3 px-5 py-3 cursor-pointer">
                <input type="checkbox" className="cb" checked={sel.includes(d.id)} onChange={() => toggle(d.id)} />
                <Avatar name={USERS[d.payePar as UserId].nom} size={28} tone="muted" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{d.fournisseur}</span>
                  <span className="block text-xs text-muted">
                    {fdate(d.date)} · {categories.find((c) => c.id === d.categorieId)?.nom} · {USERS[d.payePar as UserId].prenom}
                  </span>
                </span>
                <Justif d={d} />
                <span className="text-sm font-semibold tnum w-24 text-right">{eur(d.montant)}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      {faites.length > 0 && (
        <Card>
          <button className="flex items-center justify-between w-full" onClick={() => setHisto(!histo)}>
            <span className="h-card">Déjà remboursées ({faites.length})</span>
            <span className="text-xs text-accent font-semibold">{histo ? 'Masquer' : 'Afficher'}</span>
          </button>
          {histo && (
            <div className="mt-3">
              {faites.map((d) => (
                <div key={d.id} className="row flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1 min-w-0 truncate">{d.fournisseur} · {USERS[d.payePar as UserId].prenom}</span>
                  <span className="text-xs text-muted">remboursé le {fdate(d.rembourseLe)}</span>
                  <span className="font-semibold tnum w-24 text-right">{eur(d.montant)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
