import {
  Addon, CommissionRule, Decision, FollowupStep, KpiWeek, Meeting, Objection, Offer, Partner, PartnerProfile, Post, ProductionStep,
  Project, Prospect, Question, Quote, Rule, Settings, Task, User, WeekMeta, WeekSlot, Followup, DmLog,
} from '../store/types'
import { addDays, mondayOf, today } from '../lib/dates'

const T = today()
const d = (n: number) => addDays(T, n)
const MON = mondayOf(T)

export const users: User[] = [
  { id: 'jeremy', name: 'Jérémy', role: 'Pôle Production', pole: 'Production', color: '#0071E3', initials: 'JV' },
  { id: 'matheis', name: 'Matheis', role: 'Pôle Acquisition', pole: 'Acquisition', color: '#C7C7CC', initials: 'MA' },
]

export const offers: Offer[] = [
  { id: 'essentiel', name: 'Essentiel', price: 990, priceLabel: '990 €', color: '#0071E3',
    content: 'Site une page premium, animation soignée, touche 3D, SEO local, formulaire, fiche Google Business, mise en ligne et domaine',
    audience: 'Artisan, petit commerce, indépendant qui part de rien' },
  { id: 'signature', name: 'Signature', price: 1890, priceLabel: '1 890 €', color: '#4DA3FF',
    content: '5 pages, animations et 3D poussées, SEO avancé avec balisage sectoriel, leviers de conversion, responsive travaillé, formation',
    audience: 'Commerce établi qui veut dominer sa recherche locale' },
  { id: 'surmesure', name: 'Sur-mesure', price: 3500, priceLabel: 'dès 3 500 €', color: '#BF5AF2',
    content: 'E-commerce, outil métier, application, intégrations. Devis après atelier de cadrage.',
    audience: 'Structure avec un vrai enjeu business en ligne' },
  { id: 'fidelite', name: 'Fidélité digitale', price: 300, priceLabel: '300 €', color: '#30D158',
    content: 'Carte de fidélité sans application (QR / NFC), propriété du commerçant.',
    audience: 'Commerce de passage qui veut faire revenir ses clients' },
  { id: 'nfc', name: 'NFC', price: 90, priceLabel: '90 €', color: '#FFD60A',
    content: 'Support NFC d’avis Google posé sur le comptoir.',
    audience: 'Add-on de closing' },
  { id: 'maintenance', name: 'Maintenance', price: 39, priceLabel: '39 €/mois', color: '#FF9F0A',
    content: 'Maintenance & sécurité mensuelle.',
    audience: 'Tout client livré' },
]

export const addons: Addon[] = [
  { id: 'a1', name: 'Fidélité digitale (QR / NFC)', price: '300 € une fois', pitch: '« Vos clients reviennent sans que vous ayez à y penser, et c’est à vous, pas en location. »' },
  { id: 'a2', name: 'Support NFC d’avis Google', price: '90 €', pitch: '« Le client pose son téléphone sur le comptoir, il laisse un avis. Votre référencement monte tout seul. »' },
  { id: 'a3', name: 'Maintenance & sécurité', price: '39 €/mois', pitch: '« Votre site reste à jour, en ligne, et je m’en occupe. »' },
  { id: 'a4', name: 'Gestion de contenu Instagram', price: '290 €/mois', pitch: '« Vous ne postez plus, on poste pour vous, dans votre univers. »' },
]

export const priceRules: Rule[] = [
  { id: 'pr1', text: 'Aucun devis sous 990 €.' },
  { id: 'pr2', text: '40 % à la commande et 60 % à la livraison.' },
  { id: 'pr3', text: 'Une remise ne se donne pas, elle s’échange : avis filmé, deux recommandations nominatives, droit d’utilisation en communication.' },
]

export const script = {
  title: 'Script porte-à-porte (45 secondes)',
  text: '« Bonjour, je ne vais pas vous déranger longtemps, je vois que vous avez du monde. Je suis [prénom], on est une petite agence de Sète, on fait les sites et les outils digitaux des commerces du coin — [citer deux commerces qu’ils connaissent]. Je vous laisse une carte. Si un jour vous vous dites que votre site mériterait mieux, ou que vous voulez que vos clients reviennent plus souvent, vous m’appelez. Bonne journée. »',
  note: 'Ne rien demander au premier passage. On plante une graine, on repasse trois semaines plus tard.',
}

export const objections: Objection[] = [
  { id: 'o1', objection: '« J’ai déjà un site »', answer: '« Tant mieux. Vous savez combien de personnes le trouvent chaque mois ? »' },
  { id: 'o2', objection: '« C’est trop cher »', answer: '« Sur combien de temps vous comptez le garder ? Trois ans ? Ça fait 27 € par mois. Votre terrasse, elle vous coûte combien par mois ? »' },
  { id: 'o3', objection: '« Je n’ai pas le temps »', answer: '« C’est exactement pour ça que ça se fait avec nous. 45 minutes en tout : une réunion au début, une validation à la fin. »' },
  { id: 'o4', objection: '« Mes clients me connaissent »', answer: '« Vos clients actuels, oui. Et les touristes qui cherchent sur leur téléphone à 19 h ? »' },
  { id: 'o5', objection: '« Je vais réfléchir »', answer: '« Vous réfléchissez à quoi précisément, au budget ou au moment ? »' },
  { id: 'o6', objection: '« Mon neveu peut me le faire »', answer: '« Il peut, sûrement. La vraie question c’est qui le met à jour dans six mois, et qui répond quand le site tombe un samedi de marché. »' },
]

