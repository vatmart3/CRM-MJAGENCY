import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { auditSite, Finding, SiteAudit } from './_audit.js'

/**
 * Analyse le site d'un prospect, puis demande au modèle trois propositions de DM.
 *
 * Le partage des rôles est volontaire : les constats viennent de la mesure faite
 * dans _audit.ts, le modèle ne fait que les mettre en mots. Il ne peut donc pas
 * reprocher au commerçant un défaut qui n'existe pas.
 */

const MODEL = 'claude-opus-5'
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const Analyse = z.object({
  resume: z.string().describe('Le problème principal du site en une phrase simple, sans jargon technique, compréhensible par un commerçant.'),
  priorites: z.array(z.string()).describe('Les trois corrections les plus rentables, une phrase courte chacune, formulées comme un bénéfice concret.'),
  dms: z
    .array(
      z.object({
        angle: z.string().describe('L’angle du message en deux ou trois mots, par exemple « Invisible sur Google ».'),
        texte: z.string().describe('Le message complet, prêt à coller dans Instagram.'),
      }),
    )
    .describe('Exactement trois propositions de messages, avec trois angles différents.'),
})

const SYSTEM = `Tu écris des messages privés Instagram pour MJAGENCY, une petite agence web de Sète qui s'occupe des sites des commerces du Bassin de Thau.

La structure d'un message, toujours la même, en quatre temps :
1. Une observation vraie. Elle doit venir uniquement des constats techniques fournis. N'invente jamais un détail sur la boutique, la vitrine ou les photos : tu ne les as pas vus.
2. Un constat factuel, sans jugement et sans jargon. Traduis la mesure technique en conséquence concrète pour le commerçant ou pour son client.
3. Une valeur gratuite. Une chose utile, offerte, que le commerçant peut appliquer seul. Ce n'est pas un argumentaire de vente.
4. Une question fermée, une seule, à laquelle on répond par oui ou par non.

Règles absolues :
- Écris en français, à la deuxième personne, comme un artisan qui parle à un autre artisan.
- Ne donne aucun prix, ne propose aucun rendez-vous, ne vends rien dans ce premier message.
- Pas de superlatif, pas de « révolutionnaire », pas de « booster votre visibilité », pas de vocabulaire d'agence.
- Entre 380 et 700 caractères. Des paragraphes courts, séparés par une ligne vide.
- Un seul emoji au maximum, et seulement si le style demandé en accepte.
- Les trois propositions doivent partir de trois constats différents, pas dire la même chose autrement.`

interface Body {
  url?: string
  noSite?: boolean
  business?: string
  city?: string
  sector?: string
  prenom?: string
  toneLabel?: string
  toneTemplate?: string
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

/**
 * Vérifie que l'appelant est bien Jérémy ou Matheis. Sans cela, l'adresse de la
 * fonction serait publique et n'importe qui pourrait consommer le crédit d'API.
 * Si la base n'est pas configurée, il n'y a pas de compte à vérifier.
 */
async function authorize(req: Request): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return 'Connectez-vous pour lancer une analyse.'
  try {
    const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
    })
    if (!me.ok) return 'Session expirée. Reconnectez-vous.'
    const email = ((await me.json()) as { email?: string }).email
    if (!email) return 'Compte sans adresse email.'
    const rows = await fetch(
      `${SUPABASE_URL}/rest/v1/allowed_emails?select=user_key&email=ilike.${encodeURIComponent(email)}`,
      { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } },
    )
    const list = (await rows.json()) as unknown
    if (!Array.isArray(list) || list.length === 0) return 'Ce compte n’est pas autorisé.'
    return null
  } catch {
    return 'Vérification du compte impossible.'
  }
}

const describeFindings = (list: Finding[]) => list.map((f) => `- ${f.label} : ${f.detail}`).join('\n')

