import { Abonnement, Categorie, Settings, Stats } from './types'
import { addMonths, nowISO, today } from './lib/dates'

// Données de départ : les réglages, les catégories de dépenses et l'exemple
// d'abonnement Figma. Aucune fausse recette ni fausse dépense.

export const defaultSettings: Settings = {
  entreprise: {
    nom: 'MJAGENCY',
    titulaire: 'Jérémy Vatuone',
    siret: '992 328 120 00017',
    adresse: '54 rue Marceau, 34200 Sète',
    email: '',
    telephone: '',
    mentionTVA: 'TVA non applicable, art. 293 B du CGI',
  },
  // Valeurs indicatives pour des prestations de services, à vérifier et
  // confirmer dans Réglages (le bandeau d'accueil le rappelle tant que ce n'est pas fait).
  tauxCotisations: 21.2,
  vlActif: false,
  tauxVL: 1.7,
  tauxCFP: 0.1,
  // Jérémy n'a pas l'ACRE, Matheis l'a. Réduction de 25 % pour une activité démarrée
  // depuis le 1er juillet 2025 (50 % avant) : à vérifier, avec la date de fin, dans Réglages.
  acre: { jeremy: { actif: false, fin: '' }, matheis: { actif: true, fin: '' } },
  reductionACRE: 25,
  seuilTVA: 37500,
  seuilTVAMajore: 41250,
  plafondMicro: 83600,
  periodicite: 'trimestrielle',
  objectifMensuel: 4000,
  soldeInitial: 0,
  dateSoldeInitial: today().slice(0, 4) + '-01-01',
  partDefautJeremy: 50,
  delaiPaiementJours: 30,
  prefixeFacture: 'F',
  tauxVerifies: false,
  signatureRelance: 'Jérémy Vatuone\nMJAGENCY — Agence web & marketing digital\n54 rue Marceau, 34200 Sète',
}

export const defaultStats: Stats = { sansManquantDepuis: '', meilleureSerie: 0 }

const CATS: [string, string][] = [
  ['Logiciels & abonnements', 'logiciel saas abonnement licence figma adobe notion claude openai chatgpt canva google workspace base44 slack'],
  ['Hébergement & noms de domaine', 'hébergement hebergement serveur domaine ovh o2switch ionos vercel netlify hostinger gandi cloudflare'],
  ['Publicité & prospection', 'publicité pub ads meta facebook instagram google ads linkedin flyer prospection'],
  ['Matériel informatique', 'ordinateur écran clavier souris disque câble matériel apple fnac darty ldlc boulanger'],
  ['Déplacements', 'essence carburant péage parking train sncf taxi uber total station autoroute repas restaurant'],
  ['Formation', 'formation cours udemy livre conférence atelier'],
  ['Sous-traitance', 'freelance sous-traitance prestataire malt fiverr'],
  ['Frais bancaires', 'banque frais bancaires commission stripe paypal qonto shine'],
  ['Impression & supports', 'impression carte nfc cartes de visite papier imprimerie vistaprint support'],
  ['Autre', ''],
]

export const seedCategories = (): Categorie[] => {
  const at = nowISO()
  return CATS.map(([nom, motsCles], i) => ({
    id: `cat-${i + 1}`,
    nom,
    motsCles,
    ordre: i,
    createdAt: at,
    createdBy: 'jeremy',
  }))
}

export const seedAbonnements = (): Abonnement[] => [
  {
    id: 'abo-figma',
    nom: 'Figma',
    fournisseur: 'Figma',
    montant: 0,
    frequence: 'annuel',
    prochainPrelevement: addMonths(today(), 1),
    actif: true,
    utilise: true,
    categorieId: 'cat-1',
    payePar: 'pro',
    notes: 'Licence partagée avec Matheis. Montant à compléter.',
    createdAt: nowISO(),
    createdBy: 'jeremy',
  },
]
