// Fonctions pures de refactor : aucune ne reçoit `$`, toutes se testent seules.
import type { Issue, KnipItem, KnipStatus, Risk, Run, Step, StepKind, StepStatus, TestState } from '../types'

export const PLAN_TOOL = 'mcp__refactor__plan'
export const STEP_TOOL = 'mcp__refactor__step'
export const DEFAULT_GOAL = 'améliorer la lisibilité, la maintenabilité et la testabilité, sans changer le comportement'
export const KNIP_INSTALL = ['npm install -D knip', 'npx knip init'] as const

// ——— Arguments de /refactor ———

export type Command =
  | { kind: 'start'; target: string; goal: string; isPlanOnly: boolean }
  | { kind: 'go' }
  | { kind: 'skip' }
  | { kind: 'stop' }
  | { kind: 'status' }
  | { kind: 'help' }

/** Mots séparés par des espaces, un chemin entre guillemets restant d'un seul tenant. */
export function words(args: string): string[] {
  return [...args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

export function parseCommand(args: string): Command {
  const all = words(args.trim())
  const isPlanOnly = all.includes('--plan-only')
  const rest = all.filter(w => w !== '--plan-only')
  const first = rest[0]
  if (first === undefined) return { kind: 'help' }
  if (rest.length === 1 && !isPlanOnly) {
    const verb = first.toLowerCase()
    if (['go', 'ok', 'valider', 'confirmer', 'reprendre'].includes(verb)) return { kind: 'go' }
    if (['passer', 'skip'].includes(verb)) return { kind: 'skip' }
    if (['stop', 'annuler', 'arreter', 'arrêter'].includes(verb)) return { kind: 'stop' }
    if (['statut', 'status'].includes(verb)) return { kind: 'status' }
    if (['aide', 'help', '--help'].includes(verb)) return { kind: 'help' }
  }
  return { kind: 'start', target: first, goal: rest.slice(1).join(' '), isPlanOnly }
}

// ——— Chemins ———

const isAbsolute = (p: string): boolean => /^([A-Za-z]:)?\//.test(p)

/** Chemin absolu, `/` partout, sans `.`, `..` ni `/` final. */
export function resolvePath(cwd: string, path: string): string {
  const raw = path.replace(/\\/g, '/')
  const full = isAbsolute(raw) ? raw : `${cwd.replace(/\\/g, '/')}/${raw}`
  const out: string[] = []
  for (const part of full.split('/')) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..') {
      if (out.length > 1) out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/') || '/'
}

// Windows ne distingue pas la casse : on compare en minuscules.
const key = (p: string): string => p.toLowerCase()

export function isInside(file: string, dir: string): boolean {
  return key(file) === key(dir) || key(file).startsWith(`${key(dir)}/`)
}

// ——— Secrets ———

const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i

export function isForbiddenFile(path: string): boolean {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path
  if (/^\.env(\..+)?$/i.test(base)) return !ENV_TEMPLATE.test(base)
  return /\.(key|pem|p12|pfx)$/i.test(base)
}

const SECRETS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'clé AWS'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'jeton GitHub'],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{20,}/, 'clé API (sk-…)'],
  [/\b[rs]k_live_[A-Za-z0-9]{16,}/, 'clé Stripe live'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'jeton Slack'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'clé Google API'],
  [/(api[_-]?key|secret|passw(or)?d|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'secret en clair'],
]

/** Le type du premier secret reconnu dans `text`, jamais sa valeur. */
export function secretIn(text: string): string | null {
  return SECRETS.find(([re]) => re.test(text))?.[1] ?? null
}

// ——— Knip ———

/** Knip est-il là ? D'après le package.json (dépendances) et `node_modules/.bin`. */
export function knipStatusOf(packageJson: string | null, hasBin: boolean): KnipStatus {
  if (packageJson === null) return 'none'
  if (hasBin) return 'detected'
  try {
    const parsed: unknown = JSON.parse(packageJson)
    if (typeof parsed !== 'object' || parsed === null) return 'missing'
    const p = parsed as Record<string, unknown>
    const has = (field: string): boolean => {
      const deps = p[field]
      return typeof deps === 'object' && deps !== null && 'knip' in deps
    }
    return has('devDependencies') || has('dependencies') ? 'detected' : 'missing'
  } catch {
    return 'missing'
  }
}

