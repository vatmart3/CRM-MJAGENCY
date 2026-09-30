import { useState } from 'react'
import { Archive, ArrowDown, ArrowUp, CheckCircle2, Cloud, CloudOff, Download, ExternalLink, Moon, Plus, Save, Sun } from 'lucide-react'
import { alive, useFlux } from '../store'
import { Settings, USERS, UserId } from '../types'
import { ASSOCIES, tauxResume } from '../lib/finance'
import { isCloud } from '../lib/supabase'
import { cx, parseAmount, pct } from '../lib/format'
import { today } from '../lib/dates'
import { saveBlob } from '../lib/download'
import { Card, CardHead, Field, MoneyInput, Notice, Page, Segmented, toast, Toggle } from '../components/ui'
import { SplitField, openEditor } from '../components/editors'

function NumField({ label, value, onChange, suffix, hint, step = '0.1' }: { label: string; value: number; onChange: (n: number) => void; suffix: string; hint?: string; step?: string }) {
  const [raw, setRaw] = useState(String(value).replace('.', ','))
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className="input tnum pr-10"
          inputMode="decimal"
          step={step}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            onChange(parseAmount(e.target.value))
          }}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">{suffix}</span>
      </div>
    </Field>
  )
}

export default function Reglages() {
  const s = useFlux()
  const [draft, setDraft] = useState<Settings>(s.settings)
  const set = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }))
  const setEnt = (p: Partial<Settings['entreprise']>) => setDraft((d) => ({ ...d, entreprise: { ...d.entreprise, ...p } }))
  const setAcre = (who: UserId, p: Partial<Settings['acre'][UserId]>) => setDraft((d) => ({ ...d, acre: { ...d.acre, [who]: { ...d.acre[who], ...p } } }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.settings)

  const save = (extra?: Partial<Settings>) => {
    s.setSettings({ ...draft, ...extra })
    if (extra) setDraft((d) => ({ ...d, ...extra }))
    toast({ title: 'Réglages enregistrés', text: 'Tous les calculs sont à jour.', tone: 'success' })
  }

  const backup = () => {
    const { clients, projets, recettes, depenses, categories, abonnements, declarations, rapports, settings, stats, journal } = useFlux.getState()
    const blob = new Blob([JSON.stringify({ app: 'FLUX', exportedAt: new Date().toISOString(), clients, projets, recettes, depenses, categories, abonnements, declarations, rapports, settings, stats, journal }, null, 2)], { type: 'application/json' })
    saveBlob(blob, `FLUX-sauvegarde-${today()}.json`).catch((e: Error) => toast({ title: 'Sauvegarde non enregistrée', text: e.message, tone: 'error' }))
  }

  return (
    <Page
      title="Réglages"
      subtitle="Taux, seuils et paramètres : rien n’est codé en dur, tout se modifie ici."
      actions={
        <button className="btn-primary" disabled={!dirty} onClick={() => save()}>
          <Save size={16} /> Enregistrer
        </button>
      }
    >
      <div className="grid lg:grid-cols-2 gap-3 md:gap-4">
        <Card className="lg:row-span-2">
          <CardHead title="Cotisations & seuils" sub={`Taux total appliqué au CA encaissé : ${tauxResume(draft, today(), 2)}`} />
          {!s.settings.tauxVerifies && (
            <div className="mb-4">
              <Notice tone="warn">
                Valeurs indicatives pour des prestations de services. Vérifie-les sur autoentrepreneur.urssaf.fr, puis confirme.
              </Notice>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Cotisations sociales" value={draft.tauxCotisations} onChange={(tauxCotisations) => set({ tauxCotisations })} suffix="%" hint="Ex. prestations de services" />
            <NumField label="Contribution formation (CFP)" value={draft.tauxCFP} onChange={(tauxCFP) => set({ tauxCFP })} suffix="%" step="0.01" />
            <div className="col-span-2 card-2 px-4 py-3 space-y-3">
              <Toggle checked={draft.vlActif} onChange={(vlActif) => set({ vlActif })} label="Versement libératoire de l’impôt" />
              {draft.vlActif && <NumField label="Taux du versement libératoire" value={draft.tauxVL} onChange={(tauxVL) => set({ tauxVL })} suffix="%" />}
            </div>
            <div className="col-span-2 card-2 px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-medium">ACRE</p>
                <p className="text-xs text-muted mt-0.5">
                  Chacun déclare sa part du CA sur son propre compte URSSAF. L’ACRE réduit le taux de cotisations sociales de celui qui l’a, pour les encaissements jusqu’à sa date de fin.
                </p>
              </div>
              {ASSOCIES.map((w) => (
                <div key={w} className="space-y-2">
                  <Toggle checked={draft.acre[w].actif} onChange={(actif) => setAcre(w, { actif })} label={`${USERS[w].prenom} a l’ACRE`} />
                  {draft.acre[w].actif && (
                    <Field label="Fin de l’ACRE" hint="Vide : appliquée sans limite.">
                      <input type="date" className="input" value={draft.acre[w].fin} onChange={(e) => setAcre(w, { fin: e.target.value })} />
                    </Field>
                  )}
                </div>
              ))}
              {ASSOCIES.some((w) => draft.acre[w].actif) && (
                <NumField
                  label="Réduction des cotisations sociales"
                  value={draft.reductionACRE}
                  onChange={(reductionACRE) => set({ reductionACRE })}
                  suffix="%"
                  step="1"
                  hint={`25 % pour une activité démarrée depuis le 1er juillet 2025, 50 % avant. Taux réduit : ${pct(draft.tauxCotisations * (1 - draft.reductionACRE / 100), 2)}.`}
                />
              )}
            </div>
            <Field label="Seuil de franchise TVA"><MoneyInput value={draft.seuilTVA} onChange={(seuilTVA) => set({ seuilTVA })} /></Field>
            <Field label="Seuil TVA majoré"><MoneyInput value={draft.seuilTVAMajore} onChange={(seuilTVAMajore) => set({ seuilTVAMajore })} /></Field>
            <Field label="Plafond de CA micro" className="col-span-2"><MoneyInput value={draft.plafondMicro} onChange={(plafondMicro) => set({ plafondMicro })} /></Field>
            <Field label="Déclaration URSSAF" className="col-span-2">
              <Segmented value={draft.periodicite} onChange={(periodicite) => set({ periodicite })} options={[{ value: 'mensuelle', label: 'Mensuelle' }, { value: 'trimestrielle', label: 'Trimestrielle' }]} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <a className="btn-outline !py-2 text-xs" href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noreferrer">
              autoentrepreneur.urssaf.fr <ExternalLink size={13} />
            </a>
            {!s.settings.tauxVerifies ? (
              <button className="btn-primary !py-2 text-xs" onClick={() => save({ tauxVerifies: true })}>
                <CheckCircle2 size={14} /> J’ai vérifié ces valeurs
              </button>
            ) : (
              <span className="text-xs text-accent font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} /> Valeurs vérifiées</span>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Pilotage" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Objectif de CA mensuel" className="col-span-2"><MoneyInput value={draft.objectifMensuel} onChange={(objectifMensuel) => set({ objectifMensuel })} /></Field>
            <Field label="Solde du compte pro" hint="Point de départ de la trésorerie estimée."><MoneyInput value={draft.soldeInitial} onChange={(soldeInitial) => set({ soldeInitial })} /></Field>
            <Field label="Au"><input type="date" className="input" value={draft.dateSoldeInitial} onChange={(e) => set({ dateSoldeInitial: e.target.value })} /></Field>
            <NumField label="Délai de paiement" value={draft.delaiPaiementJours} onChange={(delaiPaiementJours) => set({ delaiPaiementJours: Math.round(delaiPaiementJours) })} suffix="jours" step="1" />
            <Field label="Préfixe des factures" hint={`Ex. ${draft.prefixeFacture || 'F'}-${today().slice(0, 4)}-001`}>
              <input className="input" value={draft.prefixeFacture} onChange={(e) => set({ prefixeFacture: e.target.value.trim() })} />
            </Field>
          </div>
          <div className="mt-3">
            <SplitField value={draft.partDefautJeremy} onChange={(partDefautJeremy) => set({ partDefautJeremy })} label="Répartition par défaut (recettes sans projet)" />
          </div>
        </Card>

        <Card>
          <CardHead title="Entreprise" sub="Apparaît sur le livre des recettes, les rapports et les relances." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom commercial"><input className="input" value={draft.entreprise.nom} onChange={(e) => setEnt({ nom: e.target.value })} /></Field>
            <Field label="Titulaire"><input className="input" value={draft.entreprise.titulaire} onChange={(e) => setEnt({ titulaire: e.target.value })} /></Field>
            <Field label="SIRET"><input className="input" value={draft.entreprise.siret} onChange={(e) => setEnt({ siret: e.target.value })} /></Field>
            <Field label="Adresse"><input className="input" value={draft.entreprise.adresse} onChange={(e) => setEnt({ adresse: e.target.value })} /></Field>
            <Field label="E-mail"><input className="input" type="email" value={draft.entreprise.email} onChange={(e) => setEnt({ email: e.target.value })} /></Field>
            <Field label="Téléphone"><input className="input" value={draft.entreprise.telephone} onChange={(e) => setEnt({ telephone: e.target.value })} /></Field>
            <Field label="Mention TVA" className="col-span-2"><input className="input" value={draft.entreprise.mentionTVA} onChange={(e) => setEnt({ mentionTVA: e.target.value })} /></Field>
            <Field label="Signature des relances" className="col-span-2"><textarea className="input" value={draft.signatureRelance} onChange={(e) => set({ signatureRelance: e.target.value })} /></Field>
          </div>
        </Card>

        <Categories />

        <Card>
          <CardHead title="Apparence & données" />
          <Field label="Thème">
            <Segmented
              value={s.theme}
              onChange={s.setTheme}
              options={[
                { value: 'nuit', label: <span className="flex items-center gap-1.5"><Moon size={13} /> Nuit</span> },
                { value: 'jour', label: <span className="flex items-center gap-1.5"><Sun size={13} /> Jour · charte MJAGENCY</span> },
              ]}
            />
          </Field>
          <div className="card-2 px-4 py-3 mt-4 flex items-start gap-3">
            {isCloud ? <Cloud size={18} className="text-accent mt-0.5" /> : <CloudOff size={18} className="text-warn mt-0.5" />}
            <p className="text-sm">
              {isCloud ? (
                <>Données en ligne (Supabase), synchronisées en temps réel entre Jérémy et Matheis.</>
              ) : (
                <>
                  <b>Mode local</b> : les données restent dans ce navigateur. Pour les partager et les retrouver sur mobile, branche Supabase (voir <code>flux/docs/MISE-EN-LIGNE.md</code>).
                </>
              )}
            </p>
          </div>
          <button className="btn-ghost mt-4" onClick={backup}>
            <Download size={15} /> Sauvegarde complète (JSON)
          </button>
          <p className="text-xs text-muted mt-3">
            Il n’existe aucun bouton de suppression définitive : c’est voulu, pour la traçabilité comptable. Les exports PDF et CSV sont dans <b>Exports & rapports</b>.
          </p>
        </Card>
      </div>
    </Page>
  )
}

function Categories() {
  const s = useFlux()
  const cats = alive(s.categories).sort((a, b) => a.ordre - b.ordre)
  const [nom, setNom] = useState('')
  const move = (i: number, dir: -1 | 1) => {
    const a = cats[i]
    const b = cats[i + dir]
    if (!a || !b) return
    s.update('categories', a.id, { ordre: b.ordre }, { silent: true })
    s.update('categories', b.id, { ordre: a.ordre }, { silent: true })
  }
  return (
    <Card>
      <CardHead title="Catégories de dépenses" sub="Les mots-clés aident le scan et l’assistant à reconnaître la catégorie." />
      <div className="space-y-2">
        {cats.map((c, i) => (
          <div key={c.id} className="card-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <input className="flex-1 bg-transparent outline-none text-sm font-medium" defaultValue={c.nom} onBlur={(e) => e.target.value.trim() && e.target.value !== c.nom && s.update('categories', c.id, { nom: e.target.value.trim() })} />
              <button className="btn-icon !w-7 !h-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><ArrowUp size={14} /></button>
              <button className="btn-icon !w-7 !h-7" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><ArrowDown size={14} /></button>
              <button className="btn-icon !w-7 !h-7" onClick={() => openEditor('archive', { id: c.id, coll: 'categories' })} aria-label="Archiver"><Archive size={14} /></button>
            </div>
            <input
              className={cx('w-full bg-transparent outline-none text-xs text-muted mt-1')}
              placeholder="mots-clés, séparés par des espaces"
              defaultValue={c.motsCles}
              onBlur={(e) => e.target.value !== c.motsCles && s.update('categories', c.id, { motsCles: e.target.value })}
            />
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nom.trim()) return
          s.create('categories', { nom: nom.trim(), motsCles: '', ordre: Math.max(0, ...cats.map((c) => c.ordre)) + 1 })
          setNom('')
        }}
      >
        <input className="input" placeholder="Nouvelle catégorie" value={nom} onChange={(e) => setNom(e.target.value)} />
        <button className="btn-primary !px-4" aria-label="Ajouter"><Plus size={16} /></button>
      </form>
    </Card>
  )
}