export const followupSequence: FollowupStep[] = [
  { id: 'f1', day: 1, moment: 'J+1', channel: 'Mail', message: 'Le devis + un récap de ce qu’il a dit vouloir' },
  { id: 'f3', day: 3, moment: 'J+3', channel: 'SMS ou DM', message: '« Vous avez pu regarder ? Une question sur le devis ? »' },
  { id: 'f7', day: 7, moment: 'J+7', channel: 'Appel', message: 'Appel court — c’est celui qui débloque le plus de dossiers' },
  { id: 'f14', day: 14, moment: 'J+14', channel: 'Mail', message: 'Apport de valeur, pas de relance commerciale' },
  { id: 'f30', day: 30, moment: 'J+30', channel: 'Mail', message: '« Je clos le dossier de mon côté, dites-moi si je me trompe. »' },
]

export const rules: Rule[] = [
  { id: 'r1', text: 'Aucune tâche n’existe sans un nom et une date' },
  { id: 'r2', text: 'Le CRM est mis à jour dans les 10 minutes qui suivent le contact' },
  { id: 'r3', text: 'Toute promesse faite à un client est écrite dans le devis' },
  { id: 'r4', text: 'Deux allers-retours de modification inclus, le troisième est facturé' },
  { id: 'r5', text: 'On ne démarre pas sans acompte encaissé' },
  { id: 'r6', text: 'Le désaccord se règle en 48 h ou il monte au point hebdo' },
  { id: 'r7', text: 'Une décision prise est une décision qu’on applique, même si on n’était pas d’accord' },
]

export const productionSteps: ProductionStep[] = [
  'Brief client validé', 'Acompte 40 % encaissé', 'Questionnaire de découverte rempli', 'Moodboard / direction artistique validée',
  'Arborescence définie', 'Rédaction des contenus', 'Maquette page d’accueil validée', 'Maquettes pages secondaires', 'Développement',
  'Animations et 3D intégrées', 'Optimisation SEO local et balisage', 'Responsive et tests navigateurs', 'Nom de domaine et mise en ligne',
  'Fiche Google Business optimisée', 'Formation client + solde 60 % encaissé',
].map((label, i) => ({ id: `s${i + 1}`, label }))

export const partnerProfiles: PartnerProfile[] = [
  { id: 'pp1', label: 'Experts-comptables et cabinets', priority: 3 },
  { id: 'pp2', label: 'Imprimeurs et sérigraphes locaux', priority: 3 },
  { id: 'pp3', label: 'Grossistes et fournisseurs de commerces', priority: 3 },
  { id: 'pp4', label: 'Clients satisfaits', priority: 3 },
  { id: 'pp5', label: 'Photographes et vidéastes locaux', priority: 2 },
  { id: 'pp6', label: 'Agents immobiliers spécialisés commerce', priority: 2 },
  { id: 'pp7', label: 'Courtiers assurance pro / banquiers pro', priority: 2 },
  { id: 'pp8', label: 'Installateurs de caisses et TPE', priority: 2 },
  { id: 'pp9', label: 'Associations de commerçants', priority: 2 },
  { id: 'pp10', label: 'Coiffeurs, barbiers, bars', priority: 1 },
]

export const commissionRules: CommissionRule[] = [
  { id: 'c1', sold: 'Site Essentiel (990 €)', commission: '100 €' },
  { id: 'c2', sold: 'Site Signature (1 890 €)', commission: '190 €' },
  { id: 'c3', sold: 'Site Sur-mesure', commission: '10 %' },
  { id: 'c4', sold: 'Fidélité digitale (300 €)', commission: '50 €' },
  { id: 'c5', sold: 'Support NFC d’avis (90 €)', commission: '20 €' },
  { id: 'c6', sold: 'Maintenance mensuelle', commission: '10 % pendant 12 mois' },
  { id: 'c7', sold: 'Bonus « RDV organisé »', commission: '+ 5 %' },
]

export const partnerRules: Rule[] = [
  { id: 'pk1', text: 'Payer sous 7 jours après encaissement' },
  { id: 'pk2', text: 'Tenir informé même quand ça ne se conclut pas' },
  { id: 'pk3', text: 'Relancer une fois par mois' },
]
export const partnerWarning = 'L’apporteur doit pouvoir facturer. Pour les professions réglementées (experts-comptables, notaires, avocats), privilégier la recommandation réciproque sans rémunération.'

export const weekMeta: WeekMeta[] = [
  { week: 1, title: 'Fondations', goal: 'Le système est prêt à tirer dimanche soir' },
  { week: 2, title: 'Ouverture des vannes', goal: '100 contacts sortants' },
  { week: 3, title: 'Conversion', goal: 'Transformer les contacts en RDV et en devis' },
  { week: 4, title: 'Livraison et bilan', goal: 'Livrer, demander, mesurer' },
]

