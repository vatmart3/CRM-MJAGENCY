import { Bell, BookOpen, Briefcase, CalendarDays, Compass, FileText, Handshake, Instagram, KanbanSquare, LayoutDashboard, LineChart, LogOut, MessagesSquare, Plus, Search, Settings, Users, BellRing, X } from 'lucide-react'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Period, useStore } from '../store'
import { isCloud, supabase } from '../lib/supabase'
import { getSyncStatus, onSyncStatus, SyncStatus } from '../lib/sync'
import { notifications, searchAll } from '../lib/selectors'
import { todayLabel } from '../lib/dates'
import { Avatar, cx, Segmented } from './ui'
import { QuickCreate } from './QuickCreate'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/pipeline', icon: KanbanSquare, label: 'Pipeline' },
  { to: '/relances', icon: BellRing, label: 'Relances' },
  { to: '/clients', icon: Briefcase, label: 'Clients & projets' },
  { to: '/devis', icon: FileText, label: 'Devis & facturation' },
  { to: '/apporteurs', icon: Handshake, label: 'Apporteurs d’affaires' },
  { to: '/planning', icon: CalendarDays, label: 'Planning du mois' },
  { to: '/instagram', icon: Instagram, label: 'Instagram' },
  { to: '/kpi', icon: LineChart, label: 'KPI hebdomadaires' },
  { to: '/playbook', icon: BookOpen, label: 'Playbook' },
  { to: '/strategie', icon: Compass, label: 'Stratégie' },
  { to: '/point-hebdo', icon: MessagesSquare, label: 'Point hebdo' },
]

function Sidebar() {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] bg-card border-r border-line flex-col items-center py-5 z-40">
      <NavLink to="/" className="w-10 h-10 rounded-2xl bg-brand grid place-content-center text-white font-extrabold text-sm mb-6 shadow-[0_0_24px_rgba(0,113,227,0.35)]">MJ</NavLink>
      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('group relative w-11 h-11 rounded-2xl grid place-content-center', isActive ? 'text-white bg-white/[0.06]' : 'text-muted hover:text-txt hover:bg-white/[0.04]')}>
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={1.8} />
                {isActive && <span className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1 h-5 rounded-pill bg-brand" />}
                <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-card2 border border-line px-3 py-1.5 text-xs text-txt opacity-0 group-hover:opacity-100 shadow-xl z-50">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/reglages" className={({ isActive }) => cx('w-11 h-11 rounded-2xl grid place-content-center mb-1', isActive ? 'text-white bg-white/[0.06]' : 'text-muted hover:text-txt')} title="Réglages"><Settings size={20} strokeWidth={1.8} /></NavLink>
      <button
        title={isCloud ? 'Déconnexion' : 'Session locale : vos données restent sur cet appareil'}
        onClick={() => {
          if (isCloud) void supabase?.auth.signOut()
          else alert('Session locale : rien à déconnecter. Vos données restent sur cet appareil.')
        }}
        className="w-11 h-11 rounded-2xl grid place-content-center text-muted hover:text-danger"
      ><LogOut size={20} strokeWidth={1.8} /></button>
    </aside>
  )
}

