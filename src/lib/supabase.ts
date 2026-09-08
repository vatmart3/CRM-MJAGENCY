import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Le mode « cloud » ne s'active que si les deux variables d'environnement sont
 * renseignées. Sans elles, l'app reste en local dans le navigateur, comme avant.
 */
export const isCloud = Boolean(url && anonKey && /^https?:\/\//.test(url))

export const supabase: SupabaseClient | null = isCloud ? createClient(url as string, anonKey as string) : null

/** Identifie cet onglet, pour ignorer en temps réel les écritures qu'on vient de faire. */
export const clientId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)
