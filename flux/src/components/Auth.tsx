import { ReactNode, useEffect, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { configError, isCloud, supabase } from '../lib/supabase'
import { getSyncError, initSync, onSyncStatus, stopSync } from '../lib/sync'
import { storeTarget, useFlux } from '../store'
import { UserId } from '../types'

type Phase = 'loading' | 'signin' | 'denied' | 'ready'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid place-content-center px-5 page-glow">
      <div className="card p-8 w-full max-w-sm fade-up shadow-lift">
        <div className="flex items-center gap-3 mb-8">
          <svg width="42" height="42" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="18" fill="rgb(var(--card2))" />
            <circle cx="32" cy="32" r="18" fill="none" stroke="rgb(var(--accent))" strokeWidth="3" opacity=".35" />
            <path d="M14 35c5-4 9-4 13 0s8 4 12 0 8-4 11 0v2a18 18 0 0 1-36 0z" fill="rgb(var(--accent))" />
          </svg>
          <span>
            <span className="block font-bold tracking-[0.18em]">FLUX</span>
            <span className="block text-muted text-xs">Finances MJAGENCY</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Mode local : on entre directement. Mode en ligne : connexion, contrôle de la liste
 * blanche (allowed_emails), identification Jérémy / Matheis, puis synchronisation.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(isCloud ? 'loading' : 'ready')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [syncErr, setSyncErr] = useState<string | null>(null)

  useEffect(() => onSyncStatus((s) => setSyncErr(s === 'error' ? getSyncError() : null)), [])

  useEffect(() => {
    if (!isCloud || !supabase) {
      void initSync(storeTarget)
      return
    }
    let cancelled = false
    const start = async (userEmail: string) => {
      const { data, error: err } = await supabase!.from('allowed_emails').select('user_key').ilike('email', userEmail).maybeSingle()
      if (cancelled) return
      if (err || !data) return setPhase('denied')
      useFlux.getState().setUser(data.user_key as UserId)
      await initSync(storeTarget)
      if (!cancelled) setPhase('ready')
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session?.user.email) void start(data.session.user.email)
      else setPhase('signin')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_OUT') {
        stopSync()
        setPhase('signin')
      } else if (event === 'SIGNED_IN' && session?.user.email) {
        setPhase('loading')
        void start(session.user.email)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  if (configError)
    return (
      <Shell>
        <p className="text-sm font-semibold text-danger mb-2">Configuration incomplète</p>
        <p className="text-sm leading-relaxed">{configError}</p>
        <p className="text-xs text-muted mt-5">Corrigez les variables d’environnement puis relancez le déploiement (Vercel → Deployments → Redeploy).</p>
      </Shell>
    )

  if (phase === 'ready')
    return (
      <>
        {syncErr && (
          <div className="fixed z-[100] top-0 inset-x-0 bg-danger text-white text-xs font-medium px-4 py-2 text-center">
            Synchronisation interrompue : {syncErr}
          </div>
        )}
        {children}
      </>
    )

  if (phase === 'loading')
    return (
      <Shell>
        <div className="flex items-center gap-3 text-muted text-sm">
          <Loader2 size={16} className="animate-spin text-accent" /> Chargement des comptes de l’agence…
        </div>
      </Shell>
    )

  if (phase === 'denied')
    return (
      <Shell>
        <p className="text-sm leading-relaxed mb-5">Ce compte n’est pas autorisé à ouvrir FLUX. Ajoutez son adresse dans la table allowed_emails de Supabase, puis reconnectez-vous.</p>
        <button className="btn-ghost w-full" onClick={() => void supabase?.auth.signOut()}>
          Changer de compte
        </button>
      </Shell>
    )

  const explain = (msg: string) =>
    msg === 'Invalid login credentials'
      ? 'Adresse ou mot de passe incorrect.'
      : /already registered/i.test(msg)
        ? 'Un compte existe déjà avec cette adresse : connecte-toi.'
        : /at least 6|Password should/i.test(msg)
          ? 'Le mot de passe doit faire au moins 6 caractères.'
          : /Email not confirmed/i.test(msg)
            ? 'Cette adresse n’est pas autorisée à ouvrir FLUX.'
            : msg

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const creds = { email: email.trim(), password }
    if (creating) {
      // Seules les adresses de la liste blanche sont confirmées (déclencheur côté base).
      const { data, error: err } = await supabase.auth.signUp(creds)
      if (err) {
        setBusy(false)
        return setError(explain(err.message))
      }
      if (data.session) return setBusy(false)
    }
    const { error: err } = await supabase.auth.signInWithPassword(creds)
    setBusy(false)
    if (err) setError(explain(err.message))
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3.5">
        <label className="block">
          <span className="block text-xs font-medium text-muted mb-1.5">Adresse e-mail</span>
          <input className="input" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-muted mb-1.5">{creating ? 'Choisis un mot de passe' : 'Mot de passe'}</span>
          <input className="input" type="password" autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 6 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-danger text-xs">{error}</p>}
        <button className="btn-primary w-full !mt-6" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} {creating ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>
      <button
        className="text-xs text-muted hover:text-txt mt-5 block mx-auto"
        onClick={() => {
          setCreating(!creating)
          setError('')
        }}
      >
        {creating ? 'J’ai déjà un compte' : 'Première connexion ? Crée ton compte'}
      </button>
    </Shell>
  )
}
