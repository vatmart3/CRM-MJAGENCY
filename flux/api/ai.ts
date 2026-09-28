import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { authorize, json } from './_auth.js'

/**
 * Point d'entrée unique de l'IA de FLUX. Le champ `action` du corps choisit le travail :
 *   - scan   : lire un ticket ou une facture (photo ou PDF) ;
 *   - ask    : répondre à une question sur les chiffres, à partir du paquet de données envoyé ;
 *   - weekly : rédiger le résumé de la semaine.
 *
 * Sans ANTHROPIC_API_KEY, la fonction répond { unavailable: true } : le navigateur
 * bascule alors sur son moteur local, gratuit. L'IA est un supplément, jamais une condition.
 */

const MODEL = 'claude-opus-5'
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const envEffort = process.env.ANTHROPIC_EFFORT?.trim() as Effort | undefined
const effortFor = (fallback: Effort): Effort => (envEffort && EFFORTS.includes(envEffort) ? envEffort : fallback)

/** Taille maximale d'un justificatif encodé en base64. */
const MAX_BASE64 = 8 * 1024 * 1024
/** Taille maximale du paquet de données envoyé avec une question. */
const MAX_CONTEXT = 3 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

// ── Consignes ───────────────────────────────────────────────────────────────

const SYSTEM_SCAN = `Tu lis des tickets de caisse et des factures d'achat pour FLUX, l'outil de gestion de MJAGENCY, une micro-entreprise française (agence web à Sète).

Ce que tu dois extraire :
- fournisseur : le nom du commerçant ou de la société tel qu'il est imprimé (enseigne), nettoyé : sans adresse, sans SIRET, sans forme juridique superflue, avec une casse lisible (« Leroy Merlin », « OVH », « Total Energies »).
- date : la date d'achat au format AAAA-MM-JJ. Sur les tickets français elle est écrite JJ/MM/AA ou JJ/MM/AAAA (le jour d'abord, jamais le mois d'abord). Une année sur deux chiffres signifie 20AA. Une date postérieure à la date du jour fournie est une erreur de lecture. Si la date est illisible ou absente, renvoie une chaîne vide.
- montant : le TOTAL TTC effectivement payé, en euros, sous forme de nombre (12.5 pour 12,50 €). La micro-entreprise ne récupère PAS la TVA : prends toujours le total TTC, jamais le HT ni le montant de TVA. Ignore les sous-totaux, remises déjà déduites, rendus de monnaie et montants « payés » en espèces supérieurs au total.
- categorieId : l'identifiant de la catégorie de dépense la plus adaptée, choisi uniquement parmi la liste fournie. À défaut, la catégorie « Autre » si elle existe.
- libelle : une description courte en français de ce qui a été acheté (« Plein d'essence », « Abonnement Figma annuel », « Clavier et souris »), 60 caractères au plus.

Si un champ est illisible, ne l'invente pas : chaîne vide pour le texte, 0 pour le montant.`

const SYSTEM_ASK = `Tu es l'assistant financier de FLUX, l'outil interne de MJAGENCY : une micro-entreprise française (agence web à Sète) tenue par Jérémy Vatuone, avec son associé Matheis.

Règles du métier à connaître :
- Micro-entreprise : TVA non applicable (art. 293 B du CGI). Les ventes n'ont pas de TVA ; les dépenses sont saisies TTC, la TVA n'est pas récupérable.
- Les cotisations URSSAF se calculent sur le chiffre d'affaires ENCAISSÉ, à la date d'encaissement réelle (pas la date de facture). Le taux total est donné dans les réglages. La déclaration est mensuelle ou trimestrielle selon les réglages.
- « Résultat » ou « ce que je garde » = CA encaissé − dépenses − cotisations.
- Seuils : franchise en base de TVA, seuil majoré, plafond micro-entreprise, tous calculés sur le CA encaissé de l'année civile.
- Une facture non encaissée dont l'échéance est passée est « En retard ».
- Les notes de frais sont des dépenses payées par Jérémy ou Matheis avec leur argent personnel, que l'entreprise doit leur rembourser.

Comment répondre :
- Réponds UNIQUEMENT à partir des données fournies dans le message. N'invente jamais un chiffre, un client ou une date. Si les données ne permettent pas de répondre, dis-le simplement et indique ce qu'il faudrait saisir dans FLUX.
- Les agrégats mensuels (champ « mois ») sont exacts : utilise-les pour les totaux par mois, trimestre ou année plutôt que de ré-additionner les lignes. Additionne les lignes seulement pour filtrer (une catégorie, un client, un fournisseur).
- La date du jour est fournie. « Ce mois », « ce trimestre », « cette année » s'entendent par rapport à elle ; précise toujours la période retenue.
- Écris en français, en tutoyant, avec des phrases courtes et naturelles : 1 à 4 phrases, pas de listes à puces ni de markdown.
- Montants au format français : 1 234,56 € (espace pour les milliers, virgule décimale, symbole après). Dates au format JJ/MM/AAAA. Pourcentages : 12 %.
- chiffres : 0 à 4 chiffres clés qui résument la réponse (libellé court, valeur déjà formatée).
- suggestions : 0 à 3 questions de suivi utiles, courtes, formulées comme l'utilisateur les poserait.`