// Knip sous toutes ses formes : `knip`, `npx knip`, `npm run knip`, `npm exec knip`,
// `./node_modules/.bin/knip`, `knip.cmd`, `knip@5`, entre guillemets ou non.
const KNIP = /(^|[\s/"'`=])knip(\.cmd|@[\w.^~-]+)?(?=$|[\s"'`])/
const KNIP_FIX = /(^|[\s"'`=])--(fix|fix-type|allow-remove-files)(?=$|[\s"'`=])/

// `<<` ouvre un heredoc, pas `<<<` (here-string). Le délimiteur doit finir sur un blanc ou un
// opérateur : `<<'EOF'x` (délimiteur réel `EOFx`) n'est pas reconnu, son corps reste analysé.
const HEREDOC = /(?<!<)<<-?[ \t]*(?:'(\w+)'|"(\w+)"|(\w+))(?=$|[\s;&|()<>])/g
// Chaînes et commentaires : un `<<` qui s'y trouve n'ouvre rien.
const INERT = /"(?:[^"\\]|\\.)*"|'[^']*'|(?<![^\s;&|(])#.*$/g

/** Les heredocs ouverts sur `line` (dans l'ordre) et la ligne avec ses ouvertures remplacées. */
function openers(line: string): { text: string; delimiters: string[] } {
  const inert = [...line.matchAll(INERT)].map(m => [m.index, m.index + m[0].length] as const)
  const delimiters: string[] = []
  const text = line.replace(HEREDOC, (match: string, q1?: string, q2?: string, bare?: string, at = 0) => {
    if (inert.some(([start, end]) => at >= start && at < end)) return match
    delimiters.push(q1 ?? q2 ?? bare ?? '')
    return '<<heredoc'
  })
  return { text, delimiters }
}

/** L'index qui suit le dernier délimiteur, ou -1 si un heredoc n'est pas fermé. */
function bodyEnd(lines: readonly string[], start: number, delimiters: readonly string[]): number {
  let j = start
  for (const d of delimiters) {
    while (j < lines.length && lines[j]?.trim() !== d) j += 1
    if (j === lines.length) return -1
    j += 1
  }
  return j
}

/**
 * La commande sans le corps de ses heredocs (message de commit…), lue ligne par ligne.
 * Le reste de la ligne d'ouverture est gardé (`cat <<EOF > f` reste une écriture) ;
 * un heredoc sans délimiteur de fin est gardé tel quel.
 */
export function withoutHeredocs(command: string): string {
  const lines = command.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const opened = openers(line)
    const next = opened.delimiters.length > 0 ? bodyEnd(lines, i + 1, opened.delimiters) : -1
    // Heredocs fermés : on saute leurs corps et leurs délimiteurs.
    out.push(next < 0 ? line : opened.text)
    i = next < 0 ? i + 1 : next
  }
  return out.join('\n')
}

/** Les commandes simples (entre `;`, `&`, `|` et retours à la ligne) qui lancent Knip. */
function knipRuns(command: string): string[] {
  return withoutHeredocs(command)
    .split(/[;&|\n]/)
    .filter(part => KNIP.test(part))
}

/** `knip --fix` (et `--allow-remove-files`) : jamais lancé par Claude, à tout moment. */
export function knipFixVerdict(command: string): string | null {
  if (!knipRuns(command).some(run => KNIP_FIX.test(run))) return null
  return 'knip --fix / --allow-remove-files modifie ou supprime des fichiers : jamais sans validation explicite (l’utilisateur peut le lancer lui-même)'
}

/** Pendant un refactor : Knip ne tourne qu'installé, et `knip init` (qui écrit une configuration) jamais. */
export function knipRunVerdict(command: string, status: KnipStatus): string | null {
  if (/\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b[^;&|\n]*\bknip\b/.test(withoutHeredocs(command))) {
    return `installer Knip modifie le projet : propose à l’utilisateur ${KNIP_INSTALL.map(c => `\`${c}\``).join(' puis ')}, sans les exécuter`
  }
  const runs = knipRuns(command)
  if (runs.length === 0) return null
  if (runs.some(run => /\bknip(@\S+)?["'`]?\s+["'`]?init\b/.test(run))) {
    return '`npx knip init` écrit une configuration : propose-le à l’utilisateur sans l’exécuter'
  }
  if (status !== 'detected') {
    return `Knip n’est pas installé : propose à l’utilisateur ${KNIP_INSTALL.map(c => `\`${c}\``).join(' puis ')}, sans les exécuter`
  }
  return null
}

// Ce qui rend une suppression risquée : un usage par un framework, une configuration, un test,
// un script, un entry point ou un import dynamique. « non utilisé par les tests » n'en est pas un.
const HIGH_RISK = /framework|config\w*|\btests?\b|\bspec\b|\bscripts?\b|entry\s*points?|points?\s+d['’]entrée|dynami\w*|plugin|route|middleware/gi
const NEGATION = /\b(non|pas|aucun\w*|ni|jamais|not|never|no|nor|unused)\b[^.;,]{0,25}$/i

/** Un usage à risque élevé est nommé dans `reason`, sans négation juste avant (« ni la config »). */
export function isHighRiskReason(reason: string): boolean {
  return [...reason.matchAll(HIGH_RISK)].some(m => !NEGATION.test(reason.slice(0, m.index)))
}

const KNIP_ORDER: Record<StepKind, number> = { refactor: 0, 'knip-export': 1, 'knip-dependency': 2, 'knip-file': 3 }

// ——— Commandes shell pendant un refactor ———

// Irréversibles ou publiées : jamais sans validation explicite.
const DANGEROUS: readonly [RegExp, string][] = [
  [/\bgit\b[^;&|\n]*\s(commit|push)\b/, 'git commit / push'],
  [/\bgit\b[^;&|\n]*\sreset\b[^;&|\n]*--hard\b/, 'git reset --hard'],
  [/\bgit\b[^;&|\n]*\s(clean|rm|restore|stash)\b/, 'git clean / rm / restore / stash'],
  [/\bgit\b[^;&|\n]*\scheckout\b[^;&|\n]*\s--(\s|$)/, 'git checkout --'],
  [/(^|[;&|(]\s*|\s)(rm|rmdir|del|erase|rd|unlink|shred|rimraf)\s/i, 'suppression de fichier'],
  [/\bRemove-Item\b|\bri\s/i, 'suppression de fichier'],
]

// Une redirection vers un fichier, guillemets retirés d'abord (`grep "<Button>"` n'en est pas une) :
// `>`, `>>`, `1>`, `2>`, `&>` ; mais pas `2>&1`, `> /dev/null`, `=>`, `->`, `>=`.
const REDIRECT = /(^|[^=\-<>])(\d|&)?>{1,2}(?![=&>])\s*(?!\/dev\/null\b|nul\b|\$null\b)[^\s;&|)]/i
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g

// Écrivent sur le disque hors Edit/Write : les vérifications du mod ne les verraient pas.
const WRITES: readonly [RegExp, string][] = [
  [/\b(sed|perl)\s+(-\w*\s+)*-i/, 'édition en place (sed/perl -i)'],
  [/(^|\s)--(fix|write)(\s|=|$)/, 'outil qui réécrit des fichiers (--fix, --write)'],
  // En position de commande seulement : `grep black` reste une lecture.
  [
    /(^|[;&|(]\s*|(npx|bunx|pnpm\s+(exec|dlx)|yarn(\s+dlx)?)\s+)(oxfmt|dprint\s+fmt|gofmt\s+-w|black|ruff\s+format|rustfmt)\b/,
    'formateur qui réécrit des fichiers',
  ],
  [/\b(npm|pnpm|yarn|bun)\s+(run\s+)?(format|fmt|fix|lint:fix|format:fix)\b/, 'script qui réécrit des fichiers'],
  [/writeFile|appendFile|createWriteStream|copyFile|unlinkSync|rmSync|\.write_text|\.write_bytes|open\([^)]*["'][wax]\+?["']/, 'script qui écrit ou supprime des fichiers'],
  [/(^|[;&|(]\s*|\s)(tee|mv|cp|touch|mkdir|truncate|install)\s/, 'écriture de fichier'],
  [/\bgit\b[^;&|\n]*\s(apply|am|checkout|switch|merge|rebase|cherry-pick|revert|mv)\b/, 'commande git qui modifie les fichiers'],
  [/\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|rm|uninstall|un|update|up)\b/, 'changement de dépendances'],
  [/\b(Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Rename-Item|Clear-Content)\b/i, 'écriture de fichier (PowerShell)'],
]

/** Pourquoi une commande est refusée pendant un refactor, ou null si elle peut tourner (lecture, tests, knip). */
export function shellVerdict(command: string, knipStatus: KnipStatus = 'detected'): string | null {
  const fix = knipFixVerdict(command)
  if (fix) return fix
  const knip = knipRunVerdict(command, knipStatus)
  if (knip) return knip
  const danger = DANGEROUS.find(([re]) => re.test(command))
  if (danger) return `${danger[1]} : jamais sans validation explicite de l'utilisateur`
  const write = WRITES.find(([re]) => re.test(command))
  if (write) return `${write[1]} : pendant un refactor, les fichiers se modifient avec Edit ou Write uniquement`
  if (REDIRECT.test(withoutHeredocs(command).replace(QUOTED, '""'))) {
    return 'redirection vers un fichier : pendant un refactor, les fichiers se modifient avec Edit ou Write uniquement'
  }
  return null
}

