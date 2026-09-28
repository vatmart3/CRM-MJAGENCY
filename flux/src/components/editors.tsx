import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { Camera, ChevronDown, FileText, Loader2, Paperclip, Plus, ScanLine, Search, Sparkles, Upload } from 'lucide-react'
import { alive, useFlux, useIsAdmin } from '../store'
import {
  Abonnement, Client, Depense, FileRef, MODES_PAIEMENT, MODES_REGLEMENT, PAYE_PAR_LABEL, PayePar, Projet, PROJET_STATUTS, PROJET_TYPES, Recette,
} from '../types'
import { addDays, fdate, today } from '../lib/dates'
import { cx, eur, normalize, round2 } from '../lib/format'
import { aMettreDeCote, clientName, nextInvoiceNumber, statutOf } from '../lib/finance'
import { fileUrl, fmtSize, saveFile } from '../lib/files'
import { scanReceipt } from '../lib/scan'
import { Chips, Field, MoneyInput, Notice, Segmented, Sheet, toast, Toggle } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
// Toutes les fenêtres de saisie, ouvrables depuis n'importe quelle page :
// useEditor.getState().open('recette') ou open('depense', { id }).
// ─────────────────────────────────────────────────────────────────────────────

export type EditorKind = 'recette' | 'depense' | 'scan' | 'client' | 'projet' | 'abonnement' | 'archive'
interface EditorState {
  kind: EditorKind | null
  id?: string
  prefill?: Record<string, unknown>
  /** Pour l'archivage : la collection visée. */
  coll?: 'clients' | 'projets' | 'recettes' | 'depenses' | 'abonnements' | 'categories'
  open: (kind: EditorKind, opts?: { id?: string; prefill?: Record<string, unknown>; coll?: EditorState['coll'] }) => void
  close: () => void
}
export const useEditor = create<EditorState>((set) => ({
  kind: null,
  open: (kind, opts) => set({ kind, id: opts?.id, prefill: opts?.prefill, coll: opts?.coll }),
  close: () => set({ kind: null, id: undefined, prefill: undefined, coll: undefined }),
}))
export const openEditor = (kind: EditorKind, opts?: Parameters<EditorState['open']>[1]) => useEditor.getState().open(kind, opts)

export function Editors() {
  const kind = useEditor((s) => s.kind)
  const id = useEditor((s) => s.id)
  if (!kind) return null
  // La clé force un formulaire neuf à chaque ouverture.
  const stableKey = `${kind}-${id ?? 'new'}`
  if (kind === 'recette') return <RecetteEditor key={stableKey} />
  if (kind === 'depense') return <DepenseEditor key={stableKey} />
  if (kind === 'scan') return <ScanEditor key={stableKey} />
  if (kind === 'client') return <ClientEditor key={stableKey} />
  if (kind === 'projet') return <ProjetEditor key={stableKey} />
  if (kind === 'abonnement') return <AbonnementEditor key={stableKey} />
  return <ArchiveEditor key={stableKey} />
}

// ── Pièces communes ─────────────────────────────────────────────────────────

function Advanced({ open, onToggle, children, label = 'Plus de détails' }: { open: boolean; onToggle: () => void; children: ReactNode; label?: string }) {
  return (
    <div className="mt-4">
      <button type="button" onClick={onToggle} className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-txt">
        <ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} />
        {label}
      </button>
      {open && <div className="mt-3 space-y-3 animate-fadeIn">{children}</div>}
    </div>
  )
}

