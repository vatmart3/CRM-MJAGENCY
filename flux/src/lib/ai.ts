import { accessToken } from './supabase'

/** Erreur dont le message est déjà rédigé pour l'utilisateur. */
export class AiUnavailable extends Error {}

/**
 * Appelle la fonction serveur api/ai.ts. Elle n'existe que sur le site déployé
 * (ou avec « vercel dev ») et seulement si ANTHROPIC_API_KEY est renseignée.
 * Toute indisponibilité lève AiUnavailable : l'appelant bascule alors sur le
 * calcul local, gratuit, qui fonctionne partout.
 */
export async function callAI<T>(action: 'scan' | 'ask' | 'weekly', payload: Record<string, unknown>): Promise<T> {
  const token = await accessToken()
  let res: Response
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new AiUnavailable('Serveur injoignable.')
  }
  if (!res.headers.get('content-type')?.includes('application/json')) throw new AiUnavailable('Fonction IA absente de cet environnement.')
  const data = (await res.json()) as { error?: string; unavailable?: boolean } & T
  if (data.unavailable) throw new AiUnavailable(data.error ?? 'IA non configurée.')
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data
}
