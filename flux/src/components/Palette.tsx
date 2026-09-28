import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import { ArrowDownLeft, ArrowUpRight, Building2, CornerDownLeft, FolderKanban, Navigation, ScanLine, Search } from 'lucide-react'
import { alive, useFlux } from '../store'
import { clientName } from '../lib/finance'
import { cx, eur, normalize } from '../lib/format'
import { fdate } from '../lib/dates'
import { openEditor } from './editors'

const usePalette = create<{ open: boolean; set: (v: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }))
export const openPalette = () => usePalette.getState().set(true)

const PAGES = [
  ['/', 'Vue d’ensemble'], ['/recettes', 'Recettes'], ['/depenses', 'Dépenses'], ['/depenses?onglet=notes', 'Notes de frais'], ['/projets', 'Projets'],
  ['/clients', 'Clients'], ['/abonnements', 'Abonnements'], ['/urssaf', 'URSSAF & obligations'], ['/associes', 'Répartition associés'],
  ['/exports', 'Exports & rapports'], ['/assistant', 'Assistant IA'], ['/journal', 'Journal d’historique'], ['/reglages', 'Réglages'],
] as const

interface Hit {
  id: string
  group: string
  label: string
  sub?: string
  icon: typeof Search
  run: () => void
}

/** Recherche globale (⌘K) : pages, actions, clients, projets, factures, dépenses. */
export function Palette() {
  const open = usePalette((s) => s.open)
  const set = usePalette((s) => s.set)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()
  const s = useFlux()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => input.current?.focus(), 10)
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const n = normalize(q)
    const close = () => set(false)
    const go = (to: string) => () => {
      close()
      nav(to)
    }
    const match = (...xs: (string | undefined)[]) => !n || normalize(xs.filter(Boolean).join(' ')).includes(n)
    const out: Hit[] = []
    const actions: Hit[] = [
      { id: 'a-r', group: 'Actions', label: 'Nouvelle recette', icon: ArrowDownLeft, run: () => (close(), openEditor('recette')) },
      { id: 'a-d', group: 'Actions', label: 'Nouvelle dépense', icon: ArrowUpRight, run: () => (close(), openEditor('depense')) },
      { id: 'a-s', group: 'Actions', label: 'Scanner un ticket', icon: ScanLine, run: () => (close(), openEditor('scan')) },
      { id: 'a-c', group: 'Actions', label: 'Nouveau client', icon: Building2, run: () => (close(), openEditor('client')) },
      { id: 'a-p', group: 'Actions', label: 'Nouveau projet', icon: FolderKanban, run: () => (close(), openEditor('projet')) },
    ]
    out.push(...actions.filter((a) => match(a.label)))
    out.push(...PAGES.filter(([, l]) => match(l)).map(([to, l]) => ({ id: 'p' + to, group: 'Pages', label: l, icon: Navigation, run: go(to) })))
    if (n) {
      for (const c of alive(s.clients).filter((c) => match(c.nom, c.entreprise, c.ville, c.email)).slice(0, 5))
        out.push({ id: c.id, group: 'Clients', label: clientName(c), sub: c.ville, icon: Building2, run: go(`/clients?id=${c.id}`) })
      for (const p of alive(s.projets).filter((p) => match(p.nom, p.type)).slice(0, 5))
        out.push({ id: p.id, group: 'Projets', label: p.nom, sub: p.type, icon: FolderKanban, run: go(`/projets/${p.id}`) })
      for (const r of alive(s.recettes).filter((r) => match(r.numeroFacture, r.libelle, clientName(s.clients.find((c) => c.id === r.clientId)))).slice(0, 5))
        out.push({ id: r.id, group: 'Recettes', label: `${r.numeroFacture || r.libelle}`, sub: `${eur(r.montant)} · ${fdate(r.dateEncaissement || r.dateFacture)}`, icon: ArrowDownLeft, run: () => (close(), openEditor('recette', { id: r.id })) })
      for (const d of alive(s.depenses).filter((d) => match(d.fournisseur, d.libelle)).slice(0, 5))
        out.push({ id: d.id, group: 'Dépenses', label: d.fournisseur, sub: `${eur(d.montant)} · ${fdate(d.date)}`, icon: ArrowUpRight, run: () => (close(), openEditor('depense', { id: d.id })) })
    }
    return out
  }, [q, s.clients, s.projets, s.recettes, s.depenses, nav, set])

  if (!open) return null
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') hits[idx]?.run()
    else if (e.key === 'Escape') set(false)
  }
  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-3" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fadeIn" onClick={() => set(false)} />
      <div className="relative w-full max-w-xl card !bg-panel shadow-lift animate-sheetUp overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-line/60">
          <Search size={18} className="text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            placeholder="Client, facture, fournisseur, page…"
            className="flex-1 bg-transparent outline-none py-4 text-[15px] placeholder:text-muted"
          />
          <kbd className="text-[10px] font-semibold rounded-md bg-card2 px-1.5 py-0.5 text-muted">Échap</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {hits.length === 0 && <p className="text-sm text-muted px-3 py-6 text-center">Aucun résultat pour « {q} ».</p>}
          {hits.map((h, i) => {
            const head = h.group !== lastGroup ? h.group : ''
            lastGroup = h.group
            return (
              <div key={h.id}>
                {head && <p className="label px-3 pt-3 pb-1.5">{head}</p>}
                <button
                  onMouseEnter={() => setIdx(i)}
                  onClick={h.run}
                  className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', i === idx && 'bg-card2')}
                >
                  <h.icon size={16} className="text-muted shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{h.label}</span>
                    {h.sub && <span className="block text-xs text-muted truncate">{h.sub}</span>}
                  </span>
                  {i === idx && <CornerDownLeft size={14} className="text-muted" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