function MobileBar() {
  const main = NAV.slice(0, 5)
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-line flex items-center justify-around z-40 px-2">
      {main.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => cx('w-11 h-11 rounded-2xl grid place-content-center relative', isActive ? 'text-white' : 'text-muted')}>
          {({ isActive }) => (<><Icon size={21} strokeWidth={1.8} />{isActive && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-pill bg-brand" />}</>)}
        </NavLink>
      ))}
      <MobileMore />
    </nav>
  )
}
function MobileMore() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-11 h-11 rounded-2xl grid place-content-center text-muted"><Users size={21} strokeWidth={1.8} /></button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70" onClick={() => setOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-line rounded-t-card p-4 grid grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
            {[...NAV.slice(5), { to: '/reglages', icon: Settings, label: 'Réglages' }].map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setOpen(false)} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card2 text-muted text-[11px] text-center"><Icon size={20} />{label}</NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const state = useStore()
  const nav = useNavigate()
  const results = useMemo(() => searchAll(state, q), [state, q])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setFocus(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 bg-card2 border border-line rounded-pill px-4 h-10">
        <Search size={16} className="text-muted" />
        <input value={q} onFocus={() => setFocus(true)} onChange={(e) => { setQ(e.target.value); setFocus(true) }} placeholder="Rechercher un prospect, un client, un apporteur, une tâche…" className="bg-transparent outline-none text-sm w-full placeholder:text-muted/70" />
        {q && <button onClick={() => setQ('')} className="text-muted"><X size={14} /></button>}
      </div>
      {focus && q && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-line rounded-2xl p-1.5 z-50 shadow-2xl max-h-96 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-3 text-sm text-muted">Aucun résultat pour « {q} ».</div>}
          {results.map((r, i) => (
            <button key={i} onClick={() => { nav(r.to); setQ(''); setFocus(false) }} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-3">
              <span className="pill bg-card2 text-muted border border-line w-20 justify-center">{r.type}</span>
              <span className="flex-1 min-w-0"><span className="block text-sm text-txt truncate">{r.label}</span><span className="block text-[11px] text-muted truncate">{r.sub}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const state = useStore()
  const list = useMemo(() => notifications(state), [state])
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])
  const tone = { info: '#0071E3', warn: '#FF9F0A', danger: '#FF453A' }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-icon relative">
        <Bell size={18} />
        {list.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-pill bg-brand ring-2 ring-bg" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-card border border-line rounded-2xl p-2 z-50 shadow-2xl max-h-[70vh] overflow-y-auto">
          <div className="px-3 py-2 label">Notifications</div>
          {list.length === 0 && <div className="px-3 py-4 text-sm text-muted">Rien à signaler. Tout est à jour.</div>}
          {list.map((n) => (
            <button key={n.id} onClick={() => { nav(n.to); setOpen(false) }} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-start gap-3">
              <span className="mt-1.5 w-2 h-2 rounded-pill shrink-0" style={{ background: tone[n.severity] }} />
              <span className="text-sm text-txt/90 leading-snug">{n.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)
  useEffect(() => onSyncStatus(setStatus), [])
  const map: Record<SyncStatus, { color: string; label: string; title: string }> = {
    live: { color: '#30D158', label: 'En ligne', title: 'Données partagées et synchronisées en temps réel' },
    connecting: { color: '#FF9F0A', label: 'Connexion', title: 'Connexion à la base de données en cours' },
    error: { color: '#FF453A', label: 'Hors ligne', title: 'Base injoignable. Les changements repartiront à la reconnexion.' },
    local: { color: '#8A8A93', label: 'Local', title: 'Données stockées dans ce navigateur uniquement' },
  }
  const s = map[status]
  return (
    <span title={s.title} className="hidden sm:inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-medium bg-card2 border border-line text-muted">
      <span className="w-1.5 h-1.5 rounded-pill" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}

function Topbar() {
  const users = useStore((s) => s.users)
  const current = useStore((s) => s.settings.currentUser)
  const setSettings = useStore((s) => s.setSettings)
  const nav = useNavigate()
  const me = users.find((u) => u.id === current) ?? users[0]
  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur border-b border-line/60">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 h-[68px] flex items-center gap-4">
        <GlobalSearch />
        <div className="hidden lg:block flex-1 text-center text-sm text-muted capitalize-first">{todayLabel()}</div>
        <div className="flex items-center gap-1 ml-auto">
          <SyncBadge />
          <button className="btn-icon" title="Réglages" onClick={() => nav('/reglages')}><Settings size={18} /></button>
          <Notifications />
          <button onClick={() => setSettings({ currentUser: me.id === 'jeremy' ? 'matheis' : 'jeremy' })} title={`Connecté : ${me.name} (cliquer pour changer)`} className="ml-1">
            <Avatar user={me} size={34} />
          </button>
        </div>
      </div>
    </header>
  )
}

export function PeriodSelector() {
  const period = useStore((s) => s.ui.period)
  const setUi = useStore((s) => s.setUi)
  return (
    <Segmented<Period> value={period} onChange={(period) => setUi({ period })} options={[{ value: 'month', label: 'Ce mois-ci' }, { value: 'week', label: 'Cette semaine' }, { value: 'quarter', label: 'Ce trimestre' }]} />
  )
}

export function UserFilter() {
  const users = useStore((s) => s.users)
  const f = useStore((s) => s.ui.userFilter)
  const setUi = useStore((s) => s.setUi)
  return (
    <Segmented value={f} onChange={(userFilter) => setUi({ userFilter })} options={[{ value: 'all', label: 'Tous' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
  )
}

export function Layout({ children }: { children?: ReactNode }) {
  const [quick, setQuick] = useState(false)
  return (
    <div className="min-h-full md:pl-[72px]">
      <Sidebar />
      <Topbar />
      <main className="pt-8">{children ?? <Outlet />}</main>
      <MobileBar />
      <button onClick={() => setQuick(true)} title="Création rapide" className="fixed bottom-20 md:bottom-8 right-5 md:right-8 z-40 w-14 h-14 rounded-pill bg-brand text-white grid place-content-center shadow-[0_8px_30px_rgba(0,113,227,0.45)] hover:bg-brandLight hover:scale-105">
        <Plus size={26} />
      </button>
      <QuickCreate open={quick} onClose={() => setQuick(false)} />
    </div>
  )
}