/** Choix d'un client, avec création à la volée : « + Nouveau client “Boulangerie Martin” ». */
export function ClientPicker({ value, onChange, autoFocus }: { value: string; onChange: (id: string) => void; autoFocus?: boolean }) {
  const clients = alive(useFlux((s) => s.clients))
  const create = useFlux((s) => s.create)
  const current = clients.find((c) => c.id === value)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const list = clients.filter((c) => normalize(`${c.nom} ${c.entreprise} ${c.ville}`).includes(normalize(q))).slice(0, 8)
  const exact = clients.some((c) => normalize(clientName(c)) === normalize(q))
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          className="input pl-10"
          placeholder="Rechercher ou créer un client"
          autoFocus={autoFocus}
          value={open ? q : current ? clientName(current) : q}
          onFocus={() => {
            setOpen(true)
            setQ('')
          }}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
        />
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 card !bg-panel shadow-lift p-1.5 max-h-64 overflow-y-auto">
          {list.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => {
                onChange(c.id)
                setOpen(false)
              }}
              className={cx('w-full text-left px-3 py-2 rounded-xl hover:bg-card2', c.id === value && 'bg-card2')}
            >
              <span className="text-sm font-medium">{clientName(c)}</span>
              {(c.entreprise && c.nom) || c.ville ? (
                <span className="block text-xs text-muted">{[c.entreprise && c.nom, c.ville].filter(Boolean).join(' · ')}</span>
              ) : null}
            </button>
          ))}
          {q.trim() && !exact && (
            <button
              type="button"
              onClick={() => {
                const c = create('clients', { nom: q.trim(), entreprise: '', activite: '', ville: '', email: '', telephone: '', notes: '' })
                onChange(c.id)
                setOpen(false)
                toast({ title: 'Client créé', text: `${q.trim()} — complète sa fiche dans Clients.`, tone: 'info' })
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-accent hover:bg-card2"
            >
              <Plus size={15} /> Nouveau client « {q.trim()} »
            </button>
          )}
          {!q && list.length === 0 && <p className="px-3 py-2 text-sm text-muted">Tape le nom d’un client pour le créer.</p>}
        </div>
      )}
    </div>
  )
}

function ProjetSelect({ value, onChange, clientId }: { value: string; onChange: (id: string) => void; clientId?: string }) {
  const projets = alive(useFlux((s) => s.projets))
  const list = clientId ? projets.filter((p) => p.clientId === clientId || p.id === value) : projets
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Aucun projet</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nom}
        </option>
      ))}
    </select>
  )
}

