import { ReactNode, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Plus, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import { AgencyInfo, KpiTargets, UserId } from '../store/types'
import { Avatar, Callout, Card, Editable, Field, Page, Segmented, cx } from '../components/ui'
import { uid } from '../lib/format'

const STORAGE_KEY = 'mjagency-cockpit-v1'

const AGENCY_FIELDS: { key: keyof AgencyInfo; label: string; wide?: boolean }[] = [
  { key: 'name', label: 'Nom de l’agence' }, { key: 'instagram', label: 'Instagram' }, { key: 'address', label: 'Adresse', wide: true },
  { key: 'siret', label: 'SIRET' }, { key: 'vat', label: 'Mention TVA' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Téléphone' },
  { key: 'terms', label: 'Conditions de paiement', wide: true }, { key: 'revisions', label: 'Révisions incluses', wide: true },
]
const KPI_FIELDS: { key: keyof KpiTargets; label: string }[] = [
  { key: 'contacts', label: 'Contacts sortants' }, { key: 'conversations', label: 'Conversations' }, { key: 'meetings', label: 'Rendez-vous' },
  { key: 'quotes', label: 'Devis envoyés' }, { key: 'sales', label: 'Ventes' }, { key: 'posts', label: 'Publications' }, { key: 'partners', label: 'Apporteurs activés' },
]

const move = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  )
}

function OrderRow({ index, total, onMove, onDelete, deleteTitle, canDelete, children }: { index: number; total: number; onMove: (d: -1 | 1) => void; onDelete: () => void; deleteTitle?: string; canDelete: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-7 h-7 rounded-pill bg-card2 border border-line text-muted text-xs font-semibold grid place-content-center shrink-0">{index + 1}</span>
      <span className="flex-1 text-sm text-txt min-w-0">{children}</span>
      <span className="inline-flex items-center">
        <button className="btn-icon !w-8 !h-8" disabled={index === 0} onClick={() => onMove(-1)} title="Monter"><ChevronUp size={15} className={cx(index === 0 && 'opacity-30')} /></button>
        <button className="btn-icon !w-8 !h-8" disabled={index === total - 1} onClick={() => onMove(1)} title="Descendre"><ChevronDown size={15} className={cx(index === total - 1 && 'opacity-30')} /></button>
        <button className={cx('btn-icon !w-8 !h-8', canDelete ? 'hover:text-danger' : 'opacity-30 cursor-not-allowed')} disabled={!canDelete} title={canDelete ? 'Supprimer' : deleteTitle} onClick={onDelete}><Trash2 size={15} /></button>
      </span>
    </li>
  )
}