const SYSTEM_WEEKLY = `Tu rédiges le résumé hebdomadaire de FLUX, l'outil de gestion de MJAGENCY, une micro-entreprise française (agence web à Sète, TVA non applicable art. 293 B, cotisations URSSAF sur le CA encaissé).

Tu reçois les faits de la semaine écoulée (lundi → dimanche), calculés par l'application, et quelques éléments de contexte.

- resume : 2 à 3 phrases en français, en tutoyant, qui disent l'essentiel de la semaine (encaissements, dépenses, comparaison avec la semaine d'avant, événement notable). Pas de formule de politesse.
- recommandations : 1 à 3 actions concrètes et vérifiables, la plus rentable en premier, chacune en une phrase qui commence par un verbe à l'impératif et cite le nom et le montant en jeu. Exemples : relancer tel client pour telle facture ; couper tel abonnement inutilisé (avec son coût annuel) ; ajouter N justificatifs manquants ; mettre X € de côté pour l'URSSAF ; déclarer avant telle date.
- N'utilise que les faits fournis. N'invente aucun chiffre, aucun nom.
- Montants au format 1 234,56 €, dates au format JJ/MM/AAAA.`

// ── Schémas de sortie ───────────────────────────────────────────────────────

const scanSchema = (ids: string[]) =>
  z.object({
    fournisseur: z.string().describe('Nom du commerçant tel qu’imprimé, nettoyé. Chaîne vide si illisible.'),
    date: z.string().describe('Date d’achat au format AAAA-MM-JJ, ou chaîne vide si illisible.'),
    montant: z.number().describe('Total TTC payé en euros (nombre, point décimal). 0 si illisible.'),
    // Pas de z.enum : une valeur hors liste ferait échouer toute la lecture. Le navigateur
    // vérifie l'identifiant et devine la catégorie lui-même s'il est inconnu.
    categorieId: z.string().describe(`Identifiant de la catégorie choisie, exactement l’un de : ${ids.join(', ') || '(aucun)'}.`),
    libelle: z.string().describe('Description courte en français de l’achat.'),
  })

const AskSchema = z.object({
  reponse: z.string().describe('Réponse en 1 à 4 phrases courtes, en français, en tutoyant, avec des montants au format 1 234,56 €.'),
  chiffres: z
    .array(z.object({ label: z.string().describe('Libellé court.'), valeur: z.string().describe('Valeur formatée, par ex. « 1 234,56 € » ou « 42 % ».') }))
    .describe('0 à 4 chiffres clés.'),
  suggestions: z.array(z.string()).describe('0 à 3 questions de suivi.'),
})

const WeeklySchema = z.object({
  resume: z.string().describe('2 à 3 phrases résumant la semaine.'),
  recommandations: z.array(z.string()).describe('1 à 3 actions concrètes, la plus rentable en premier.'),
})

// ── Requêtes ────────────────────────────────────────────────────────────────

interface Body {
  action?: string
  media_type?: string
  data?: string
  categories?: { id?: unknown; nom?: unknown }[]
  today?: string
  question?: string
  context?: unknown
}

class BadInput extends Error {}

type Job<T> = { system: string; effort: Effort; content: Anthropic.ContentBlockParam[]; schema: z.ZodType<T> }

function scanJob(body: Body): Job<unknown> {
  const media = String(body.media_type ?? '')
  const data = typeof body.data === 'string' ? body.data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '') : ''
  if (!data) throw new BadInput('Aucun fichier reçu.')
  if (data.length > MAX_BASE64) throw new BadInput('Fichier trop lourd (8 Mo maximum). Reprends la photo en plus petit ou compresse le PDF.')

  let file: Anthropic.ContentBlockParam
  if (media === 'application/pdf') file = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  else if ((IMAGE_TYPES as readonly string[]).includes(media)) file = { type: 'image', source: { type: 'base64', media_type: media as ImageType, data } }
  else throw new BadInput('Format non pris en charge : envoie une photo (JPEG, PNG, WebP, GIF) ou un PDF.')

  const cats = (Array.isArray(body.categories) ? body.categories : [])
    .map((c) => ({ id: String(c?.id ?? '').trim(), nom: String(c?.nom ?? '').trim() }))
    .filter((c) => c.id)
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? body.today! : new Date().toISOString().slice(0, 10)
  const liste = cats.length ? cats.map((c) => `- ${c.id} : ${c.nom}`).join('\n') : '(aucune catégorie fournie : renvoie une chaîne vide)'

  return {
    system: SYSTEM_SCAN,
    effort: effortFor('low'),
    schema: scanSchema(cats.map((c) => c.id)),
    content: [
      file,
      {
        type: 'text',
        text: `Date du jour : ${today}.\n\nCatégories de dépenses disponibles (identifiant : nom) :\n${liste}\n\nLis ce justificatif et renvoie les champs demandés.`,
      },
    ],
  }
}

