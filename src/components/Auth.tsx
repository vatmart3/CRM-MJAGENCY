import { useEffect, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { isCloud, supabase } from '../lib/supabase'
import { initSync, stopSync } from '../lib/sync'
import { storeSyncTarget, useStore } from '../store'
import { UserId } from '../store/types'

type Phase = 'loading' | 'signin' | 'denied' | 'ready'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-content-center px-5">
      <div className="card p-8 w-full max-w-sm fade-up">
        <div className="flex items-center gap-3 mb-7">
          <span className="w-11 h-11 rounded-2xl bg-brand grid place-content-center text-white font-extrabold text-sm">MJ</span>
          <span>
            <span className="block text-white font-semibold leading-tight">MJAGENCY</span>
            <span className="block text-muted text-xs">Cockpit</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * En mode local, laisse passer directement. En mode connecté, demande l'identifiant,
 * vérifie que l'adresse figure sur la liste blanche, puis démarre la synchronisation.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>(isCloud ? 'loading' : 'ready')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setSettings = useStore((s) => s.setSettings)

  useEffect(() => {
    if (!isCloud || !supabase) {
      void initSync(storeSyncTarget)
      return
    }
    let cancelled = false

    const start = async (userEmail: string) => {
      const { data, error: err } = await supabase!
        .from('allowed_emails')
        .select('user_key')
        .ilike('email', userEmail)
        .maybeSingle()
      if (cancelled) return
      if (err || !data) {
        setPhase('denied')
        return
      }
      // Chacun reste identifié comme lui-même : ce réglage ne part jamais en base.
      setSettings({ currentUser: data.user_key as UserId })
      await initSync(storeSyncTarget)
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
      } else if (session?.user.email && event === 'SIGNED_IN') {
        setPhase('loading')
        void start(session.user.email)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [setSettings])

  if (phase === 'ready') return <>{children}</>

  if (phase === 'loading')
    return (
      <Shell>
        <div className="flex items-center gap-3 text-muted text-sm">
          <Loader2 size={16} className="animate-spin" />
          Chargement des données de l’agence…
        </div>
      </Shell>
    )

  if (phase === 'denied')
    return (
      <Shell>
        <p className="text-sm text-txt/90 leading-relaxed mb-5">
          Ce compte n’est pas autorisé à ouvrir le cockpit. Ajoutez son adresse à la liste des membres dans Supabase, puis reconnectez-vous.
        </p>
        <button
          className="btn-ghost w-full justify-center"
          onClick={() => {
            void supabase?.auth.signOut()
          }}
        >
          Changer de compte
        </button>
      </Shell>
    )

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'Adresse ou mot de passe incorrect.' : err.message)
  }

  return (
    <Shell>
      <form onSubmit={signIn} className="space-y-3">
        <label className="block">
          <span className="label block mb-1.5">Adresse email</span>
          <input className="input" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label block mb-1.5">Mot de passe</span>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-danger text-xs pt-1">{error}</p>}
        <button className="btn-primary w-full justify-center !mt-5" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          Se connecter
        </button>
      </form>
      <p className="text-[11px] text-muted mt-5 leading-relaxed">
        Les comptes de Jérémy et Matheis se créent depuis Supabase, dans Authentication puis Users.
      </p>
    </Shell>
  )
}
