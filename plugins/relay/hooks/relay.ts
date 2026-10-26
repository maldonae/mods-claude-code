// Helpers purs, sans accès à `$`.
import { findInjection, maskSecrets, stripInvisible } from './guard.ts'

export const DEFAULT_THRESHOLD = 50
export const RELAY_DIR = '.claude/relay'
export const RESUME_HEADING = '## Prompt de reprise'

export const SECTIONS = [
  'Objectif global',
  'Contraintes permanentes',
  'Ce qui est déjà fait',
  'État actuel',
  'Décisions importantes',
  'Prochaines étapes',
  'Blocages éventuels',
] as const

/** Seuil entier entre 10 et 95 %, ou undefined si illisible. */
export const parseThreshold = (raw: string): number | undefined => {
  const n = Number(raw.trim().replace(/%$/, ''))
  if (!Number.isFinite(n) || raw.trim() === '') return undefined

  return Math.min(95, Math.max(10, Math.round(n)))
}

export type RelayCommand =
  | { kind: 'toggle' }
  | { kind: 'threshold'; value: number | undefined }
  | { kind: 'now' }
  | { kind: 'status' }
  | { kind: 'help' }

/** `/relay`, `/relay seuil 60`, `/relay maintenant`, `/relay statut`. */
export const parseCommand = (args: string): RelayCommand => {
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  switch (verb.toLowerCase()) {
    case '':
      return { kind: 'toggle' }
    case 'seuil':
    case 'threshold':
      return { kind: 'threshold', value: parseThreshold(rest.join(' ')) }
    case 'maintenant':
    case 'now':
      return { kind: 'now' }
    case 'statut':
    case 'status':
      return { kind: 'status' }
    default:
      return { kind: 'help' }
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `relay-YYYY-MM-DD-HHMM`, heure locale. */
export const baseName = (ms: number): string => {
  const d = new Date(ms)

  return `relay-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/** Premier chemin libre : `base.md`, puis `base-2.md`, `base-3.md`… jamais un fichier existant. */
export const freePath = async (
  base: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> => {
  for (let i = 1; i <= 99; i++) {
    const path = `${RELAY_DIR}/${base}${i === 1 ? '' : `-${i}`}.md`
    if (!(await exists(path))) return path
  }
  throw new Error(`plus de nom libre pour ${base}`)
}

export const buildForkPrompt = (path: string): string =>
  [
    'Passe le relais : la session va être reprise dans une nouvelle conversation qui ne verra rien de celle-ci.',
    `La fiche sera enregistrée dans ${path} (dossier courant).`,
    'Rédige une fiche de reprise en markdown, en français, factuelle et concise, à partir de toute la conversation ci-dessus.',
    '',
    'Format exact, rien avant ni après :',
    '# Relais',
    ...SECTIONS.map(s => `## ${s}`),
    RESUME_HEADING,
    '',
    'Règles :',
    '- Sous chaque section : des puces courtes ; « Aucun. » si vide.',
    '- Cite les chemins de fichiers, commandes et noms exacts utiles à la reprise.',
    '- N’inclus aucun secret (clé API, token, mot de passe, contenu de .env) : écris « [masqué] » à la place.',
    `- Sous « ${RESUME_HEADING} » : un seul bloc de code \`\`\`text contenant un prompt de reprise concis (10 lignes max) à coller dans une nouvelle session ; il demande de lire ${path}, résume l’objectif et la prochaine étape.`,
  ].join('\n')

/** Retire un éventuel ```markdown englobant. */
const unwrap = (text: string): string => {
  const t = text.trim()
  const m = /^```(?:markdown|md)?\n([\s\S]*)\n```$/.exec(t)

  return m?.[1]?.trim() ?? t
}

/** Extrait le prompt de reprise du bloc de code qui suit le titre, ou le texte brut à défaut. */
export const extractResume = (doc: string): string => {
  const at = doc.indexOf(RESUME_HEADING)
  if (at < 0) return ''
  const tail = doc.slice(at + RESUME_HEADING.length)
  const open = tail.indexOf('```')
  if (open < 0) return tail.trim()
  const start = tail.indexOf('\n', open)
  const close = tail.indexOf('```', start + 1)

  return (close < 0 ? tail.slice(start + 1) : tail.slice(start + 1, close)).trim()
}

/** La fiche est utilisable si toutes les sections sont là. */
export const isComplete = (doc: string): boolean =>
  SECTIONS.every(s => doc.includes(`## ${s}`)) && doc.includes(RESUME_HEADING)

/**
 * `masked` : secrets remplacés par « [masqué] » ; `suspect` : formulation d'injection trouvée
 * dans la fiche, qui sera lue par une nouvelle session (le prompt n'est alors pas copié).
 */
export type Sheet = { doc: string; resume: string; masked: number; suspect: string | undefined }

/** Fiche finale, sans invisibles ni secrets ; le prompt de reprise pointe toujours vers le fichier. */
export const finalize = (reply: string, path: string): Sheet | undefined => {
  const { text: doc, masked } = maskSecrets(stripInvisible(unwrap(reply)).text)
  if (!isComplete(doc)) return undefined
  const extracted = extractResume(doc)
  const pointer = `Lis d’abord ${path}.`
  const resume = extracted.includes(path) ? extracted : `${pointer}\n${extracted}`.trim()

  return { doc: `${doc}\n`, resume, masked, suspect: findInjection(doc) }
}

export const isOverThreshold = (percent: number | null, threshold: number): boolean =>
  percent !== null && percent >= threshold
