import { createClient, SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const url = rawUrl?.replace(/\/+$/, '')

/** Erreur de configuration détectable sans appel réseau. */
export const configError: string | null = (() => {
  if (!url && !anonKey) return null
  if (url && /supabase\.(com|io)\/dashboard/i.test(url))
    return 'VITE_SUPABASE_URL contient l’adresse du tableau de bord Supabase. Il faut l’adresse du projet, de la forme https://votre-ref.supabase.co.'
  if (url && !/^https?:\/\//.test(url)) return 'VITE_SUPABASE_URL doit commencer par https://.'
  if (url && !anonKey) return 'VITE_SUPABASE_ANON_KEY est absente.'
  if (anonKey && !url) return 'VITE_SUPABASE_URL est absente.'
  return null
})()

/** Mode « en ligne » : les deux variables sont renseignées. Sinon FLUX reste dans le navigateur. */
export const isCloud = Boolean(url && anonKey && /^https?:\/\//.test(url) && !configError)

export const supabase: SupabaseClient | null = isCloud
  ? createClient(url as string, anonKey as string, { auth: { storageKey: 'flux-auth' } })
  : null

export const BUCKET = 'flux-justificatifs'

/** Identifie cet onglet, pour ignorer en temps réel ses propres écritures. */
export const clientId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)

export const accessToken = async () => {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