/**
 * La seule suppression permise : celle d'une étape Knip que l'utilisateur a confirmée, en une commande
 * simple qui ne nomme que les fichiers (knip-file) ou les paquets (knip-dependency) de l'étape.
 */
export function isConfirmedRemoval(command: string, run: Run, cwd: string): boolean {
  const step = run.steps[run.current]
  if (run.phase !== 'applying' || !step || !step.isConfirmed || /[;&|`$<>(){}\n]/.test(command)) return false
  const tokens = words(command.trim())
  if (step.kind === 'knip-file') {
    const args = tokens[0] === 'git' && tokens[1] === 'rm' ? tokens.slice(2) : tokens[0] === 'rm' ? tokens.slice(1) : null
    if (args === null) return false
    const paths = args.filter(t => !['-f', '-q', '--'].includes(t))
    if (paths.length === 0 || paths.some(t => t.startsWith('-'))) return false
    const allowed = new Set(step.files.map(f => key(resolvePath(cwd, f))))
    return paths.every(p => allowed.has(key(resolvePath(cwd, p))))
  }
  if (step.kind === 'knip-dependency') {
    if (!['npm', 'pnpm', 'yarn', 'bun'].includes(tokens[0] ?? '')) return false
    if (!['uninstall', 'remove', 'rm', 'un'].includes(tokens[1] ?? '')) return false
    const names = tokens.slice(2).filter(t => !['-D', '--save-dev', '-w', '--workspace-root'].includes(t))
    if (names.length === 0 || names.some(t => t.startsWith('-'))) return false
    return names.every(n => step.knip.includes(n))
  }
  return false
}

// ——— Ce que Claude remonte par les outils ———

const RISKS: readonly Risk[] = ['faible', 'moyen', 'élevé']
const TEST_STATES: readonly TestState[] = ['OK', 'échec', 'non exécutés']
const KINDS: readonly StepKind[] = ['refactor', 'knip-export', 'knip-dependency', 'knip-file']
const KNIP_KINDS: readonly KnipItem['kind'][] = ['fichier', 'export', 'dépendance', 'manquante']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(s => s !== '') : [])

function riskOf(v: unknown): Risk {
  const s = str(v).toLowerCase()
  if (s === 'eleve' || s === 'high' || s === 'élevé') return 'élevé'
  if (s === 'medium' || s === 'moyen') return 'moyen'
  if (s === 'low' || s === 'faible') return 'faible'
  return RISKS.includes(s as Risk) ? (s as Risk) : 'moyen'
}

/** Les résultats Knip qu'une référence d'étape désigne : `nom`, ou `fichier:nom` quand le nom est ambigu. */
export function knipMatches(items: readonly KnipItem[], ref: string): KnipItem[] {
  return items.filter(k => ref === k.name || ref === `${k.file}:${k.name}`)
}

/** Un résultat Knip ; un usage par framework, configuration, test, script, entry point ou import dynamique est toujours à risque élevé. */
export function knipItemOf(raw: Record<string, unknown>): KnipItem | null {
  const name = str(raw.name)
  if (name === '') return null
  const kind = KNIP_KINDS.find(k => k === str(raw.kind).toLowerCase()) ?? 'export'
  const reason = str(raw.reason)
  const risk = isHighRiskReason(reason) ? 'élevé' : riskOf(raw.risk)
  return { kind, name, file: str(raw.file), risk, reason }
}

export type PlanInput = {
  steps: Step[]
  issues: Issue[]
  knip: KnipItem[]
  hasTests: boolean
  testCommand: string | null
}

export function parsePlan(input: unknown): PlanInput | string {
  if (!isObject(input)) return 'entrée invalide : un objet est attendu'
  if (!Array.isArray(input.steps) || input.steps.length === 0) return '`steps` doit contenir au moins une étape'
  const knip = (Array.isArray(input.knip) ? input.knip : [])
    .filter(isObject)
    .map(knipItemOf)
    .filter((k): k is KnipItem => k !== null)
  const steps: Step[] = []
  let lastKnip = 0
  for (const [i, raw] of input.steps.entries()) {
    if (!isObject(raw) || str(raw.title) === '') return `étape ${i + 1} : \`title\` manquant`
    const kind = KINDS.find(k => k === str(raw.kind)) ?? 'refactor'
    if (kind !== 'refactor') {
      if (KNIP_ORDER[kind] < lastKnip) {
        return `étape ${i + 1} : les nettoyages Knip vont dans l’ordre exports, puis dépendances, puis fichiers`
      }
      lastKnip = KNIP_ORDER[kind]
    }
    const refs = strs(raw.knip)
    const step: Step = {
      title: str(raw.title),
      kind,
      files: strs(raw.files),
      risk: riskOf(raw.risk),
      tests: strs(raw.tests),
      knip: refs,
      status: 'todo',
      testState: 'non exécutés',
      isConfirmed: kind === 'refactor',
    }
    // Un nettoyage prend le risque le plus haut de ses résultats Knip (homonymes compris).
    const itemRisks = refs.flatMap(r => knipMatches(knip, r).map(k => k.risk))
    if (itemRisks.includes('élevé')) step.risk = 'élevé'
    else if (itemRisks.includes('moyen') && step.risk === 'faible') step.risk = 'moyen'
    if (kind === 'knip-file' && step.risk === 'élevé') {
      return `étape ${i + 1} : suppression d’un fichier à risque élevé (framework, configuration, test, script, entry point ou import dynamique) — retire-le de l’étape et laisse-le dans \`knip\` comme « à analyser »`
    }
    steps.push(step)
  }
  const issues = (Array.isArray(input.issues) ? input.issues : []).filter(isObject).map(i => ({
    kind: str(i.kind),
    file: str(i.file),
    detail: str(i.detail),
  }))
  const command = str(input.testCommand)
  return { steps, issues, knip, hasTests: input.hasTests === true, testCommand: command === '' ? null : command }
}

export type StepReport = { step: number; status: 'ok' | 'échec' | 'annulée'; tests: TestState; note: string }

export function parseStepReport(input: unknown): StepReport | string {
  if (!isObject(input)) return 'entrée invalide : un objet est attendu'
  const step = typeof input.step === 'number' ? input.step : Number(input.step)
  const status = str(input.status).toLowerCase()
  if (!Number.isInteger(step) || step < 1) return '`step` : numéro d’étape (1, 2, …) attendu'
  if (status !== 'ok' && status !== 'échec' && status !== 'annulée') return '`status` : "ok", "échec" ou "annulée"'
  const tests = TEST_STATES.find(t => t.toLowerCase() === str(input.tests).toLowerCase()) ?? 'non exécutés'
  return { step, status, tests, note: str(input.note) }
}

/** Statut d'une étape d'après le rapport : un « ok » avec des tests en échec reste un échec. */
export function statusOf(report: StepReport): StepStatus {
  if (report.status === 'annulée') return 'reverted'
  return report.status === 'ok' && report.tests !== 'échec' ? 'done' : 'failed'
}

/** Un nettoyage Knip pas encore confirmé par l'utilisateur. */
export function needsConfirmation(step: Step | undefined): boolean {
  return step !== undefined && step.kind !== 'refactor' && !step.isConfirmed
}

// ——— Textes pour Claude ———

const RULES = [
  'Règles du mod refactor :',
  '- Ne touche jamais aux fichiers .env, *.key, *.pem, *.p12 ni à un fichier qui contient un secret.',
  '- Pas de git commit, git push, git reset --hard, git restore/checkout ni suppression de fichier : demande à l’utilisateur.',
  '- Jamais `npx knip --fix` ni `--allow-remove-files` : ils sont bloqués.',
  '- Modifie les fichiers avec Edit ou Write uniquement (les écritures par le shell sont bloquées).',
].join('\n')

function knipSection(status: KnipStatus): string[] {
  if (status === 'none') return ['Knip : pas de package.json, Knip ne s’applique pas.']
  const rules = [
    'Classe chaque résultat Knip par risque :',
    '- faible : export ou dépendance clairement inutilisé ;',
    '- moyen : usage dynamique, entry point ou import indirect possible ;',
    '- élevé : fichier ou dépendance utilisé par un framework, un test, une configuration, un script ou un import dynamique. Ne propose pas sa suppression sans analyse supplémentaire.',
    'Passe-les dans `knip` (kind « fichier », « export », « dépendance » ou « manquante », name, file, risk, reason).',
    'Nettoyages : des étapes séparées de kind « knip-export », puis « knip-dependency », puis « knip-file », dans cet ordre, chacune listant ses résultats dans `knip`. Chacune sera confirmée par l’utilisateur avant d’être appliquée.',
  ]
  if (status === 'missing') {
    return [
      `Knip : non installé. Ne le lance pas. Propose à l’utilisateur, sans les exécuter : \`${KNIP_INSTALL[0]}\` puis \`${KNIP_INSTALL[1]}\`.`,
    ]
  }
  return [
    'Knip : installé. Exécute `npx knip` (lecture seule, jamais `--fix`) et intègre ses résultats au plan : fichiers inutilisés, exports inutilisés, dépendances inutilisées, dépendances manquantes ou fantômes.',
    ...rules,
  ]
}

export function analysisPrompt(run: Pick<Run, 'target' | 'goal' | 'isPlanOnly' | 'knipStatus'>): string {
  return [
    `[refactor] Analyse de refactorisation de \`${run.target}\` — lecture seule.`,
    `Objectif : ${run.goal || DEFAULT_GOAL}.`,
    `Mode : ${run.isPlanOnly ? 'plan seul (--plan-only), aucune modification ; Knip ne sert qu’au rapport et au plan' : 'plan d’abord, application seulement après validation'}.`,
    '',
    '1. Lis la cible (Read, Grep, Glob). Ne modifie aucun fichier : les écritures sont bloquées tant que le plan n’est pas validé.',
    '2. Repère : fonctions trop longues ou complexes, duplication, responsabilités mélangées, noms peu clairs, code mort, dépendances inutiles, manque de testabilité, risques de régression.',
    '3. Détecte les tests existants (scripts du package.json, dossiers de tests, pytest, go test…) et la commande qui les lance.',
    ...knipSection(run.knipStatus).map(l => `   ${l}`),
    `4. Appelle l’outil ${PLAN_TOOL} : étapes petites, isolées et vérifiables, classées par priorité, chacune avec ses fichiers, son risque (faible, moyen, élevé) et les tests à lancer ou à créer. Si aucun test n’existe, mets en premier une étape de tests de caractérisation.`,
    '5. Présente ensuite le rapport dans le chat.',
    '',
    RULES,
  ].join('\n')
}

export function planReply(run: Run): string {
  const n = run.steps.length
  const cleanups = run.steps.filter(s => s.kind !== 'refactor').length
  const lines = [`Plan enregistré : ${n} étape(s), dont ${cleanups} nettoyage(s) Knip.`]
  lines.push('Présente-le clairement dans le chat : pour chaque étape, priorité, fichiers, risque et tests à lancer après.')
  if (run.knip.length > 0) {
    lines.push('Ajoute le rapport Knip : fichiers, exports, dépendances inutilisés et dépendances manquantes, avec leur risque.')
  }
  if (run.knipStatus === 'missing') {
    lines.push(`Knip n’est pas installé : propose \`${KNIP_INSTALL[0]}\` puis \`${KNIP_INSTALL[1]}\`, sans les exécuter.`)
  }
  if (!run.hasTests) {
    lines.push(
      'Aucun test détecté : préviens l’utilisateur et propose de créer d’abord des tests de caractérisation, avant toute refactorisation.',
    )
  }
  if (run.isPlanOnly) {
    lines.push(
      'Mode plan seul : ne modifie aucun fichier. Propose aussi les tests à créer ou à exécuter.',
      `Termine ta réponse exactement par : ${PLAN_ONLY_END(run.target)}`,
    )
  } else {
    lines.push(
      'Puis ARRÊTE-TOI : n’applique rien. L’utilisateur valide avec le bouton « Valider le plan » ou la commande /refactor go.',
      'Chaque nettoyage Knip demandera en plus sa propre confirmation au moment de l’appliquer.',
    )
  }
  return lines.join('\n')
}

function kindInstructions(step: Step): string[] {
  const names = step.knip.length > 0 ? step.knip.join(', ') : 'les résultats Knip de l’étape'
  switch (step.kind) {
    case 'knip-export':
      return [`1. Retire uniquement les exports inutilisés confirmés (${names}) avec Edit : le mot-clé export, ou le code s’il est mort.`]
    case 'knip-dependency':
      return [
        `1. Retire uniquement ces dépendances : ${names}, avec \`npm uninstall <noms>\` (ou pnpm/yarn remove), en une commande qui ne nomme qu’elles.`,
      ]
    case 'knip-file':
      return [`1. Supprime uniquement ces fichiers, confirmés : ${step.files.join(', ')}, avec \`git rm <fichiers>\` ou \`rm <fichiers>\`.`]
    default:
      return ['1. Fais le plus petit changement possible, avec Edit ou Write, sur ces fichiers (ou d’autres fichiers sous la cible).']
  }
}

export function stepPrompt(run: Run, index: number): string {
  const step = run.steps[index]
  if (!step) return ''
  const tests = step.tests.length > 0 ? step.tests.join(' ; ') : 'les tests du projet'
  return [
    `[refactor] Applique UNIQUEMENT l’étape ${index + 1}/${run.steps.length} : ${step.title}`,
    `Fichiers : ${step.files.length > 0 ? step.files.join(', ') : `sous ${run.target}`}`,
    `Risque : ${step.risk}`,
    ...(step.knip.length > 0 ? [`Résultats Knip : ${step.knip.join(', ')}`] : []),
    `Tests après l’étape : ${tests}${run.testCommand ? ` (commande : ${run.testCommand})` : ''}`,
    '',
    ...kindInstructions(step),
    '2. Montre un diff clair de l’étape (`git diff -- <fichiers>` ou extraits avant/après).',
    '3. Relance les tests disponibles.',
    '4. S’ils échouent : corrige, ou annule l’étape en remettant le contenu d’origine avec Edit.',
    `5. Appelle ${STEP_TOOL} avec { step: ${index + 1}, status: "ok" | "échec" | "annulée", tests: "OK" | "échec" | "non exécutés", note }.`,
    '',
    RULES,
  ].join('\n')
}

/** Ce qu'un nettoyage Knip va retirer, pour la demande de confirmation. */
export function cleanupLabel(step: Step): string {
  const what = step.kind === 'knip-file' ? step.files : step.knip
  const noun = step.kind === 'knip-export' ? 'export(s)' : step.kind === 'knip-dependency' ? 'dépendance(s)' : 'fichier(s)'
  return `${what.length} ${noun} : ${what.join(', ') || '—'}`
}

export function confirmReply(run: Run, index: number): string {
  const step = run.steps[index]
  return [
    `L’étape ${index + 1}/${run.steps.length} est un nettoyage Knip (${step ? cleanupLabel(step) : ''}) : elle attend la confirmation explicite de l’utilisateur.`,
    'Présente précisément ce qui sera supprimé (noms, fichiers, risque) puis ARRÊTE-TOI. Il confirme avec /refactor go, passe l’étape avec /refactor passer, ou arrête avec /refactor stop.',
  ].join('\n')
}

export function summaryReply(run: Run): string {
  const done = run.steps.filter(s => s.status === 'done')
  const skipped = run.steps.filter(s => s.status === 'skipped')
  return [
    `Toutes les étapes sont traitées (${done.length}/${run.steps.length} faites${skipped.length > 0 ? `, ${skipped.length} passée(s)` : ''}).`,
    'Affiche le résumé final dans le chat :',
    `- étapes réalisées : ${done.map(s => s.title).join(' ; ') || 'aucune'}`,
    `- fichiers modifiés : ${run.modified.join(', ') || 'aucun'}`,
    `- tests exécutés : ${run.steps.map((s, i) => `${i + 1} ${s.testState}`).join(', ')}`,
    '- risques restants (dont les résultats Knip à risque élevé non traités) et recommandations de revue (à toi de les formuler).',
    'Ne committe pas : propose à l’utilisateur de relire le diff puis de committer lui-même.',
  ].join('\n')
}

export function pausedReply(run: Run, index: number): string {
  return [
    `Étape ${index + 1}/${run.steps.length} arrêtée : la suite n’est pas appliquée.`,
    'Explique à l’utilisateur ce qui a échoué et ce que tu as annulé, puis arrête-toi.',
    'Il reprendra l’étape avec /refactor go, ou arrêtera avec /refactor stop.',
  ].join('\n')
}

export const PLAN_ONLY_END = (target: string): string =>
  `Plan généré. Lance /refactor ${target} sans --plan-only pour appliquer les changements.`

// ——— Gardes ———

/** Phases où le mod garde les fichiers. */
export function isGuarded(run: Run | null): run is Run {
  return run !== null && ['analysing', 'awaiting', 'applying', 'confirming', 'paused', 'planned'].includes(run.phase)
}

/** Pourquoi une écriture sur `fileAbs` est refusée (hors secret, vérifié à part), ou null. */
export function writeVerdict(run: Run, fileAbs: string, cwd: string): string | null {
  if (isForbiddenFile(fileAbs)) return 'fichier sensible (.env, *.key, *.pem, *.p12) : jamais modifié par refactor'
  if (run.phase === 'planned') return 'mode --plan-only : aucun fichier ne doit être modifié'
  if (run.phase === 'analysing' || run.phase === 'awaiting') {
    return 'le plan n’est pas encore validé par l’utilisateur (/refactor go ou le bouton « Valider le plan »)'
  }
  if (run.phase === 'confirming') return 'nettoyage Knip pas encore confirmé par l’utilisateur (/refactor go)'
  if (run.phase === 'paused') return 'refactor en pause après un échec : attends que l’utilisateur relance avec /refactor go'
  const step = run.steps[run.current]
  const isPlanned = step?.files.some(f => key(resolvePath(cwd, f)) === key(fileAbs)) ?? false
  if (isPlanned || isInside(fileAbs, run.targetAbs)) return null
  return `fichier hors de l’étape en cours et hors de ${run.target} : demande d’abord à l’utilisateur`
}

export const RISK_COLOR: Record<Risk, 'success' | 'warning' | 'error'> = {
  faible: 'success',
  moyen: 'warning',
  élevé: 'error',
}

export const STATUS_LABEL: Record<StepStatus, string> = {
  todo: '○ en attente',
  running: '▶ en cours',
  done: '✓ terminée',
  failed: '✖ échec',
  reverted: '↺ annulée',
  skipped: '⤼ passée',
}
