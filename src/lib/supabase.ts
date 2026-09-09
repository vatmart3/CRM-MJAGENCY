import { createClient, SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// Une barre oblique finale casse les appels : on la retire.
const url = rawUrl?.replace(/\/+$/, '')

/**
 * Erreur de configuration détectable sans appel réseau. Le cas le plus fréquent est
 * de coller l'adresse du tableau de bord au lieu de celle du projet.
 */
export const configError: string | null = (() => {
  if (!url && !anonKey) return null
  if (url && /supabase\.(com|io)\/dashboard/i.test(url))
    return 'VITE_SUPABASE_URL contient l’adresse du tableau de bord Supabase. Il faut l’adresse du projet, de la forme https://votre-ref.supabase.co.'
  if (url && !/^https?:\/\//.test(url)) return 'VITE_SUPABASE_URL doit commencer par https://.'
  if (url && !anonKey) return 'VITE_SUPABASE_ANON_KEY est absente.'
  if (anonKey && !url) return 'VITE_SUPABASE_URL est absente.'
  return null
})()

/**
 * Le mode « cloud » ne s'active que si les deux variables d'environnement sont
 * renseignées. Sans elles, l'app reste en local dans le navigateur, comme avant.
 */
export const isCloud = Boolean(url && anonKey && /^https?:\/\//.test(url) && !configError)

export const supabase: SupabaseClient | null = isCloud ? createClient(url as string, anonKey as string) : null

/** Identifie cet onglet, pour ignorer en temps réel les écritures qu'on vient de faire. */
export const clientId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2)
