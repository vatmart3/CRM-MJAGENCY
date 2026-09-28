/**
 * Outils partagés des fonctions serveur de FLUX : réponse JSON et contrôle d'accès.
 *
 * Le contrôle reprend celui du cockpit : la personne doit être connectée à
 * Supabase ET son adresse doit figurer dans la liste blanche allowed_emails.
 * Sans cela, l'adresse de la fonction serait publique et n'importe qui pourrait
 * consommer le crédit d'API. Si la base n'est pas configurée (mode local), il
 * n'y a pas de compte à vérifier.
 */

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_KEY = (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim()

/** Renvoie null si l'appel est autorisé, sinon le message d'erreur à afficher. */
export async function authorize(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'Connecte-toi pour utiliser l’IA.'
  try {
    const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
    })
    if (!me.ok) return 'Session expirée. Reconnecte-toi.'
    const email = ((await me.json()) as { email?: string }).email
    if (!email) return 'Compte sans adresse e-mail.'
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/allowed_emails?select=user_key&email=ilike.${encodeURIComponent(email)}`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
    })
    const list = (await rows.json()) as unknown
    if (!Array.isArray(list) || list.length === 0) return 'Ce compte n’est pas autorisé.'
    return null
  } catch {
    return 'Vérification du compte impossible.'
  }
}
