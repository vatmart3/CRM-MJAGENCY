import { supabase } from './supabase'

/** Les types renvoyés par la fonction serveur api/analyse.ts. */
export interface AuditFinding {
  key: string
  label: string
  ok: boolean
  detail: string
  weight: number
}
export interface SiteAudit {
  url: string
  finalUrl: string
  reachable: boolean
  status: number | null
  responseMs: number
  score: number
  findings: AuditFinding[]
  problems: AuditFinding[]
  error?: string
}
export interface AiAnalysis {
  resume: string
  priorites: string[]
  dms: { angle: string; texte: string }[]
}
export interface AnalyseResult {
  audit: SiteAudit | null
  ai: AiAnalysis | null
  aiError?: string
}

export interface AnalyseInput {
  url: string
  noSite: boolean
  business: string
  city: string
  sector: string
  prenom: string
  toneLabel: string
  toneTemplate: string
}

/** Erreur portant un message déjà rédigé pour l'utilisateur. */
export class AnalyseError extends Error {}

/**
 * Demande au serveur d'analyser le site puis de proposer des messages.
 * La fonction n'existe que sur le site déployé, ou en local avec « vercel dev ».
 */
export async function analyseSite(input: AnalyseInput): Promise<AnalyseResult> {
  let token: string | undefined
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token
  }

  let res: Response
  try {
    res = await fetch('/api/analyse', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new AnalyseError('Impossible de joindre le serveur d’analyse. Vérifiez votre connexion.')
  }

  // En développement avec « npm run dev », /api n'existe pas : Vite renvoie la page HTML.
  const isJson = res.headers.get('content-type')?.includes('application/json')
  if (!isJson)
    throw new AnalyseError(
      'La fonction d’analyse n’est pas disponible ici. Elle tourne sur le site déployé, ou en local avec la commande « vercel dev ».',
    )

  const data = (await res.json()) as AnalyseResult & { error?: string }
  if (!res.ok) throw new AnalyseError(data.error ?? `Le serveur a répondu ${res.status}.`)
  return data
}