export default function Reglages() {
  const s = useStore()
  const { settings, setSettings, users, offers, commissionRules, prospects, projects, quotes, patch, add, remove, setAll, resetAll } = s
  const fileRef = useRef<HTMLInputElement>(null)
  const [askReset, setAskReset] = useState(false)
  const [importError, setImportError] = useState('')

  const setAgency = (k: keyof AgencyInfo, v: string) => setSettings({ agency: { ...settings.agency, [k]: v } })
  const stages = settings.pipelineStages
  const steps = settings.productionSteps

  const renameStage = (i: number, name: string) => {
    const old = stages[i]
    if (!name.trim() || name === old) return
    setSettings({ pipelineStages: stages.map((x, j) => (j === i ? name : x)) })
    setAll('prospects', prospects.map((p) => (p.stage === old ? { ...p, stage: name } : p)))
  }
  const stageUsed = (st: string) => prospects.filter((p) => p.stage === st).length
  const offerUsed = (id: string) => prospects.some((p) => p.offerId === id) || projects.some((p) => p.offerId === id) || quotes.some((q) => q.offerId === id)

  const exportJson = () => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? JSON.stringify({ state: s, version: 0 })
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `mjagency-cockpit-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) throw new Error('Le fichier ne contient pas de clé « state ».')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
      location.reload()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Fichier illisible.')
    }
  }

  return (
    <Page title="Réglages" subtitle="Tout ce qui est pré-rempli se modifie ici.">
      <div className="max-w-[900px] flex flex-col gap-4">
        <Section title="Informations de l’agence" hint="Reprises sur les devis et les factures.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AGENCY_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} className={cx(f.wide && 'md:col-span-2')}>
                <input className="input" value={settings.agency[f.key]} onChange={(e) => setAgency(f.key, e.target.value)} />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Utilisateurs">
          <div className="flex flex-col gap-3">
            {users.map((u) => (
              <div key={u.id} className="card-2 p-4 grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-3">
                <Avatar user={u} size={36} />
                <input className="input" value={u.name} onChange={(e) => patch('users', u.id, { name: e.target.value, initials: e.target.value.slice(0, 2).toUpperCase() || u.initials })} placeholder="Prénom" />
                <input className="input" value={u.role} onChange={(e) => patch('users', u.id, { role: e.target.value })} placeholder="Rôle" />
                <select className="input !w-auto" value={u.pole} onChange={(e) => patch('users', u.id, { pole: e.target.value as 'Production' | 'Acquisition' })}>
                  <option>Production</option><option>Acquisition</option>
                </select>
                <input type="color" title="Couleur" className="w-10 h-10 rounded-xl bg-card2 border border-line p-1 cursor-pointer" value={u.color} onChange={(e) => patch('users', u.id, { color: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
            <span className="text-sm text-muted">Utilisateur courant</span>
            <Segmented<UserId> value={settings.currentUser} onChange={(currentUser) => setSettings({ currentUser })} options={users.map((u) => ({ value: u.id, label: u.name }))} />
          </div>
        </Section>

        <Section title="Étapes du pipeline" hint="Renommer une étape la renomme aussi sur les prospects.">
          <ul className="divide-y divide-line/70">
            {stages.map((st, i) => {
              const n = stageUsed(st)
              return (
                <OrderRow key={i} index={i} total={stages.length} onMove={(d) => setSettings({ pipelineStages: move(stages, i, d) })} canDelete={n === 0}
                  deleteTitle={`${n} prospect${n > 1 ? 's' : ''} utilise${n > 1 ? 'nt' : ''} cette étape`} onDelete={() => setSettings({ pipelineStages: stages.filter((_, j) => j !== i) })}>
                  <Editable value={st} onChange={(v) => renameStage(i, v)} />
                  {n > 0 && <span className="ml-2 text-xs text-muted">{n}</span>}
                </OrderRow>
              )
            })}
          </ul>
          <button className="btn-ghost !py-1.5 mt-3" onClick={() => setSettings({ pipelineStages: [...stages, 'Nouvelle étape'] })}><Plus size={14} /> Étape</button>
          <p className="text-xs text-muted mt-4">« Devis envoyé » déclenche la séquence de relance automatique. « Gagné » et « Perdu » sont des étapes terminales.</p>
        </Section>

        <Section title="Offres et tarifs" hint="Le prix sert de montant par défaut sur les devis, le libellé s’affiche dans le playbook.">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-line"><th className="th w-10" /><th className="th">Nom</th><th className="th">Prix (€)</th><th className="th">Libellé</th><th className="th">Pour qui</th><th className="th" /></tr></thead>
              <tbody>
                {offers.map((o) => {
                  const used = offerUsed(o.id)
                  return (
                    <tr key={o.id} className="tr">
                      <td className="td"><input type="color" title="Couleur" className="w-7 h-7 rounded-lg bg-card2 border border-line p-0.5 cursor-pointer" value={o.color} onChange={(e) => patch('offers', o.id, { color: e.target.value })} /></td>
                      <td className="td"><input className="input !py-2" value={o.name} onChange={(e) => patch('offers', o.id, { name: e.target.value })} /></td>
                      <td className="td w-[120px]"><input className="input !py-2" type="number" value={o.price} onChange={(e) => patch('offers', o.id, { price: Number(e.target.value) })} /></td>
                      <td className="td w-[140px]"><input className="input !py-2" value={o.priceLabel} onChange={(e) => patch('offers', o.id, { priceLabel: e.target.value })} /></td>
                      <td className="td"><input className="input !py-2" value={o.audience} onChange={(e) => patch('offers', o.id, { audience: e.target.value })} /></td>
                      <td className="td text-right w-12">
                        <button className={cx('btn-icon !w-8 !h-8', used ? 'opacity-30 cursor-not-allowed' : 'hover:text-danger')} disabled={used} title={used ? 'Utilisée par un prospect, un projet ou un devis' : 'Supprimer'} onClick={() => remove('offers', o.id)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button className="btn-ghost !py-1.5 mt-3" onClick={() => add('offers', { id: uid(), name: 'Nouvelle offre', price: 0, priceLabel: '0 €', content: '', audience: '', color: '#0071E3' })}><Plus size={14} /> Offre</button>
        </Section>

        <Section title="Commissions" hint="Grille affichée aux apporteurs d’affaires.">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[480px]">
              <thead><tr className="border-b border-line"><th className="th">Vendu</th><th className="th">Commission</th><th className="th" /></tr></thead>
              <tbody>
                {commissionRules.map((c) => (
                  <tr key={c.id} className="tr">
                    <td className="td"><input className="input !py-2" value={c.sold} onChange={(e) => patch('commissionRules', c.id, { sold: e.target.value })} /></td>
                    <td className="td w-[180px]"><input className="input !py-2" value={c.commission} onChange={(e) => patch('commissionRules', c.id, { commission: e.target.value })} /></td>
                    <td className="td text-right w-12"><button className="btn-icon !w-8 !h-8 hover:text-danger" title="Supprimer" onClick={() => remove('commissionRules', c.id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-ghost !py-1.5 mt-3" onClick={() => add('commissionRules', { id: uid(), sold: '', commission: '' })}><Plus size={14} /> Règle</button>
        </Section>

        <Section title="Cibles KPI hebdo" hint="Objectifs comparés chaque semaine aux chiffres saisis.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {KPI_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <input className="input" type="number" min={0} value={settings.kpiTargets[f.key]} onChange={(e) => setSettings({ kpiTargets: { ...settings.kpiTargets, [f.key]: Number(e.target.value) } })} />
              </Field>
            ))}
            <Field label="Objectif DM / jour">
              <input className="input" type="number" min={0} value={settings.dmTargetPerDay} onChange={(e) => setSettings({ dmTargetPerDay: Number(e.target.value) })} />
            </Field>
          </div>
        </Section>

        <Section title="Étapes de production" hint="Les projets conservent leurs cases cochées, étape par étape.">
          <ul className="divide-y divide-line/70">
            {steps.map((st, i) => (
              <OrderRow key={st.id} index={i} total={steps.length} canDelete onMove={(d) => setSettings({ productionSteps: move(steps, i, d) })} onDelete={() => setSettings({ productionSteps: steps.filter((x) => x.id !== st.id) })}>
                <Editable value={st.label} onChange={(label) => setSettings({ productionSteps: steps.map((x) => (x.id === st.id ? { ...x, label } : x)) })} />
              </OrderRow>
            ))}
          </ul>
          <button className="btn-ghost !py-1.5 mt-3" onClick={() => setSettings({ productionSteps: [...steps, { id: uid(), label: 'Nouvelle étape' }] })}><Plus size={14} /> Étape</button>
        </Section>

        <Section title="Données" hint="Tout est stocké sur cet appareil. Exportez régulièrement.">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={exportJson}><Download size={15} /> Exporter (JSON)</button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={15} /> Importer (JSON)</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {importError && <div className="mt-3"><Callout tone="danger" title="Import impossible">{importError}</Callout></div>}
          <div className="mt-6 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-txt">Réinitialiser les données de démonstration</div>
              <div className="text-xs text-muted mt-0.5">Efface tout ce qui a été saisi et recharge le jeu de données initial.</div>
            </div>
            {askReset ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-muted">Confirmer ?</span>
                <button className="btn-danger !py-1.5" onClick={() => { resetAll(); setAskReset(false) }}>Oui, réinitialiser</button>
                <button className="btn-ghost !py-1.5" onClick={() => setAskReset(false)}>Annuler</button>
              </span>
            ) : (
              <button className="btn-danger" onClick={() => setAskReset(true)}><Trash2 size={14} /> Réinitialiser</button>
            )}
          </div>
        </Section>
      </div>
    </Page>
  )
}
