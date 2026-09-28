import { ReactNode, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, Bell, BookOpen, Bot, Building2, CalendarClock, ChevronDown, CloudOff, FileDown, FolderKanban, Home, Landmark, Layers,
  LogOut, Moon, Plus, Receipt, RefreshCw, Repeat, ScanLine, Search, Settings, Star, Sun, Users, Wallet, X,
} from 'lucide-react'
import { useFlux, useIsAdmin } from '../store'
import { ENTITY_LABEL, USERS, UserId } from '../types'
import { cx, eur } from '../lib/format'
import { ago } from '../lib/dates'
import { getSyncError, getSyncStatus, onSyncStatus, SyncStatus } from '../lib/sync'
import { isCloud, supabase } from '../lib/supabase'
import { totalDu } from '../lib/finance'
import { Alert, AlertTone, useAlerts } from '../lib/alerts'
import { confirmerPrelevement } from '../lib/actions'
import { Editors, openEditor } from './editors'
import { RelanceSheet, openRelance } from './Relance'
import { Palette, openPalette } from './Palette'
import { Avatar, Sheet, Toaster } from './ui'
import { useWeeklyReport } from '../lib/weekly'
import { useStreakTracker } from '../lib/streak'

// ─────────────────────────────────────────────────────────────────────────────
// Structure de l'app, fidèle à la maquette de référence :
// barre latérale à gauche, contenu au centre, panneau Notifications / Activités /
// Associés à droite sur grand écran. Sur mobile : dock flottant en bas.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: typeof Home
  admin?: boolean
}
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Tableau de bord',
    items: [
      { to: '/', label: 'Vue d’ensemble', icon: Home },
      { to: '/recettes', label: 'Recettes', icon: ArrowDownLeft },
      { to: '/depenses', label: 'Dépenses', icon: ArrowUpRight },
      { to: '/projets', label: 'Projets', icon: FolderKanban },
      { to: '/clients', label: 'Clients', icon: Building2 },
      { to: '/abonnements', label: 'Abonnements', icon: Repeat },
    ],
  },
  {
    title: 'Obligations',
    items: [
      { to: '/urssaf', label: 'URSSAF', icon: Landmark },
      { to: '/associes', label: 'Associés', icon: Users },
      { to: '/exports', label: 'Exports & rapports', icon: FileDown },
      { to: '/assistant', label: 'Assistant IA', icon: Bot },
    ],
  },
  {
    title: 'Réglages',
    items: [
      { to: '/journal', label: 'Journal', icon: BookOpen },
      { to: '/reglages', label: 'Réglages', icon: Settings, admin: true },
    ],
  },
]
const ALL = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))
const pageOf = (path: string) => ALL.find((i) => (i.to === '/' ? path === '/' : path.startsWith(i.to))) ?? ALL[0]!

function useSync() {
  const [s, setS] = useState<SyncStatus>(getSyncStatus())
  useEffect(() => onSyncStatus(setS), [])
  return s
}

// ── Barre latérale ──────────────────────────────────────────────────────────