function buildPrompt(body: Body, audit: SiteAudit | null): string {
  const who = [
    `Commerce : ${body.business || 'non précisé'}`,
    body.prenom ? `Prénom du contact : ${body.prenom}` : 'Prénom du contact : inconnu, ne mets pas de prénom',
    `Ville : ${body.city || 'non précisée'}`,
    `Activité : ${body.sector || 'non précisée'}`,
  ].join('\n')

  const style = body.toneTemplate
    ? `Style demandé : « ${body.toneLabel} ». Voici un message de référence dans ce style, pour le ton, le tutoiement ou le vouvoiement, et le niveau de familiarité. Ne le recopie pas, inspire-toi seulement de sa façon de parler :\n\n${body.toneTemplate}`
    : `Style demandé : ${body.toneLabel || 'professionnel, vouvoiement'}.`

  if (!audit || body.noSite)
    return `${who}\n\n${style}\n\nCe commerce n'a aucun site internet. C'est le seul constat dont tu disposes. Écris le résumé, les priorités et les trois messages autour de cette absence, et de ce qu'elle coûte concrètement à un commerce de cette activité dans cette ville. Ne prétends pas avoir vu quoi que ce soit d'autre.`

  if (!audit.reachable)
    return `${who}\n\n${style}\n\nLe site indiqué est ${audit.url}, et il ne répond pas. ${audit.error ?? ''} C'est le seul constat dont tu disposes. Un client qui clique sur ce lien ne voit rien. Écris le résumé, les priorités et les trois messages autour de ce seul fait.`

  return `${who}\n\nSite analysé : ${audit.finalUrl}
Note globale : ${audit.score} sur 100.
Temps de réponse : ${(audit.responseMs / 1000).toFixed(1)} seconde.

Constats mesurés, du plus grave au moins grave. Ce sont les seuls faits dont tu disposes :
${describeFindings(audit.problems) || '- Aucun problème détecté, le site est propre.'}

Ce qui fonctionne déjà, à ne pas critiquer :
${describeFindings(audit.findings.filter((f) => f.ok)) || '- Rien.'}

${style}

Écris le résumé, les trois priorités, et les trois messages. Chaque message doit s'appuyer sur un constat mesuré différent parmi ceux listés ci-dessus.`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const denied = await authorize(req)
  if (denied) return json({ error: denied }, 401)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'Requête illisible.' }, 400)
  }
  if (!body.noSite && !body.url?.trim()) return json({ error: 'Indiquez l’adresse du site, ou cochez « pas de site ».' }, 400)

  const audit = body.noSite ? null : await auditSite(body.url as string)

  // Sans clé, on renvoie les constats mesurés. Le navigateur sait en faire des
  // messages tout seul : la rédaction par IA est un supplément, pas une condition.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ audit, ai: null })

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(Analyse), effort: EFFORT },
      messages: [{ role: 'user', content: buildPrompt(body, audit) }],
    })

    if (response.stop_reason === 'refusal')
      return json({ audit, ai: null, aiError: 'Le modèle a refusé de répondre à cette demande.' })

    const parsed = response.parsed_output
    if (!parsed) return json({ audit, ai: null, aiError: 'Réponse du modèle illisible. Relancez l’analyse.' })

    return json({
      audit,
      ai: parsed,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })
  } catch (e) {
    let aiError = 'Rédaction impossible.'
    if (e instanceof Anthropic.AuthenticationError) aiError = 'Clé ANTHROPIC_API_KEY invalide.'
    else if (e instanceof Anthropic.RateLimitError) aiError = 'Trop de demandes d’affilée. Réessayez dans une minute.'
    else if (e instanceof Anthropic.BadRequestError) aiError = `Requête refusée par l’API : ${e.message}`
    else if (e instanceof Anthropic.APIError) aiError = `Erreur ${e.status} de l’API.`
    console.error('[analyse] rédaction impossible', e)
    return json({ audit, ai: null, aiError })
  }
}