/** Dépôt d'un justificatif : photo (appareil photo sur mobile) ou PDF. */
export function FileField({ value, onChange, accept = 'image/*,application/pdf', label = 'Justificatif' }: {
  value?: FileRef; onChange: (f?: FileRef) => void; accept?: string; label?: string
}) {
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try {
      onChange(await saveFile(f))
    } catch (e) {
      toast({ title: 'Justificatif non enregistré', text: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const view = async () => {
    try {
      const url = await fileUrl(value!)
      window.open(url, '_blank')
    } catch (e) {
      toast({ title: 'Ouverture impossible', text: (e as Error).message, tone: 'error' })
    }
  }
  return (
    <Field label={label}>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {value ? (
        <div className="flex items-center gap-3 card-2 px-3.5 py-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent grid place-content-center shrink-0">
            {value.type.startsWith('image/') ? <Camera size={16} /> : <FileText size={16} />}
          </span>
          <button type="button" onClick={view} className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-medium truncate">{value.name}</span>
            <span className="block text-xs text-muted">{fmtSize(value.size)} · ouvrir</span>
          </button>
          <button type="button" className="text-xs font-semibold text-muted hover:text-txt" onClick={() => input.current?.click()}>
            Remplacer
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => camera.current?.click()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} Photo
          </button>
          <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={15} /> Fichier
          </button>
        </div>
      )}
    </Field>
  )
}

// ── Recette ─────────────────────────────────────────────────────────────────

function RecetteEditor() {
  const { id, prefill, close } = useEditor()
  const s = useFlux()
  const existing = s.recettes.find((r) => r.id === id)
  const t = today()
  const [r, setR] = useState<Omit<Recette, 'id' | 'createdAt' | 'createdBy'>>(() =>
    existing
      ? { ...existing }
      : {
          dateFacture: t,
          dateEncaissement: t,
          clientId: '',
          projetId: '',
          numeroFacture: nextInvoiceNumber(s.recettes, s.settings, t),
          libelle: '',
          montant: 0,
          mode: 'Virement',
          statut: 'Encaissée',
          dateEcheance: addDays(t, s.settings.delaiPaiementJours),
          ...(prefill as Partial<Recette>),
        },
  )
  const [adv, setAdv] = useState(!!existing)
  const [err, setErr] = useState('')
  const set = (p: Partial<Recette>) => setR((x) => ({ ...x, ...p }))
  const encaissee = r.statut === 'Encaissée'

  const save = () => {
    if (r.montant <= 0) return setErr('Indique un montant.')
    if (!r.clientId) return setErr('Choisis ou crée le client (obligatoire pour le livre des recettes).')
    if (encaissee && !r.dateEncaissement) return setErr('Indique la date d’encaissement.')
    const projet = s.projets.find((p) => p.id === r.projetId)
    const data = {
      ...r,
      libelle: r.libelle.trim() || (projet ? `${projet.type} — ${projet.nom}` : 'Prestation'),
      dateEncaissement: encaissee ? r.dateEncaissement : '',
      statut: r.statut,
    }
    const devientEncaissee = encaissee && (!existing || existing.statut !== 'Encaissée')
    if (existing) s.update('recettes', existing.id, data)
    else s.create('recettes', data)
    close()
    if (devientEncaissee)
      toast({ title: existing ? 'Recette encaissée' : 'Recette enregistrée', text: `Mets ${eur(aMettreDeCote(r.montant, s.settings))} de côté pour l’URSSAF.`, tone: 'success' })
    else toast({ title: existing ? 'Recette modifiée' : 'Recette enregistrée', text: encaissee ? undefined : `En attente de paiement, échéance le ${fdate(r.dateEcheance)}.`, tone: 'success' })
  }

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Modifier la recette' : 'Nouvelle recette'}
      footer={
        <>
          <button className="btn-ghost" onClick={close}>Annuler</button>
          <button className="btn-primary min-w-[140px]" onClick={save}>Enregistrer</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <MoneyInput big value={r.montant} onChange={(montant) => set({ montant })} autoFocus={!existing} />
        {r.montant > 0 && encaissee && (
          <p className="text-xs text-muted -mt-1">
            À mettre de côté pour l’URSSAF : <b className="text-txt tnum">{eur(aMettreDeCote(r.montant, s.settings))}</b>
          </p>
        )}
        <Field label="Client">
          <ClientPicker value={r.clientId} onChange={(clientId) => set({ clientId, projetId: s.projets.find((p) => p.id === r.projetId)?.clientId === clientId ? r.projetId : '' })} />
        </Field>
        <Field label="Nature de la prestation">
          <input className="input" placeholder="Ex. Création du site vitrine" value={r.libelle} onChange={(e) => set({ libelle: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Statut">
            <Segmented
              value={r.statut === 'Encaissée' ? 'Encaissée' : 'En attente'}
              onChange={(v) => set({ statut: v as Recette['statut'], dateEncaissement: v === 'Encaissée' ? r.dateEncaissement || t : r.dateEncaissement })}
              options={[
                { value: 'Encaissée', label: 'Encaissée' },
                { value: 'En attente', label: 'À encaisser' },
              ]}
            />
          </Field>
          {encaissee ? (
            <Field label="Encaissée le">
              <input type="date" className="input" value={r.dateEncaissement} onChange={(e) => set({ dateEncaissement: e.target.value })} />
            </Field>
          ) : (
            <Field label="Échéance">
              <input type="date" className="input" value={r.dateEcheance} onChange={(e) => set({ dateEcheance: e.target.value })} />
            </Field>
          )}
        </div>

        <Advanced open={adv} onToggle={() => setAdv(!adv)} label="Facture, projet, règlement">
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° de facture">
              <input className="input" value={r.numeroFacture} onChange={(e) => set({ numeroFacture: e.target.value })} />
            </Field>
            <Field label="Date de facture">
              <input
                type="date"
                className="input"
                value={r.dateFacture}
                onChange={(e) => set({ dateFacture: e.target.value, dateEcheance: existing ? r.dateEcheance : addDays(e.target.value, s.settings.delaiPaiementJours) })}
              />
            </Field>
            <Field label="Mode de règlement">
              <select className="input" value={r.mode} onChange={(e) => set({ mode: e.target.value as Recette['mode'] })}>
                {MODES_REGLEMENT.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            {encaissee ? (
              <Field label="Échéance">
                <input type="date" className="input" value={r.dateEcheance} onChange={(e) => set({ dateEcheance: e.target.value })} />
              </Field>
            ) : (
              <Field label="Annuler la facture">
                <button type="button" className={cx('btn-outline w-full', r.statut === 'Annulée' && '!border-danger text-danger')} onClick={() => set({ statut: r.statut === 'Annulée' ? 'En attente' : 'Annulée' })}>
                  {r.statut === 'Annulée' ? 'Facture annulée' : 'Marquer annulée'}
                </button>
              </Field>
            )}
          </div>
          <Field label="Projet">
            <ProjetSelect value={r.projetId} onChange={(projetId) => set({ projetId })} clientId={r.clientId || undefined} />
          </Field>
          <FileField value={r.justificatif} onChange={(justificatif) => set({ justificatif })} accept="application/pdf,image/*" label="Facture (PDF)" />
          {existing && statutOf(existing) === 'En retard' && <Notice tone="danger">Échéance dépassée : cette facture apparaît « En retard ».</Notice>}
        </Advanced>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  )
}

// ── Dépense ─────────────────────────────────────────────────────────────────

/** Les infos de lecture du ticket guident le formulaire mais ne sont pas enregistrées. */
const stripScan = (p?: Record<string, unknown>) => {
  if (!p) return {}
  const { source, manquants, ...rest } = p
  void source
  void manquants
  return rest
}

function DepenseEditor() {
  const { id, prefill, close } = useEditor()
  const s = useFlux()
  const cats = alive(s.categories).sort((a, b) => a.ordre - b.ordre)
  const existing = s.depenses.find((d) => d.id === id)
  const me = s.currentUser
  const [d, setD] = useState<Omit<Depense, 'id' | 'createdAt' | 'createdBy'>>(() =>
    existing
      ? { ...existing }
      : {
          date: today(),
          fournisseur: '',
          libelle: '',
          categorieId: cats[0]?.id ?? '',
          montant: 0,
          mode: 'CB',
          payePar: 'pro',
          aRembourser: false,
          rembourseLe: '',
          projetId: '',
          recurrente: false,
          abonnementId: '',
          ...(stripScan(prefill) as Partial<Depense>),
        },
  )
  const scanned = prefill?.source as string | undefined
  const manquants = (prefill?.manquants as string[] | undefined) ?? []
  const [adv, setAdv] = useState(!!existing || !!scanned)
  const [err, setErr] = useState('')
  const set = (p: Partial<Depense>) => setD((x) => ({ ...x, ...p }))

  const fournisseurs = useMemo(() => [...new Set(alive(s.depenses).map((x) => x.fournisseur).filter(Boolean))].sort(), [s.depenses])
  const onFournisseur = (f: string) => {
    // Reprend la catégorie utilisée la dernière fois pour ce fournisseur.
    const last = [...s.depenses].reverse().find((x) => normalize(x.fournisseur) === normalize(f))
    set({ fournisseur: f, ...(last && !existing ? { categorieId: last.categorieId, mode: last.mode } : {}) })
  }

  const save = () => {
    if (d.montant <= 0) return setErr('Indique un montant.')
    if (!d.fournisseur.trim()) return setErr('Indique le fournisseur.')
    const data = { ...d, fournisseur: d.fournisseur.trim(), libelle: d.libelle.trim(), aRembourser: d.payePar !== 'pro' && d.aRembourser, rembourseLe: d.payePar === 'pro' ? '' : d.rembourseLe }
    if (existing) s.update('depenses', existing.id, data)
    else s.create('depenses', data)
    close()
    toast({
      title: existing ? 'Dépense modifiée' : 'Dépense enregistrée',
      text: !data.justificatif ? 'Pense à ajouter le justificatif.' : data.aRembourser ? `Note de frais : ${eur(data.montant)} à rembourser à ${data.payePar === 'jeremy' ? 'Jérémy' : 'Matheis'}.` : undefined,
      tone: 'success',
    })
  }

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Modifier la dépense' : scanned ? 'Vérifie le ticket' : 'Nouvelle dépense'}
      footer={
        <>
          <button className="btn-ghost" onClick={close}>Annuler</button>
          <button className="btn-primary min-w-[140px]" onClick={save}>{scanned ? 'Valider' : 'Enregistrer'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        {scanned && (
          <Notice tone={manquants.length ? 'warn' : 'info'}>
            {scanned === 'ia' ? 'Lu par l’IA.' : 'Lu dans le navigateur.'}{' '}
            {manquants.length ? `À compléter : ${manquants.join(', ')}.` : 'Vérifie les champs puis valide.'}
          </Notice>
        )}
        <MoneyInput big value={d.montant} onChange={(montant) => set({ montant })} autoFocus={!existing && !scanned} />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Fournisseur">
            <input className="input" list="flux-fournisseurs" placeholder="Ex. OVH, Total, Fnac…" value={d.fournisseur} onChange={(e) => onFournisseur(e.target.value)} />
            <datalist id="flux-fournisseurs">
              {fournisseurs.map((f) => <option key={f} value={f} />)}
            </datalist>
          </Field>
          <Field label="Date">
            <input type="date" className="input w-[150px]" value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        </div>
        <Field label="Catégorie">
          <Chips value={d.categorieId} onChange={(categorieId) => set({ categorieId })} options={cats.map((c) => ({ value: c.id, label: c.nom }))} />
        </Field>
        <Field label="Payé par">
          <Segmented
            value={d.payePar}
            onChange={(payePar: PayePar) => set({ payePar, aRembourser: payePar !== 'pro', mode: payePar === 'pro' ? d.mode : d.mode })}
            options={(['pro', me, me === 'jeremy' ? 'matheis' : 'jeremy'] as PayePar[]).map((p) => ({ value: p, label: PAYE_PAR_LABEL[p] }))}
          />
        </Field>
        {d.payePar !== 'pro' && (
          <div className="card-2 px-4 py-3 space-y-2">
            <Toggle checked={d.aRembourser} onChange={(aRembourser) => set({ aRembourser })} label="À rembourser par l’agence (note de frais)" />
            {d.aRembourser && existing && (
              <Field label="Remboursé le" hint="Vide tant que ce n’est pas remboursé.">
                <input type="date" className="input" value={d.rembourseLe} onChange={(e) => set({ rembourseLe: e.target.value })} />
              </Field>
            )}
          </div>
        )}
        <FileField value={d.justificatif} onChange={(justificatif) => set({ justificatif })} />

        <Advanced open={adv} onToggle={() => setAdv(!adv)} label="Libellé, projet, paiement">
          <Field label="Libellé">
            <input className="input" placeholder="Ex. Hébergement annuel client Martin" value={d.libelle} onChange={(e) => set({ libelle: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mode de paiement">
              <select className="input" value={d.mode} onChange={(e) => set({ mode: e.target.value as Depense['mode'] })}>
                {MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Projet lié" hint="Pour la rentabilité du projet.">
              <ProjetSelect value={d.projetId} onChange={(projetId) => set({ projetId })} />
            </Field>
          </div>
          <Toggle checked={d.recurrente} onChange={(recurrente) => set({ recurrente })} label="Dépense récurrente" />
          {d.recurrente && !d.abonnementId && (
            <p className="text-xs text-muted">Pour qu’elle se génère toute seule à chaque échéance, crée plutôt un abonnement.</p>
          )}
        </Advanced>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  )
}

// ── Scan d'un ticket ────────────────────────────────────────────────────────

function ScanEditor() {
  const { close, open } = useEditor()
  const categories = alive(useFlux((s) => s.categories))
  const [preview, setPreview] = useState('')
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)

  const run = async (file?: File) => {
    if (!file) return
    setError('')
    setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : '')
    setStep('Enregistrement du justificatif…')
    try {
      const [justificatif, result] = await Promise.all([saveFile(file), scanReceipt(file, categories, setStep)])
      const { source, manquants, ...fields } = result
      open('depense', { prefill: { ...fields, montant: round2(fields.montant), justificatif, source, manquants } })
    } catch (e) {
      setStep('')
      setError((e as Error).message || 'Lecture impossible. Réessaie avec une photo plus nette.')
    }
  }

  return (
    <Sheet open onClose={close} title="Scanner un ticket">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => run(e.target.files?.[0])} />
      <input ref={files} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => run(e.target.files?.[0])} />
      {step ? (
        <div className="flex flex-col items-center py-4">
          <div className="relative w-56 h-72 rounded-3xl overflow-hidden bg-card2 border border-line/70">
            {preview ? <img src={preview} alt="" className="w-full h-full object-cover opacity-80" /> : <FileText className="absolute inset-0 m-auto text-muted" size={42} />}
            <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-accent/40 to-transparent animate-[scan_1.6s_ease-in-out_infinite]" />
          </div>
          <p className="mt-5 text-sm font-medium flex items-center gap-2">
            <Loader2 size={15} className="animate-spin text-accent" /> {step}
          </p>
          <style>{`@keyframes scan{0%{top:-20%}50%{top:85%}100%{top:-20%}}`}</style>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Prends le ticket ou la facture en photo : FLUX lit le fournisseur, la date et le montant, propose une catégorie, et tu valides.</p>
          <button className="w-full card-2 p-6 flex flex-col items-center gap-3 hover:bg-line/60 transition-colors" onClick={() => camera.current?.click()}>
            <span className="w-14 h-14 rounded-2xl bg-accent text-ink grid place-content-center">
              <ScanLine size={26} />
            </span>
            <span className="font-semibold">Prendre une photo</span>
          </button>
          <button className="btn-ghost w-full" onClick={() => files.current?.click()}>
            <Paperclip size={15} /> Choisir une image ou un PDF
          </button>
          {error && <Notice tone="danger">{error}</Notice>}
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <Sparkles size={12} /> Avec la clé Anthropic, la lecture est faite par Claude ; sinon elle tourne dans le navigateur.
          </p>
        </div>
      )}
    </Sheet>
  )
}

// ── Client ──────────────────────────────────────────────────────────────────

function ClientEditor() {
  const { id, close } = useEditor()
  const s = useFlux()
  const existing = s.clients.find((c) => c.id === id)
  const [c, setC] = useState<Omit<Client, 'id' | 'createdAt' | 'createdBy'>>(
    () => existing ?? { nom: '', entreprise: '', activite: '', ville: 'Sète', email: '', telephone: '', notes: '' },
  )
  const [err, setErr] = useState('')
  const set = (p: Partial<Client>) => setC((x) => ({ ...x, ...p }))
  const save = () => {
    if (!c.nom.trim() && !c.entreprise.trim()) return setErr('Indique au moins un nom ou une entreprise.')
    if (existing) s.update('clients', existing.id, c)
    else s.create('clients', c)
    close()
    toast({ title: existing ? 'Fiche client mise à jour' : 'Client ajouté', tone: 'success' })
  }
  return (
    <Sheet open onClose={close} title={existing ? 'Modifier le client' : 'Nouveau client'} footer={<><button className="btn-ghost" onClick={close}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom du contact"><input className="input" autoFocus value={c.nom} onChange={(e) => set({ nom: e.target.value })} /></Field>
        <Field label="Entreprise"><input className="input" value={c.entreprise} onChange={(e) => set({ entreprise: e.target.value })} /></Field>
        <Field label="Activité"><input className="input" placeholder="Boulangerie, coiffeur…" value={c.activite} onChange={(e) => set({ activite: e.target.value })} /></Field>
        <Field label="Ville"><input className="input" value={c.ville} onChange={(e) => set({ ville: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" inputMode="email" value={c.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" type="tel" inputMode="tel" value={c.telephone} onChange={(e) => set({ telephone: e.target.value })} /></Field>
        <Field label="Notes" className="col-span-2"><textarea className="input" value={c.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
      {err && <p className="text-sm text-danger mt-3">{err}</p>}
    </Sheet>
  )
}

// ── Projet ──────────────────────────────────────────────────────────────────

function ProjetEditor() {
  const { id, prefill, close } = useEditor()
  const s = useFlux()
  const existing = s.projets.find((p) => p.id === id)
  const [p, setP] = useState<Omit<Projet, 'id' | 'createdAt' | 'createdBy'>>(
    () =>
      existing ?? {
        nom: '',
        clientId: '',
        type: 'Site vitrine',
        montantPrevu: 0,
        statut: 'En cours',
        dateDebut: today(),
        dateLivraison: '',
        partJeremy: s.settings.partDefautJeremy,
        ...(prefill as Partial<Projet>),
      },
  )
  const [err, setErr] = useState('')
  const set = (x: Partial<Projet>) => setP((cur) => ({ ...cur, ...x }))
  const save = () => {
    if (!p.nom.trim()) return setErr('Donne un nom au projet.')
    if (!p.clientId) return setErr('Choisis le client.')
    if (existing) s.update('projets', existing.id, p)
    else s.create('projets', p)
    close()
    toast({ title: existing ? 'Projet mis à jour' : 'Projet créé', tone: 'success' })
  }
  return (
    <Sheet open onClose={close} title={existing ? 'Modifier le projet' : 'Nouveau projet'} footer={<><button className="btn-ghost" onClick={close}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="space-y-3.5">
        <Field label="Nom du projet"><input className="input" autoFocus value={p.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Ex. Site de la Boulangerie Martin" /></Field>
        <Field label="Client"><ClientPicker value={p.clientId} onChange={(clientId) => set({ clientId })} /></Field>
        <Field label="Type de prestation">
          <Chips value={p.type} onChange={(type) => set({ type })} options={PROJET_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant total prévu"><MoneyInput value={p.montantPrevu} onChange={(montantPrevu) => set({ montantPrevu })} /></Field>
          <Field label="Statut">
            <select className="input" value={p.statut} onChange={(e) => set({ statut: e.target.value as Projet['statut'] })}>
              {PROJET_STATUTS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Début"><input type="date" className="input" value={p.dateDebut} onChange={(e) => set({ dateDebut: e.target.value })} /></Field>
          <Field label="Livraison"><input type="date" className="input" value={p.dateLivraison} onChange={(e) => set({ dateLivraison: e.target.value })} /></Field>
        </div>
        <SplitField value={p.partJeremy} onChange={(partJeremy) => set({ partJeremy })} />
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  )
}

/** Répartition entre associés : un curseur, total toujours égal à 100 %. */
export function SplitField({ value, onChange, label = 'Répartition entre associés' }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <Field label={label}>
      <div className="card-2 px-4 py-3">
        <div className="flex justify-between text-sm font-semibold mb-2 tnum">
          <span>Jérémy {value} %</span>
          <span className="text-muted">Matheis {100 - value} %</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[rgb(var(--accent))]"
          aria-label="Part de Jérémy"
        />
        <div className="flex gap-1.5 mt-2">
          {[100, 70, 50, 30, 0].map((v) => (
            <button type="button" key={v} onClick={() => onChange(v)} className={cx('chip !py-1 !px-2.5 tnum', value === v && 'chip-on')}>
              {v}/{100 - v}
            </button>
          ))}
        </div>
      </div>
    </Field>
  )
}

// ── Abonnement ──────────────────────────────────────────────────────────────

function AbonnementEditor() {
  const { id, close } = useEditor()
  const s = useFlux()
  const cats = alive(s.categories).sort((a, b) => a.ordre - b.ordre)
  const existing = s.abonnements.find((a) => a.id === id)
  const [a, setA] = useState<Omit<Abonnement, 'id' | 'createdAt' | 'createdBy'>>(
    () =>
      existing ?? {
        nom: '',
        fournisseur: '',
        montant: 0,
        frequence: 'mensuel',
        prochainPrelevement: today(),
        actif: true,
        utilise: true,
        categorieId: cats[0]?.id ?? '',
        payePar: 'pro',
        notes: '',
      },
  )
  const [err, setErr] = useState('')
  const set = (x: Partial<Abonnement>) => setA((cur) => ({ ...cur, ...x }))
  const save = () => {
    if (!a.nom.trim()) return setErr('Donne un nom à l’abonnement.')
    const data = { ...a, fournisseur: a.fournisseur.trim() || a.nom.trim() }
    if (existing) s.update('abonnements', existing.id, data)
    else s.create('abonnements', data)
    close()
    toast({ title: existing ? 'Abonnement mis à jour' : 'Abonnement ajouté', text: a.montant ? undefined : 'Montant à compléter.', tone: 'success' })
  }
  return (
    <Sheet open onClose={close} title={existing ? 'Modifier l’abonnement' : 'Nouvel abonnement'} footer={<><button className="btn-ghost" onClick={close}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom"><input className="input" autoFocus value={a.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="Figma, Claude, OVH…" /></Field>
          <Field label="Montant"><MoneyInput value={a.montant} onChange={(montant) => set({ montant })} /></Field>
          <Field label="Fréquence">
            <Segmented value={a.frequence} onChange={(frequence) => set({ frequence })} options={[{ value: 'mensuel', label: 'Mensuel' }, { value: 'annuel', label: 'Annuel' }]} />
          </Field>
          <Field label="Prochain prélèvement"><input type="date" className="input" value={a.prochainPrelevement} onChange={(e) => set({ prochainPrelevement: e.target.value })} /></Field>
        </div>
        <Field label="Catégorie">
          <select className="input" value={a.categorieId} onChange={(e) => set({ categorieId: e.target.value })}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </Field>
        <Field label="Payé par">
          <Segmented value={a.payePar} onChange={(payePar) => set({ payePar })} options={(['pro', 'jeremy', 'matheis'] as PayePar[]).map((p) => ({ value: p, label: PAYE_PAR_LABEL[p] }))} />
        </Field>
        <div className="card-2 px-4 py-3 space-y-3">
          <Toggle checked={a.actif} onChange={(actif) => set({ actif })} label="Actif (génère une dépense à chaque échéance)" />
          <Toggle checked={a.utilise} onChange={(utilise) => set({ utilise })} label="Réellement utilisé" />
        </div>
        <Field label="Notes"><textarea className="input" value={a.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex. partagé avec Matheis" /></Field>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  )
}

// ── Archivage (jamais de suppression définitive) ────────────────────────────

const MOTIFS = ['Erreur de saisie', 'Doublon', 'Facture annulée', 'Client ou projet abandonné', 'Autre']

function ArchiveEditor() {
  const { id, coll, close } = useEditor()
  const s = useFlux()
  const isAdmin = useIsAdmin()
  const [motif, setMotif] = useState('')
  const [detail, setDetail] = useState('')
  if (!coll || !id) return null
  if (coll === 'categories' && !isAdmin) return null
  const full = motif === 'Autre' ? detail.trim() : [motif, detail.trim()].filter(Boolean).join(' — ')
  const go = () => {
    if (!full) return
    s.archive(coll, id, full)
    close()
    toast({ title: 'Archivé', text: 'L’élément reste consultable dans le journal.', tone: 'success' })
  }
  return (
    <Sheet
      open
      onClose={close}
      title="Archiver"
      footer={<><button className="btn-ghost" onClick={close}>Annuler</button><button className="btn-danger" disabled={!full} onClick={go}>Archiver</button></>}
    >
      <p className="text-sm text-muted mb-4">
        Rien n’est supprimé définitivement : l’élément sort des listes et des calculs, mais reste dans le journal d’historique avec le motif, la date et ton nom.
        {isAdmin ? ' Tu pourras le restaurer.' : ' Jérémy pourra le restaurer.'}
      </p>
      <Field label="Motif">
        <Chips value={motif} onChange={setMotif} options={MOTIFS.map((m) => ({ value: m, label: m }))} />
      </Field>
      <Field label={motif === 'Autre' ? 'Précise le motif' : 'Précision (facultatif)'} className="mt-3">
        <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
    </Sheet>
  )
}