const tk = (week: 1 | 2 | 3 | 4, title: string, assignee: Task['assignee'], deadline: string, volume = ''): Task => ({
  id: `t-${week}-${title.slice(0, 18).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  title, week, assignee, deadline, volume, done: false, createdAt: T, source: 'planning',
})

export const tasks: Task[] = [
  tk(1, 'Figer la grille tarifaire publique (3 formules + add-ons)', 'both', 'Mardi'),
  tk(1, 'Refonte du profil Instagram : bio, photo, 3 stories à la une', 'insta', 'Mercredi'),
  tk(1, 'Produire et programmer les 8 premiers posts', 'insta', 'Dimanche'),
  tk(1, 'Rédiger le contrat d’apporteur d’affaires', 'jeremy', 'Jeudi'),
  tk(1, 'Créer le kit apporteur : PDF une page + lien de recommandation', 'jeremy', 'Vendredi'),
  tk(1, 'Constituer la liste de 100 prospects (Google Maps, Bassin de Thau)', 'matheis', 'Jeudi'),
  tk(1, 'Finaliser l’outil de DM Instagram', 'jeremy', 'Dimanche'),
  tk(1, 'Monter 2 études de cas avant/après', 'jeremy', 'Dimanche'),
  tk(1, 'Vérifier le questionnaire de découverte et la génération du PDF', 'jeremy', 'Vendredi'),

  tk(2, 'DM Instagram personnalisés', 'matheis', 'Tous les jours', '5 / jour'),
  tk(2, 'Appels sortants sur la liste des 100', 'matheis', 'Vendredi', '15'),
  tk(2, 'Terrain : porte-à-porte commerces', 'both', 'Mercredi', '1 après-midi, 10 commerces'),
  tk(2, 'Publications Instagram', 'insta', 'Dimanche', '3 posts + stories'),
  tk(2, 'Premiers contacts apporteurs', 'matheis', 'Vendredi', '5 personnes'),
  tk(2, 'Production des chantiers en cours', 'jeremy', 'Dimanche', '—'),

  tk(3, 'Relancer tous les contacts de la semaine 2 (J+3 puis J+7)', 'matheis', 'Dimanche', '100 %'),
  tk(3, 'RDV de découverte', 'matheis', 'Vendredi', '5'),
  tk(3, 'Devis envoyés sous 24 h après le RDV', 'matheis', 'Vendredi', '3'),
  tk(3, 'Publier la première étude de cas complète', 'insta', 'Jeudi', '1 post + 1 reel'),
  tk(3, 'Signer les 3 premiers contrats d’apporteurs', 'matheis', 'Dimanche', '3'),
  tk(3, 'Démarrer la production des projets signés', 'jeremy', 'Lundi', '—'),
  tk(3, 'DM Instagram (on ne coupe jamais le robinet)', 'matheis', 'Tous les jours', '5 / jour'),

  tk(4, 'Livrer les projets + formation client', 'jeremy', 'Vendredi', 'Tous'),
  tk(4, 'Demander avis Google et recommandation nominative', 'deliverer', 'À chaque livraison', '100 %'),
  tk(4, 'Filmer une livraison pour en faire un reel', 'insta', 'Vendredi', '1'),
  tk(4, 'Relance des devis non signés', 'matheis', 'Jeudi', 'Tous'),
  tk(4, 'Bilan chiffré du mois + plan du mois suivant', 'both', 'Dimanche', '1 session 90 min'),
]

export const weekSlots: WeekSlot[] = [
  { id: 'ws1', slot: 'Lundi soir — 1 h', activity: 'Point hebdo à deux' },
  { id: 'ws2', slot: 'Tous les jours — 30 min', activity: 'DM Instagram + relances' },
  { id: 'ws3', slot: 'Mercredi après-midi', activity: 'Terrain' },
  { id: 'ws4', slot: 'Soirs de semaine — 2 h', activity: 'Production' },
  { id: 'ws5', slot: 'Samedi matin — 2 h', activity: 'Création de contenu (batch)' },
  { id: 'ws6', slot: 'Dimanche — 30 min', activity: 'Programmation + mise à jour CRM' },
]

const po = (week: 1 | 2 | 3 | 4, format: Post['format'], subject: string, pillar: Post['pillar'], i: number): Post => ({
  id: `p${i}`, week, format, subject, pillar, status: 'À produire', publishDate: null, link: '', reach: 0, interactions: 0, messages: 0, createdAt: T,
})
export const posts: Post[] = [
  po(1, 'Carrousel', 'Le site d’Au Bon Pain, avant / après — 6 slides, un chiffre à la fin', 'Preuve', 1),
  po(1, 'Reel', '3 raisons pour lesquelles votre commerce n’apparaît pas sur Google', 'Pédagogie', 2),
  po(1, 'Carrousel', 'Qui on est — Jérémy et Matheis, l’agence, le territoire (à épingler)', 'Coulisses', 3),
  po(1, 'Reel', 'Timelapse d’une maquette qui se construit', 'Coulisses', 4),
  po(2, 'Carrousel', 'Combien coûte vraiment un site pour un commerce ?', 'Offre', 5),
  po(2, 'Reel', 'Le détail que 90 % des sites de commerçants oublient (fiche Google Business)', 'Pédagogie', 6),
  po(2, 'Carrousel', 'Avant / après Boucherie Vatuone', 'Preuve', 7),
  po(2, 'Reel', 'Une journée à Sète pour livrer un site', 'Local', 8),
  po(3, 'Carrousel', 'Étude de cas complète : problème → action → résultat chiffré', 'Preuve', 9),
  po(3, 'Reel', 'La carte de fidélité sans application, en 30 secondes', 'Offre', 10),
  po(3, 'Carrousel', '5 erreurs qui font fuir un client de votre site en 3 secondes', 'Pédagogie', 11),
  po(3, 'Reel', 'Réaction d’un client qui découvre son site en direct', 'Preuve', 12),
  po(4, 'Carrousel', 'Ce mois-ci chez MJAGENCY — récap des livraisons', 'Coulisses', 13),
  po(4, 'Reel', 'Pourquoi on refuse certains projets', 'Pédagogie', 14),
  po(4, 'Carrousel', 'Les commerces du Bassin de Thau qu’on aime (5 commerces identifiés)', 'Local', 15),
  po(4, 'Reel', 'Appel à l’action : 2 places en octobre', 'Offre', 16),
]
// Give the first posts a published state so the pillar donut has something to show.
posts[0].status = 'Publié'; posts[0].publishDate = d(-6); posts[0].reach = 1240; posts[0].interactions = 86; posts[0].messages = 3
posts[1].status = 'Publié'; posts[1].publishDate = d(-4); posts[1].reach = 2870; posts[1].interactions = 142; posts[1].messages = 5
posts[2].status = 'Programmé'; posts[2].publishDate = d(1)
posts[3].status = 'Produit'

export const decisions: Decision[] = [
  { id: 'd1', text: 'Aucune nouvelle verticale pendant 4 semaines', done: false },
  { id: 'd2', text: 'Produit d’appel acté : la fidélité digitale à 300 €', done: false },
  { id: 'd3', text: 'Les cartes NFC deviennent un add-on de closing, pas une offre autonome', done: false },
  { id: 'd4', text: 'Grille tarifaire figée et affichée : 990 / 1 890 / dès 3 500 €', done: false },
  { id: 'd5', text: 'Propriétaire du pôle Acquisition', done: false, field: 'text', fieldLabel: 'Nom', value: '' },
  { id: 'd6', text: 'Propriétaire du pôle Production', done: false, field: 'text', fieldLabel: 'Nom', value: '' },
  { id: 'd7', text: 'Pilote Instagram', done: false, field: 'text', fieldLabel: 'Nom', value: '' },
  { id: 'd8', text: 'Taux de commission apporteur, payé sous 7 jours', done: false, field: 'text', fieldLabel: '%', value: '' },
  { id: 'd9', text: 'Liste de 10 apporteurs potentiels écrite', done: false },
  { id: 'd10', text: 'Point hebdo calé dans les deux agendas', done: false, field: 'text', fieldLabel: 'Jour', value: '', field2: 'text', fieldLabel2: 'Heure', value2: '' },
]

const Q = (theme: string, list: string[]): Question[] =>
  list.map((text, i) => ({ id: `q-${theme[0]}-${i + 1}`, theme, text, answer: '', status: 'Non traitée', decidedAt: null }))
export const questions: Question[] = [
  ...Q('A. Sur nous deux', [
    'Est-ce qu’on veut la même chose (revenu d’appoint, vraie entreprise, tremplin) ?',
    'Combien d’heures chacun met réellement, et est-ce qu’on assume l’écart ?',
    'Comment on se répartit l’argent, et est-ce écrit ?',
    'Que se passe-t-il si l’un veut arrêter dans six mois — qui garde les clients, le nom, le code, les domaines ?',
    'Qu’est-ce que chacun attend de l’autre sans l’avoir dit ?',
    'Qui décide en cas de désaccord total ?',
  ]),
  ...Q('B. Sur l’argent et la structure', [
    'Notre statut tient-il si le CA double ? Où en est le seuil de franchise de TVA (art. 293 B) ?',
    'Comment Matheis est rémunéré juridiquement ?',
    'Faut-il créer une société à deux, et quel est le déclencheur ?',
    'Combien coûte réellement l’agence par mois ?',
    'Quel est notre taux horaire réel une fois le temps de production divisé ?',
    'Quelle part de l’argent qui rentre est réinvestie ?',
  ]),
  ...Q('C. Sur l’offre', [
    'Agence de sites ou agence d’outils digitaux ?',
    'Quel client on ne veut plus jamais prendre ?',
    'Veut-on vraiment monter à 5 000-10 000 € le projet, et qu’est-ce qui doit changer pour ça ?',
    'Notre production tiendrait-elle devant un client à 10 000 € ?',
    'Récurrent ou projet ponctuel ?',
    'Combien de projets simultanés sans dégrader la qualité ?',
  ]),
  ...Q('D. Sur les clients', [
    'Pourquoi ceux qui ont dit non ont dit non ?',
    'Demande-t-on systématiquement avis et recommandation ?',
    'Que fait-on des anciens clients ?',
    'Y a-t-il un client qui prend trop de temps pour ce qu’il rapporte ?',
    'Les proches sont-ils facturés au prix normal ?',
  ]),
  ...Q('E. Sur le temps', [
    'Quelle tâche prend le plus de temps et rapporte le moins ?',
    'Construit-on trop d’outils internes par rapport au temps passé à vendre ?',
    'Comment gère-t-on les périodes d’examens ?',
    'Le réseau professionnel quotidien est-il exploité ou subi ?',
    'À quelle date décide-t-on si l’agence devient l’activité principale ?',
  ]),
  ...Q('F. Sur la marque', [
    'Passe-t-on pour chers ou pas chers, et est-ce voulu ?',
    'Le logo : on le refait, on le fait refaire, ou on arrête d’en parler ?',
    'Assume-t-on de montrer nos visages ?',
    'Nos livrables se ressemblent-ils trop ?',
  ]),
  ...Q('G. Sur le risque', [
    'Que se passe-t-il si un outil clé ferme ou change ses prix ?',
    'Les clients sont-ils propriétaires de leur nom de domaine ?',
    'Y a-t-il des sauvegardes ailleurs qu’à un seul endroit ?',
    'A-t-on des CGV écrites ?',
    'Que fait-on si un client refuse de payer le solde ou demande un remboursement ?',
  ]),
  ...Q('H. Dans douze mois', [
    'Combien de clients, quel CA mensuel, quelle part de récurrent ?',
    'Reste-t-on à deux ou fait-on entrer quelqu’un ?',
    'Quelle est la seule réussite qui rendrait tout le reste plus facile ?',
    'Qu’est-ce qu’on fait aujourd’hui qu’on devra arrêter de faire ?',
  ]),
]

export const settings: Settings = {
  agency: {
    name: 'MJAGENCY',
    address: '54 rue Marceau, 34200 Sète',
    siret: '992 328 120 00017',
    email: 'jeremyvatuonepro@gmail.com',
    phone: '06 11 71 83 68',
    vat: 'TVA non applicable, art. 293 B du CGI',
    terms: '40 % à la commande, 60 % à la livraison.',
    revisions: 'Deux allers-retours de modification inclus, le troisième est facturé.',
    instagram: '@mjagency',
  },
  pipelineStages: ['À contacter', 'Contacté', 'Conversation engagée', 'RDV planifié', 'Devis envoyé', 'Gagné', 'Perdu'],
  productionSteps,
  kpiTargets: { contacts: 50, conversations: 12, meetings: 3, quotes: 2, sales: 1, posts: 4, partners: 1 },
  capMessage: 'Une seule offre poussée à fond. Aucune nouvelle verticale pendant 4 semaines.',
  instaBio: 'MJAGENCY — Sites & outils digitaux pour les commerces du Bassin de Thau 🌊\nSète · Frontignan · Mèze · Marseillan\n2 places par mois. On vous montre avant / après ↓',
  dmStructure: '1. Observation vraie — un détail précis vu sur son compte ou en boutique.\n2. Constat factuel — ce qui manque ou ce qui coince, sans jugement.\n3. Valeur gratuite — une idée, un chiffre, une piste actionnable tout de suite.\n4. Question fermée — une seule question à laquelle on répond par oui ou non.',
  dmTemplate: 'Bonjour [prénom], je suis passé devant [commerce] samedi, la vitrine [détail vrai] donne vraiment envie. Par contre en cherchant « [activité] Sète » sur Google, vous n’apparaissez qu’en 2e page. Un simple ajustement de votre fiche Google Business peut changer ça en une semaine — je peux vous envoyer les 3 points à corriger, ça vous intéresse ?',
  dmTargetPerDay: 5,
  rhythm: '2 carrousels + 1 à 2 reels par semaine · 3 à 5 stories par jour',
  currentUser: 'jeremy',
}

// ————————————————————————————————————————————————————————————————
// Sample business data (deletable): a few prospects, two delivered clients,
// quotes, partners and KPI history so the cockpit is readable on day one.
// ————————————————————————————————————————————————————————————————

const pr = (p: Partial<Prospect> & Pick<Prospect, 'business' | 'city' | 'stage' | 'assignee'>): Prospect => ({
  id: 'pr-' + p.business.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  contactFirst: '', contactLast: '', phone: '', email: '', instagram: '', sector: '', source: 'Terrain', partnerId: null,
  offerId: 'essentiel', amount: 990, lastContact: null, nextFollowup: null, notes: '', objectionId: null, createdAt: d(-20),
  ...p,
})

export const prospects: Prospect[] = [
  pr({ business: 'La Cave des Halles', city: 'Sète', sector: 'Caviste', stage: 'À contacter', assignee: 'matheis', source: 'Terrain', instagram: '@lacavedeshalles', createdAt: d(-2) }),
  pr({ business: 'Boulangerie du Port', city: 'Frontignan', sector: 'Boulangerie', stage: 'À contacter', assignee: 'matheis', source: 'DM Instagram', createdAt: d(-1) }),
  pr({ business: 'Le Barbier de Mèze', city: 'Mèze', sector: 'Barbier', stage: 'Contacté', assignee: 'matheis', source: 'DM Instagram', instagram: '@lebarbierdemeze', lastContact: d(-9), nextFollowup: d(0), notes: 'Vu en story, a liké notre carrousel avant/après.' }),
  pr({ business: 'Poissonnerie Marius', city: 'Marseillan', sector: 'Poissonnerie', stage: 'Contacté', assignee: 'matheis', source: 'Appel', contactFirst: 'Marius', contactLast: 'Roux', lastContact: d(-2), nextFollowup: d(1) }),
  pr({ business: 'Institut Bleu Lagune', city: 'Balaruc-les-Bains', sector: 'Institut de beauté', stage: 'Conversation engagée', assignee: 'matheis', source: 'Recommandation client', contactFirst: 'Sophie', contactLast: 'Martin', phone: '06 00 00 00 00', lastContact: d(-3), nextFollowup: d(2), offerId: 'signature', amount: 1890, notes: 'Recommandée par Au Bon Pain. Veut une prise de RDV en ligne.' }),
  pr({ business: 'Ostréiculture Tarbouriech Jr', city: 'Bouzigues', sector: 'Ostréiculteur', stage: 'Conversation engagée', assignee: 'matheis', source: 'Terrain', lastContact: d(-12), nextFollowup: d(-5), offerId: 'surmesure', amount: 3500, objectionId: 'o5', notes: 'Veut vendre en ligne. « Je vais réfléchir » — relancer sur le budget ou le moment.' }),
  pr({ business: 'Café de la Marine', city: 'Sète', sector: 'Bar / Café', stage: 'RDV planifié', assignee: 'matheis', source: 'Terrain', contactFirst: 'Karim', contactLast: 'Benali', lastContact: d(-1), nextFollowup: d(3), offerId: 'fidelite', amount: 300, notes: 'RDV jeudi 15 h au comptoir. Intéressé par la fidélité digitale.' }),
  pr({ business: 'Garage Poussan Auto', city: 'Poussan', sector: 'Garage', stage: 'Devis envoyé', assignee: 'matheis', source: 'Apporteur', partnerId: 'pa-1', contactFirst: 'Luc', contactLast: 'Fabre', lastContact: d(-4), nextFollowup: d(3), offerId: 'essentiel', amount: 990, objectionId: 'o2' }),
  pr({ business: 'Fleuriste Les Jardins de Thau', city: 'Gigean', sector: 'Fleuriste', stage: 'Devis envoyé', assignee: 'matheis', source: 'Entrant', contactFirst: 'Claire', contactLast: 'Dumas', email: 'contact@jardinsdethau.fr', lastContact: d(-8), nextFollowup: d(-1), offerId: 'signature', amount: 1890 }),
  pr({ business: 'Au Bon Pain', city: 'Sète', sector: 'Boulangerie', stage: 'Gagné', assignee: 'jeremy', source: 'Terrain', offerId: 'signature', amount: 1890, lastContact: d(-30), createdAt: d(-70), wonAt: d(-45) }),
  pr({ business: 'Boucherie Vatuone', city: 'Sète', sector: 'Boucherie', stage: 'Gagné', assignee: 'jeremy', source: 'Recommandation client', offerId: 'essentiel', amount: 990, lastContact: d(-15), createdAt: d(-50), wonAt: d(-25) }),
  pr({ business: 'Pizzeria Da Marco', city: 'Frontignan', sector: 'Restaurant', stage: 'Perdu', assignee: 'matheis', source: 'DM Instagram', offerId: 'essentiel', amount: 990, lastContact: d(-20), objectionId: 'o6', notes: 'Le neveu va le faire. Repasser dans 3 mois.' }),
]

const steps = (n: number) => Object.fromEntries(productionSteps.map((s, i) => [s.id, i < n]))

export const projects: Project[] = [
  {
    id: 'pj-au-bon-pain', client: 'Au Bon Pain', contact: 'Nadia Perez', phone: '', email: '', city: 'Sète', offerId: 'signature', amount: 1890,
    depositPaid: true, balancePaid: true, deliveryDate: d(-12), deliveredAt: d(-12), domain: 'auboncpain-sete.fr', url: 'https://auboncpain-sete.fr',
    reviewAsked: true, referralObtained: true, addons: ['Support NFC d’avis Google', 'Maintenance & sécurité'], steps: steps(15), assignee: 'jeremy', partnerId: null,
    paidAt: d(-12), notes: 'Livré. Recommandation : Institut Bleu Lagune.', createdAt: d(-45),
  },
  {
    id: 'pj-boucherie-vatuone', client: 'Boucherie Vatuone', contact: 'Michel Vatuone', phone: '', email: '', city: 'Sète', offerId: 'essentiel', amount: 990,
    depositPaid: true, balancePaid: true, deliveryDate: d(-3), deliveredAt: d(-3), domain: 'boucherie-vatuone.fr', url: 'https://boucherie-vatuone.fr',
    reviewAsked: false, referralObtained: false, addons: ['Fidélité digitale (QR / NFC)'], steps: steps(15), assignee: 'jeremy', partnerId: 'pa-1',
    paidAt: d(-3), notes: '', createdAt: d(-25),
  },
  {
    id: 'pj-cafe-marine', client: 'Le Fournil de Balaruc', contact: 'Julie Roca', phone: '', email: '', city: 'Balaruc-le-Vieux', offerId: 'essentiel', amount: 990,
    depositPaid: true, balancePaid: false, deliveryDate: d(12), deliveredAt: null, domain: '', url: '',
    reviewAsked: false, referralObtained: false, addons: [], steps: steps(6), assignee: 'jeremy', partnerId: null,
    paidAt: null, notes: 'Acompte encaissé le ' + d(-5) + '. Contenus en cours de rédaction.', createdAt: d(-5),
  },
]

export const quotes: Quote[] = [
  { id: 'qt-1', number: 'DEV-2026-007', client: 'Garage Poussan Auto', clientAddress: 'Poussan', clientEmail: '', prospectId: 'pr-garage-poussan-auto', offerId: 'essentiel',
    lines: [{ id: 'l1', label: 'Site Essentiel — une page premium, SEO local, fiche Google Business, mise en ligne', qty: 1, unitPrice: 990 }],
    sentAt: d(-4), nextFollowup: d(3), status: 'Relancé', notes: '', validityDays: 30, createdAt: d(-4) },
  { id: 'qt-2', number: 'DEV-2026-008', client: 'Fleuriste Les Jardins de Thau', clientAddress: 'Gigean', clientEmail: 'contact@jardinsdethau.fr', prospectId: 'pr-fleuriste-les-jardins-de-thau', offerId: 'signature',
    lines: [{ id: 'l1', label: 'Site Signature — 5 pages, SEO avancé, formation', qty: 1, unitPrice: 1890 }, { id: 'l2', label: 'Support NFC d’avis Google', qty: 1, unitPrice: 90 }],
    sentAt: d(-8), nextFollowup: d(-1), status: 'Envoyé', notes: '', validityDays: 30, createdAt: d(-8) },
  { id: 'qt-3', number: 'DEV-2026-006', client: 'Le Fournil de Balaruc', clientAddress: 'Balaruc-le-Vieux', clientEmail: '', prospectId: null, offerId: 'essentiel',
    lines: [{ id: 'l1', label: 'Site Essentiel', qty: 1, unitPrice: 990 }],
    sentAt: d(-7), nextFollowup: null, status: 'Signé', notes: '', validityDays: 30, createdAt: d(-7), signedAt: d(-5) },
  { id: 'qt-4', number: 'DEV-2026-005', client: 'Pizzeria Da Marco', clientAddress: 'Frontignan', clientEmail: '', prospectId: 'pr-pizzeria-da-marco', offerId: 'essentiel',
    lines: [{ id: 'l1', label: 'Site Essentiel', qty: 1, unitPrice: 990 }],
    sentAt: d(-24), nextFollowup: null, status: 'Refusé', notes: 'Le neveu.', validityDays: 30, createdAt: d(-24) },
]

export const partners: Partner[] = [
  { id: 'pa-1', name: 'Cabinet Comptable Thau Expertise', profile: 'Experts-comptables et cabinets', canInvoice: true, priority: 3, status: 'Actif', commissionRate: 10,
    contactsBrought: 3, revenueGenerated: 990, commissionsDue: 100, commissionsPaid: 0, lastFollowup: d(-6), dueSince: d(-9), phone: '', email: '', notes: 'Nous a amené la Boucherie Vatuone et le garage de Poussan.', createdAt: d(-40) },
  { id: 'pa-2', name: 'Imprimerie Sétoise', profile: 'Imprimeurs et sérigraphes locaux', canInvoice: true, priority: 3, status: 'Contrat signé', commissionRate: 10,
    contactsBrought: 0, revenueGenerated: 0, commissionsDue: 0, commissionsPaid: 0, lastFollowup: d(-35), dueSince: null, phone: '', email: '', notes: 'Kit apporteur envoyé.', createdAt: d(-38) },
  { id: 'pa-3', name: 'Studio Photo Lagune', profile: 'Photographes et vidéastes locaux', canInvoice: true, priority: 2, status: 'Contacté', commissionRate: 10,
    contactsBrought: 0, revenueGenerated: 0, commissionsDue: 0, commissionsPaid: 0, lastFollowup: d(-3), dueSince: null, phone: '', email: '', notes: '', createdAt: d(-5) },
]

const kw = (offset: number, v: Partial<KpiWeek>): KpiWeek => ({
  id: 'kw-' + addDays(MON, -7 * offset), weekStart: addDays(MON, -7 * offset),
  contacts: 0, conversations: 0, meetings: 0, quotes: 0, sales: 0, revenue: 0, delivered: 0, posts: 0, partners: 0, note: '', ...v,
})
export const kpiWeeks: KpiWeek[] = [
  kw(4, { contacts: 22, conversations: 6, meetings: 1, quotes: 1, sales: 0, revenue: 756, delivered: 0, posts: 2, partners: 0 }),
  kw(3, { contacts: 31, conversations: 8, meetings: 2, quotes: 1, sales: 1, revenue: 396, delivered: 0, posts: 3, partners: 1 }),
  kw(2, { contacts: 44, conversations: 10, meetings: 2, quotes: 2, sales: 0, revenue: 1134, delivered: 1, posts: 3, partners: 0 }),
  kw(1, { contacts: 38, conversations: 12, meetings: 3, quotes: 2, sales: 1, revenue: 594, delivered: 1, posts: 4, partners: 1, note: 'Bonne semaine terrain, 2 devis sortis en 24 h.' }),
]

export const followups: Followup[] = [
  { id: 'fu-1', prospectId: 'pr-garage-poussan-auto', quoteId: 'qt-1', title: 'Garage Poussan Auto — J+1', channel: 'Mail', message: followupSequence[0].message, dueDate: d(-3), done: true, assignee: 'matheis', createdAt: d(-4) },
  { id: 'fu-2', prospectId: 'pr-garage-poussan-auto', quoteId: 'qt-1', title: 'Garage Poussan Auto — J+3', channel: 'SMS ou DM', message: followupSequence[1].message, dueDate: d(-1), done: true, assignee: 'matheis', createdAt: d(-4) },
  { id: 'fu-3', prospectId: 'pr-garage-poussan-auto', quoteId: 'qt-1', title: 'Garage Poussan Auto — J+7', channel: 'Appel', message: followupSequence[2].message, dueDate: d(3), done: false, assignee: 'matheis', createdAt: d(-4) },
  { id: 'fu-4', prospectId: 'pr-garage-poussan-auto', quoteId: 'qt-1', title: 'Garage Poussan Auto — J+14', channel: 'Mail', message: followupSequence[3].message, dueDate: d(10), done: false, assignee: 'matheis', createdAt: d(-4) },
  { id: 'fu-5', prospectId: 'pr-garage-poussan-auto', quoteId: 'qt-1', title: 'Garage Poussan Auto — J+30', channel: 'Mail', message: followupSequence[4].message, dueDate: d(26), done: false, assignee: 'matheis', createdAt: d(-4) },
  { id: 'fu-6', prospectId: 'pr-fleuriste-les-jardins-de-thau', quoteId: 'qt-2', title: 'Fleuriste Les Jardins de Thau — J+1', channel: 'Mail', message: followupSequence[0].message, dueDate: d(-7), done: true, assignee: 'matheis', createdAt: d(-8) },
  { id: 'fu-7', prospectId: 'pr-fleuriste-les-jardins-de-thau', quoteId: 'qt-2', title: 'Fleuriste Les Jardins de Thau — J+3', channel: 'SMS ou DM', message: followupSequence[1].message, dueDate: d(-5), done: true, assignee: 'matheis', createdAt: d(-8) },
  { id: 'fu-8', prospectId: 'pr-fleuriste-les-jardins-de-thau', quoteId: 'qt-2', title: 'Fleuriste Les Jardins de Thau — J+7', channel: 'Appel', message: followupSequence[2].message, dueDate: d(-1), done: false, assignee: 'matheis', createdAt: d(-8) },
  { id: 'fu-9', prospectId: 'pr-fleuriste-les-jardins-de-thau', quoteId: 'qt-2', title: 'Fleuriste Les Jardins de Thau — J+14', channel: 'Mail', message: followupSequence[3].message, dueDate: d(6), done: false, assignee: 'matheis', createdAt: d(-8) },
  { id: 'fu-10', prospectId: 'pr-fleuriste-les-jardins-de-thau', quoteId: 'qt-2', title: 'Fleuriste Les Jardins de Thau — J+30', channel: 'Mail', message: followupSequence[4].message, dueDate: d(22), done: false, assignee: 'matheis', createdAt: d(-8) },
  { id: 'fu-11', prospectId: 'pr-le-barbier-de-meze', quoteId: null, title: 'Le Barbier de Mèze — relance DM', channel: 'DM Instagram', message: 'Relancer avec le carrousel avant/après.', dueDate: d(0), done: false, assignee: 'matheis', createdAt: d(-9) },
]

export const dmLogs: DmLog[] = [
  { date: d(-4), count: 5 }, { date: d(-3), count: 6 }, { date: d(-2), count: 5 }, { date: d(-1), count: 5 },
]

export const meetings: Meeting[] = [
  {
    id: 'mt-1', weekStart: addDays(MON, -7), kpiWeekId: 'kw-' + addDays(MON, -7),
    numbers: '38 contacts, 12 conversations, 3 RDV, 2 devis, 1 vente. CA encaissé 594 €.',
    blockers: { jeremy: 'Contenus du Fournil de Balaruc en retard côté client.', matheis: 'Peu de réponses aux appels en matinée.' },
    priorities: { jeremy: ['Maquette accueil Fournil', 'Kit apporteur PDF', 'Étude de cas Au Bon Pain'], matheis: ['25 DM', 'Relances devis Garage + Fleuriste', 'RDV Café de la Marine'] },
    unsaid: 'On passe trop de temps sur les outils internes.',
    decisions: ['Appels sortants l’après-midi uniquement.', 'Étude de cas Au Bon Pain publiée cette semaine.'],
    actions: [
      { id: 'ma-1', title: 'Envoyer le kit apporteur à l’Imprimerie Sétoise', assignee: 'jeremy', due: d(2) },
      { id: 'ma-2', title: 'Relancer le Fleuriste par téléphone', assignee: 'matheis', due: d(-1) },
    ],
    postponed: ['Refonte du logo'],
    createdAt: addDays(MON, -7),
  },
]

export const seed = {
  users, offers, addons, priceRules, script, objections, followupSequence, rules, productionSteps, partnerProfiles, commissionRules,
  partnerRules, partnerWarning, weekMeta, tasks, weekSlots, posts, decisions, questions, settings, prospects, projects, quotes, partners, kpiWeeks,
  followups, dmLogs, meetings,
}