const packOf = (context: unknown) => {
  if (!context || typeof context !== 'object') throw new BadInput('Données absentes.')
  const pack = JSON.stringify(context)
  if (pack.length > MAX_CONTEXT) throw new BadInput('Trop de données à analyser d’un coup.')
  return pack
}

function askJob(body: Body): Job<unknown> {
  const question = String(body.question ?? '').trim().slice(0, 1000)
  if (!question) throw new BadInput('Pose une question.')
  const pack = packOf(body.context)
  return {
    system: SYSTEM_ASK,
    effort: effortFor('medium'),
    schema: AskSchema,
    content: [
      // Le paquet de données reste identique d'une question à l'autre dans la journée :
      // il est mis en cache, seule la question change.
      { type: 'text', text: `Données de FLUX (JSON, montants en euros, dates AAAA-MM-JJ) :\n${pack}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Question : ${question}` },
    ],
  }
}

function weeklyJob(body: Body): Job<unknown> {
  const pack = packOf(body.context)
  return {
    system: SYSTEM_WEEKLY,
    effort: effortFor('medium'),
    schema: WeeklySchema,
    content: [{ type: 'text', text: `Faits de la semaine et contexte (JSON, montants en euros, dates AAAA-MM-JJ) :\n${pack}\n\nRédige le résumé et les recommandations.` }],
  }
}

const explainError = (e: unknown): { error: string; status: number } => {
  if (e instanceof Anthropic.AuthenticationError) return { error: 'Clé ANTHROPIC_API_KEY invalide.', status: 500 }
  if (e instanceof Anthropic.PermissionDeniedError) return { error: 'Cette clé n’a pas accès au modèle demandé.', status: 500 }
  if (e instanceof Anthropic.RateLimitError) return { error: 'Trop de demandes d’affilée. Réessaie dans une minute.', status: 429 }
  if (e instanceof Anthropic.BadRequestError) return { error: 'Requête refusée par l’IA (fichier illisible ou trop volumineux ?).', status: 400 }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { error: 'L’IA a mis trop de temps à répondre.', status: 504 }
  if (e instanceof Anthropic.APIConnectionError) return { error: 'IA injoignable pour le moment.', status: 502 }
  if (e instanceof Anthropic.APIError) return { error: `Erreur ${e.status ?? ''} de l’IA. Réessaie plus tard.`.replace('  ', ' '), status: 502 }
  return { error: 'Erreur inattendue du serveur.', status: 500 }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await authorize(request)
  if (denied) return json({ error: denied }, 401)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'Requête illisible.' }, 400)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return json({ unavailable: true, error: 'Clé ANTHROPIC_API_KEY absente : calcul local.' })

  let job: Job<unknown>
  try {
    if (body.action === 'scan') job = scanJob(body)
    else if (body.action === 'ask') job = askJob(body)
    else if (body.action === 'weekly') job = weeklyJob(body)
    else return json({ error: 'Action inconnue.' }, 400)
  } catch (e) {
    if (e instanceof BadInput) return json({ error: e.message }, 400)
    throw e
  }

  try {
    // Vercel coupe la fonction à 60 s : on s'arrête avant, sans nouvel essai.
    const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 0 })
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: job.system,
      output_config: { format: zodOutputFormat(job.schema), effort: job.effort },
      messages: [{ role: 'user', content: job.content }],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'L’IA a refusé de traiter cette demande.' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'Réponse de l’IA tronquée. Réessaie.' }, 502)
    const result = response.parsed_output
    if (!result) return json({ error: 'Réponse de l’IA illisible. Réessaie.' }, 502)

    return json({ result, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } })
  } catch (e) {
    const { error, status } = explainError(e)
    // Jamais la clé ni le corps de la requête dans les journaux : seulement le type d'erreur.
    console.error(`[ai:${body.action}]`, e instanceof Anthropic.APIError ? `${e.name} ${e.status ?? ''}` : e instanceof Error ? e.name : 'erreur')
    return json({ error }, status)
  }
}

export function GET(): Response {
  return json({ error: 'Méthode non autorisée : utilise POST.' }, 405)
}
