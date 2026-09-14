/**
 * Analyse technique d'un site de commerce, sans intelligence artificielle.
 *
 * Tout ce qui est vérifiable de façon certaine est mesuré ici. Le modèle de
 * langage n'intervient qu'ensuite, pour transformer ces constats en phrases.
 * C'est ce qui garantit qu'un DM ne contient jamais un reproche inventé.
 */

export interface Finding {
  key: string
  label: string
  ok: boolean
  /** Ce qu'on a mesuré, en une phrase lisible par le commerçant. */
  detail: string
  /** Poids dans la note, et priorité de mention dans le message. */
  weight: number
}

export interface SiteAudit {
  url: string
  finalUrl: string
  reachable: boolean
  status: number | null
  responseMs: number
  score: number
  findings: Finding[]
  problems: Finding[]
  error?: string
}

const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 12_000

const decode = (buffer: ArrayBuffer, contentType: string) => {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase()
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/** Retire scripts et styles : leur contenu fausse toutes les recherches de texte. */
const stripCode = (html: string) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')

const attr = (tag: string, name: string) =>
  new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]?.trim() ?? null

const metaContent = (html: string, name: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`, 'i')
  const tag = re.exec(html)?.[0]
  return tag ? attr(tag, 'content') : null
}

export const normalizeUrl = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export async function auditSite(rawUrl: string): Promise<SiteAudit> {
  const url = normalizeUrl(rawUrl)
  const base: SiteAudit = {
    url: rawUrl, finalUrl: url ?? rawUrl, reachable: false, status: null, responseMs: 0,
    score: 0, findings: [], problems: [],
  }
  if (!url) return { ...base, error: 'Adresse de site invalide.' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()
  let html = ''
  let finalUrl = url
  let status: number | null = null

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Certains hébergeurs renvoient une page vide sans en-tête de navigateur.
        'user-agent': 'Mozilla/5.0 (compatible; MJAgencyAudit/1.0; +https://mjagency.fr)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
    })
    status = res.status
    finalUrl = res.url || url
    const buf = await res.arrayBuffer()
    html = decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf, res.headers.get('content-type') ?? '')
  } catch (e) {
    clearTimeout(timer)
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ...base,
      finalUrl,
      responseMs: Date.now() - started,
      error: aborted ? 'Le site n’a pas répondu en douze secondes.' : 'Le site est injoignable.',
    }
  }
  clearTimeout(timer)

  const responseMs = Date.now() - started
  const sizeKb = Math.round(html.length / 1024)
  const body = stripCode(html)
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const lower = html.toLowerCase()

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const description = metaContent(html, 'description') ?? ''
  const viewport = metaContent(html, 'viewport')
  const ogTitle = metaContent(html, 'og:title')
  const ogImage = metaContent(html, 'og:image')
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const imgsNoAlt = imgs.filter((t) => !attr(t, 'alt'))
  const hasTel = /href\s*=\s*["']tel:/i.test(html)
  const hasMailto = /href\s*=\s*["']mailto:/i.test(html)
  const phoneInText = /\b0\s?[1-9](?:[\s.-]?\d{2}){4}\b/.test(text)
  const hasForm = /<form\b/i.test(html)
  const hasHours = /horaire|ouvert du|lundi|mardi|mercredi/i.test(text) || /openinghours/i.test(lower)
  const ldJson = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const hasLocalBusiness = ldJson.some((b) => /"@type"\s*:\s*"?(LocalBusiness|Restaurant|Bakery|Store|HairSalon|BeautySalon|CafeOrCoffeeShop)/i.test(b))
  const hasMap = /google\.com\/maps|maps\.google|openstreetmap/i.test(lower)
  const hasInstagram = /instagram\.com\//i.test(lower)
  const hasFavicon = /rel\s*=\s*["'][^"']*icon/i.test(html)
  const https = finalUrl.startsWith('https://')
  const lang = attr(/<html\b[^>]*>/i.exec(html)?.[0] ?? '', 'lang')
  // Deux défauts distincts : une page d'attente revendiquée, et une page simplement trop maigre.
  // Les confondre ferait dire au message « votre site est en construction » à tort.
  const placeholder = /en construction|coming soon|site en cours|domaine.*(à vendre|parking)|default web page|parked domain/i.test(text)
  const thin = text.length < 400

  const F = (key: string, label: string, ok: boolean, detail: string, weight: number): Finding => ({ key, label, ok, detail, weight })

  const findings: Finding[] = [
    F('reachable', 'Le site répond', status !== null && status < 400, status && status >= 400 ? `Le serveur renvoie une erreur ${status}.` : 'La page se charge normalement.', 5),
    F('placeholder', 'Un vrai site, pas une page d’attente', !placeholder, placeholder ? 'La page annonce un site en construction ou un domaine non exploité.' : 'La page n’est pas une page d’attente.', 5),
    F('content', 'Assez de texte pour Google', !thin, thin ? `La page ne contient qu’environ ${text.length} caractères de texte : Google a très peu de matière pour vous classer.` : `La page contient environ ${text.length} caractères de texte.`, 3),
    F('https', 'Connexion sécurisée', https, https ? 'Le site est en HTTPS.' : 'Le site n’est pas en HTTPS : les navigateurs affichent « non sécurisé ».', 4),
    F('speed', 'Vitesse d’affichage', responseMs < 2500, `La page répond en ${(responseMs / 1000).toFixed(1)} seconde${responseMs >= 2000 ? 's' : ''}.`, responseMs > 4000 ? 4 : 2),
    F('viewport', 'Lisible sur téléphone', !!viewport, viewport ? 'Le site s’adapte à l’écran du téléphone.' : 'Aucun réglage mobile : le site s’affiche en tout petit sur téléphone.', 5),
    F('title', 'Titre de page', title.length >= 15 && title.length <= 65, title ? `Titre : « ${title.slice(0, 70)} » (${title.length} caractères).` : 'Aucun titre de page, c’est la première ligne que Google affiche.', 4),
    F('description', 'Description pour Google', description.length >= 50 && description.length <= 165, description ? `Description de ${description.length} caractères.` : 'Aucune description : Google invente le texte affiché sous le lien.', 3),
    F('h1', 'Titre principal', h1s.length === 1, h1s.length === 0 ? 'Aucun titre principal dans la page.' : h1s.length > 1 ? `${h1s.length} titres principaux, Google ne sait pas lequel compte.` : `Titre principal : « ${h1s[0].slice(0, 60)} ».`, 2),
    F('localBusiness', 'Fiche commerce pour Google', hasLocalBusiness, hasLocalBusiness ? 'Le balisage commerce local est présent.' : 'Aucun balisage commerce local : Google ne sait pas que c’est un commerce, ni où il se trouve.', 4),
    F('phone', 'Téléphone cliquable', hasTel, hasTel ? 'Le numéro est cliquable depuis un téléphone.' : phoneInText ? 'Le numéro est écrit mais pas cliquable depuis un téléphone.' : 'Aucun numéro de téléphone trouvé.', 4),
    F('contact', 'Moyen de contact', hasForm || hasMailto || hasTel, hasForm ? 'Un formulaire de contact est présent.' : hasMailto ? 'Une adresse email est cliquable.' : 'Ni formulaire, ni email, ni téléphone : aucun moyen simple de vous joindre.', 3),
    F('hours', 'Horaires affichés', hasHours, hasHours ? 'Les horaires apparaissent sur le site.' : 'Aucun horaire visible, c’est la première chose que cherche un client.', 3),
    F('map', 'Plan d’accès', hasMap, hasMap ? 'Un plan est intégré.' : 'Aucun plan d’accès intégré.', 2),
    F('images', 'Images décrites', imgs.length === 0 || imgsNoAlt.length / imgs.length < 0.4, imgs.length === 0 ? 'Aucune image sur la page.' : `${imgsNoAlt.length} image${imgsNoAlt.length > 1 ? 's' : ''} sur ${imgs.length} sans description, invisibles pour Google.`, 2),
    F('social', 'Lien vers Instagram', hasInstagram, hasInstagram ? 'Le compte Instagram est lié.' : 'Aucun lien vers Instagram depuis le site.', 1),
    F('og', 'Aperçu au partage', !!(ogTitle && ogImage), ogTitle && ogImage ? 'Le partage affiche un titre et une image.' : 'Partagé sur WhatsApp ou Facebook, le lien s’affiche sans image ni titre.', 2),
    F('favicon', 'Icône d’onglet', hasFavicon, hasFavicon ? 'L’icône d’onglet est définie.' : 'Aucune icône d’onglet, le site apparaît avec une page blanche dans les favoris.', 1),
    F('lang', 'Langue déclarée', !!lang, lang ? `Langue déclarée : ${lang}.` : 'La langue de la page n’est pas déclarée.', 1),
    F('weight', 'Poids de la page', sizeKb < 400, `Le code de la page pèse ${sizeKb} Ko.`, sizeKb > 800 ? 2 : 1),
  ]

  const total = findings.reduce((a, f) => a + f.weight, 0)
  const earned = findings.filter((f) => f.ok).reduce((a, f) => a + f.weight, 0)

  return {
    url: rawUrl,
    finalUrl,
    reachable: true,
    status,
    responseMs,
    score: Math.round((earned / total) * 100),
    findings,
    problems: findings.filter((f) => !f.ok).sort((a, b) => b.weight - a.weight),
  }
}