function Profile() {
  const me = useFlux((s) => s.currentUser)
  const setUser = useFlux((s) => s.setUser)
  const [open, setOpen] = useState(false)
  const u = USERS[me]
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-2 py-1.5 rounded-2xl hover:bg-card2 transition-colors text-left">
        <Avatar name={u.nom} size={34} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{u.nom}</span>
          <span className="block text-[11px] text-muted">{u.role === 'admin' ? 'Administrateur' : 'Associé'}</span>
        </span>
        <ChevronDown size={15} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 card !bg-panel shadow-lift p-1.5 animate-fadeIn">
          {!isCloud &&
            (Object.keys(USERS) as UserId[]).map((id) => (
              <button
                key={id}
                onClick={() => {
                  setUser(id)
                  setOpen(false)
                }}
                className={cx('w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm hover:bg-card2', id === me && 'bg-card2')}
              >
                <Avatar name={USERS[id].nom} size={24} tone={id === me ? 'accent' : 'muted'} />
                {USERS[id].prenom}
                <span className="ml-auto text-[11px] text-muted">{USERS[id].role === 'admin' ? 'Admin' : 'Associé'}</span>
              </button>
            ))}
          {!isCloud && <p className="px-3 pt-1 pb-2 text-[11px] text-muted">Mode local : change d’utilisateur pour tester les droits.</p>}
          {isCloud && (
            <button onClick={() => void supabase?.auth.signOut()} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm hover:bg-card2">
              <LogOut size={15} /> Se déconnecter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SyncPill({ compact }: { compact?: boolean }) {
  const s = useSync()
  const label = { local: 'Local', connecting: 'Connexion…', live: 'En ligne', error: 'Hors ligne' }[s]
  return (
    <span
      title={s === 'error' ? getSyncError() ?? '' : s === 'local' ? 'Données enregistrées dans ce navigateur uniquement' : 'Synchronisé en temps réel'}
      className={cx('inline-flex items-center gap-1.5 text-[11px] font-semibold', s === 'live' ? 'text-accent' : s === 'error' ? 'text-danger' : 'text-muted')}
    >
      {s === 'error' || s === 'local' ? <CloudOff size={13} /> : <span className={cx('w-2 h-2 rounded-pill bg-current', s === 'connecting' && 'animate-pulse')} />}
      {!compact && label}
    </span>
  )
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="26" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" opacity=".35" />
        <path d="M8 36c6-5 11-5 16 0s10 5 15 0 11-5 17 0v2a24 24 0 0 1-48 0z" fill="rgb(var(--accent))" />
      </svg>
      <span className="font-bold tracking-[0.18em] text-sm">
        FLU<span className="text-accent">X</span>
      </span>
    </Link>
  )
}

function Sidebar() {
  const isAdmin = useIsAdmin()
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] flex-col bg-panel border-r border-line/60 px-4 py-5 z-30">
      <Profile />
      <button onClick={openPalette} className="mt-4 flex items-center gap-2.5 w-full rounded-pill bg-card2 px-3.5 py-2 text-sm text-muted hover:text-txt transition-colors">
        <Search size={15} />
        <span className="flex-1 text-left">Rechercher…</span>
        <kbd className="text-[10px] font-semibold rounded-md bg-bg/60 px-1.5 py-0.5">⌘K</kbd>
      </button>
      <nav className="mt-5 flex-1 overflow-y-auto -mx-1 px-1">
        {NAV.map((g) => (
          <div key={g.title} className="mb-5">
            <p className="label px-3 mb-2">{g.title}</p>
            {g.items
              .filter((i) => !i.admin || isAdmin)
              .map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium mb-0.5 transition-colors',
                      isActive ? 'bg-accent text-ink font-semibold' : 'text-muted hover:text-txt hover:bg-card2',
                    )
                  }
                >
                  <i.icon size={17} strokeWidth={2} />
                  {i.label}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between px-2 pt-3 border-t border-line/60">
        <Logo />
        <SyncPill />
      </div>
    </aside>
  )
}

// ── Panneau de droite ───────────────────────────────────────────────────────

const toneCls: Record<AlertTone, string> = {
  danger: 'bg-danger/15 text-danger',
  warn: 'bg-warn/15 text-warn',
  accent: 'bg-accent text-ink',
  info: 'bg-card2 text-txt',
}
const kindIcon = { retard: Receipt, prelevement: CalendarClock, urssaf: Landmark, justificatifs: ScanLine, seuil: Wallet, reglages: Settings, rapport: FileDown, note: Users, abonnement: Repeat }

function AlertRow({ a, onNavigate }: { a: Alert; onNavigate?: () => void }) {
  const nav = useNavigate()
  const abonnements = useFlux((s) => s.abonnements)
  const Icon = kindIcon[a.kind]
  const action =
    a.kind === 'retard' && a.ref ? (
      <button className="text-[11px] font-semibold text-accent hover:underline" onClick={() => openRelance(a.ref!)}>Relancer</button>
    ) : a.kind === 'prelevement' && a.ref ? (
      <button
        className="text-[11px] font-semibold text-accent hover:underline"
        onClick={() => {
          const abo = abonnements.find((x) => x.id === a.ref)
          if (abo) confirmerPrelevement(abo)
        }}
      >
        Confirmer
      </button>
    ) : null
  return (
    <div className="flex items-start gap-3 group">
      <span className={cx('w-7 h-7 rounded-pill grid place-content-center shrink-0 mt-0.5', toneCls[a.tone])}>
        <Icon size={14} />
      </span>
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => {
          onNavigate?.()
          nav(a.to)
        }}
      >
        <span className="block text-[13px] font-medium leading-snug group-hover:text-accent transition-colors">{a.title}</span>
        <span className="block text-[11px] text-muted mt-0.5 leading-snug">{a.text}</span>
      </button>
      {action}
    </div>
  )
}

function Activities({ limit = 5 }: { limit?: number }) {
  const journal = useFlux((s) => s.journal)
  const list = journal.slice(0, limit)
  if (!list.length) return <p className="text-xs text-muted">Chaque saisie apparaîtra ici, avec son auteur.</p>
  return (
    <div>
      {list.map((j, i) => (
        <div key={j.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Avatar name={USERS[j.by]?.nom ?? '?'} size={24} tone={j.by === 'jeremy' ? 'accent' : 'muted'} />
            {i < list.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
          </div>
          <div className="pb-4 min-w-0">
            <p className="text-[12.5px] leading-snug">
              <span className="font-semibold">{USERS[j.by]?.prenom}</span> <span className="text-muted">{verb(j.action)}</span> {ENTITY_LABEL[j.entity].toLowerCase()}
            </p>
            <p className="text-[12px] truncate">{j.label}</p>
            <p className="text-[11px] text-muted">{ago(j.at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
const verb = (a: string) =>
  ({ création: 'a ajouté', modification: 'a modifié', archivage: 'a archivé', restauration: 'a restauré', réglages: 'a modifié les', relance: 'a relancé', déclaration: 'a mis à jour' })[a] ?? a

function Partners() {
  const depenses = useFlux((s) => s.depenses)
  const me = useFlux((s) => s.currentUser)
  const nav = useNavigate()
  return (
    <div className="space-y-2">
      {(Object.keys(USERS) as UserId[]).map((id) => {
        const du = totalDu(depenses, id)
        const on = id === me
        return (
          <button
            key={id}
            onClick={() => nav('/associes')}
            className={cx('w-full flex items-center gap-3 rounded-pill pl-1.5 pr-3 py-1.5 text-left transition-colors', on ? 'bg-accent text-ink shadow-glow' : 'hover:bg-card2')}
          >
            <Avatar name={USERS[id].nom} size={30} tone={on ? 'muted' : 'accent'} />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold truncate">{USERS[id].nom}</span>
              <span className={cx('block text-[11px]', on ? 'text-ink/70' : 'text-muted')}>{du > 0 ? `${eur(du)} à rembourser` : USERS[id].role === 'admin' ? 'Administrateur' : 'Associé'}</span>
            </span>
            <Users size={15} className={on ? 'text-ink' : 'text-muted'} />
          </button>
        )
      })}
    </div>
  )
}

function RightPanel() {
  const alerts = useAlerts()
  return (
    <aside className="hidden xl:flex fixed inset-y-0 right-0 w-[300px] flex-col bg-panel border-l border-line/60 px-5 py-6 z-20 overflow-y-auto">
      <PanelSection title="Notifications" count={alerts.length}>
        {alerts.length ? (
          <div className="space-y-3.5">
            {alerts.slice(0, 6).map((a) => <AlertRow key={a.id} a={a} />)}
            {alerts.length > 6 && <p className="text-[11px] text-muted">+ {alerts.length - 6} autres dans la cloche</p>}
          </div>
        ) : (
          <p className="text-xs text-muted">Rien à signaler. Tout est à jour ✨</p>
        )}
      </PanelSection>
      <PanelSection title="Activités">
        <Activities />
      </PanelSection>
      <PanelSection title="Associés" last>
        <Partners />
      </PanelSection>
    </aside>
  )
}

function PanelSection({ title, children, count, last }: { title: string; children: ReactNode; count?: number; last?: boolean }) {
  return (
    <section className={cx('pb-5 mb-5', !last && 'border-b border-line/60')}>
      <h3 className="text-[17px] font-semibold tracking-tight mb-4 flex items-center gap-2">
        {title}
        {!!count && <span className="pill bg-card2 text-muted">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Sur écran moyen et mobile, la cloche ouvre les notifications et activités dans une feuille. */
function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alerts = useAlerts()
  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      {alerts.length ? (
        <div className="space-y-4">{alerts.map((a) => <AlertRow key={a.id} a={a} onNavigate={onClose} />)}</div>
      ) : (
        <p className="text-sm text-muted">Rien à signaler. Tout est à jour ✨</p>
      )}
      <h3 className="font-semibold mt-7 mb-3">Activités</h3>
      <Activities limit={8} />
      <h3 className="font-semibold mt-3 mb-3">Associés</h3>
      <Partners />
    </Sheet>
  )
}

// ── Barre du haut ───────────────────────────────────────────────────────────

function TopBar({ onBell }: { onBell: () => void }) {
  const loc = useLocation()
  const page = pageOf(loc.pathname)
  const theme = useFlux((s) => s.theme)
  const setTheme = useFlux((s) => s.setTheme)
  const alerts = useAlerts()
  const urgent = alerts.filter((a) => a.tone === 'danger' || a.tone === 'warn').length
  const me = USERS[useFlux((s) => s.currentUser)]
  return (
    <header className="sticky top-0 z-20 bg-bg/80 backdrop-blur-xl border-b border-line/50">
      <div className="flex items-center gap-2 h-14 md:h-16 px-4 md:px-8">
        <div className="lg:hidden flex items-center gap-3">
          <Logo />
        </div>
        <div className="hidden lg:flex items-center gap-3 text-sm">
          <Layers size={18} className="text-muted" />
          <Star size={18} className="text-muted" />
          <span className="text-muted ml-2">{page.group}</span>
          <span className="text-muted">/</span>
          <span className="font-medium">{page.label}</span>
        </div>
        <div className="flex-1" />
        <button className="btn-icon lg:hidden" onClick={openPalette} aria-label="Rechercher">
          <Search size={18} />
        </button>
        <button className="btn-icon" onClick={() => setTheme(theme === 'nuit' ? 'jour' : 'nuit')} aria-label="Changer de thème" title={theme === 'nuit' ? 'Thème jour (charte MJAGENCY)' : 'Thème nuit'}>
          {theme === 'nuit' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="btn-icon hidden md:inline-flex" onClick={() => window.location.reload()} aria-label="Actualiser" title="Actualiser">
          <RefreshCw size={17} />
        </button>
        <button className="btn-icon relative xl:hidden" onClick={onBell} aria-label="Notifications">
          <Bell size={18} />
          {urgent > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-pill bg-danger text-white text-[10px] font-bold grid place-content-center">{urgent}</span>}
        </button>
        <span className="hidden xl:inline-flex btn-icon relative" title={`${alerts.length} notifications`}>
          <Bell size={18} />
          {urgent > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-pill bg-danger" />}
        </span>
        <span className="md:hidden ml-1">
          <SyncPill compact />
        </span>
        <span className="lg:hidden ml-1">
          <Avatar name={me.nom} size={30} />
        </span>
      </div>
    </header>
  )
}

// ── Bouton « + » et dock ────────────────────────────────────────────────────

function FabMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  const items = [
    { label: 'Nouvelle recette', icon: ArrowDownLeft, run: () => openEditor('recette'), tone: 'bg-accent text-ink' },
    { label: 'Nouvelle dépense', icon: ArrowUpRight, run: () => openEditor('depense'), tone: 'bg-card2 text-txt' },
    { label: 'Scanner un ticket', icon: ScanLine, run: () => openEditor('scan'), tone: 'bg-card2 text-txt' },
  ]
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <div className="fixed z-50 right-4 lg:right-8 xl:right-[332px] bottom-[104px] lg:bottom-[100px] flex flex-col items-end gap-2.5">
        {items.map((i, k) => (
          <button
            key={i.label}
            style={{ animationDelay: `${(items.length - k) * 40}ms` }}
            onClick={() => {
              onClose()
              i.run()
            }}
            className="flex items-center gap-3 animate-sheetUp"
          >
            <span className="card !bg-panel shadow-lift px-4 py-2 text-sm font-semibold">{i.label}</span>
            <span className={cx('w-12 h-12 rounded-pill grid place-content-center shadow-lift', i.tone)}>
              <i.icon size={20} />
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function Dock({ onPlus, plusOpen }: { onPlus: () => void; plusOpen: boolean }) {
  const [more, setMore] = useState(false)
  const isAdmin = useIsAdmin()
  const loc = useLocation()
  const main = [
    { to: '/', label: 'Accueil', icon: Home },
    { to: '/recettes', label: 'Recettes', icon: ArrowDownLeft },
    null,
    { to: '/depenses', label: 'Dépenses', icon: ArrowUpRight },
  ]
  const inMain = ['/', '/recettes', '/depenses'].some((p) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)))
  return (
    <>
      <nav className="lg:hidden fixed z-40 bottom-3 inset-x-3 safe-bottom">
        <div className="dock mx-auto max-w-md rounded-[26px] border border-line/60 shadow-lift flex items-center justify-around px-2 h-[68px]">
          {main.map((i) =>
            i ? (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) => cx('flex flex-col items-center gap-1 w-16 py-1 rounded-2xl text-[10.5px] font-semibold transition-colors', isActive ? 'text-accent' : 'text-muted')}
              >
                <i.icon size={21} />
                {i.label}
              </NavLink>
            ) : (
              <button
                key="plus"
                onClick={onPlus}
                aria-label="Ajouter"
                className={cx('w-14 h-14 -mt-7 rounded-pill bg-accent text-ink grid place-content-center shadow-glow transition-transform active:scale-95', plusOpen && 'rotate-45')}
              >
                <Plus size={26} strokeWidth={2.5} />
              </button>
            ),
          )}
          <button onClick={() => setMore(true)} className={cx('flex flex-col items-center gap-1 w-16 py-1 text-[10.5px] font-semibold', !inMain ? 'text-accent' : 'text-muted')}>
            <Layers size={21} />
            Plus
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2.5">
          {ALL.filter((i) => !['/', '/recettes', '/depenses'].includes(i.to) && (!i.admin || isAdmin)).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              onClick={() => setMore(false)}
              className={({ isActive }) => cx('card-2 flex flex-col items-center gap-2 py-4 px-2 text-center text-xs font-semibold', isActive && '!bg-accent text-ink')}
            >
              <i.icon size={21} />
              {i.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <Profile />
        </div>
      </Sheet>
    </>
  )
}

// ── Assemblage ──────────────────────────────────────────────────────────────

export function Layout() {
  const [bell, setBell] = useState(false)
  const [plus, setPlus] = useState(false)
  const loc = useLocation()
  useWeeklyReport()
  useStreakTracker()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  // Raccourcis clavier : ⌘K recherche, R recette, D dépense.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  return (
    <div className="min-h-screen page-glow">
      <Sidebar />
      <RightPanel />
      <div className="lg:ml-[248px] xl:mr-[300px] min-h-screen flex flex-col">
        <TopBar onBell={() => setBell(true)} />
        <main key={loc.pathname} className="flex-1 w-full max-w-[1180px] mx-auto px-4 md:px-8 pt-5 md:pt-7 pb-32 lg:pb-16">
          <Suspense fallback={<div className="h-40" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Bouton « + » flottant sur grand écran ; sur mobile il est au centre du dock. */}
      <button
        onClick={() => setPlus(!plus)}
        aria-label="Ajouter"
        className={cx(
          'hidden lg:grid fixed z-50 bottom-8 right-8 xl:right-[332px] w-14 h-14 rounded-pill bg-accent text-ink place-content-center shadow-glow transition-transform hover:scale-105 active:scale-95',
          plus && 'rotate-45',
        )}
      >
        {plus ? <X size={24} className="-rotate-45" /> : <Plus size={26} strokeWidth={2.5} />}
      </button>
      <FabMenu open={plus} onClose={() => setPlus(false)} />
      <Dock onPlus={() => setPlus(!plus)} plusOpen={plus} />

      <NotificationsSheet open={bell} onClose={() => setBell(false)} />
      <Editors />
      <RelanceSheet />
      <Palette />
      <Toaster />
    </div>
  )
}
