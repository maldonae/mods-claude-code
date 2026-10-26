// Fonctions pures de qa-guardian : aucune ne reçoit `$`, toutes se testent seules.
import type { CheckId, Finding, Level, Report, Scope } from '../types'

export const REPORT_FILE = 'qa-report.md'

/** Fichiers interdits au commit : leur contenu n'est jamais lu (exclus du diff). */
export const FORBIDDEN_PATHSPECS = [
  ':(exclude,glob)**/.env',
  ':(exclude,glob)**/.env.*',
  ':(exclude,glob)**/*.key',
  ':(exclude,glob)**/*.pem',
]

const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i

export function baseOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function isForbiddenFile(path: string): boolean {
  const base = baseOf(path)
  if (/^\.env(\..+)?$/i.test(base)) return !ENV_TEMPLATE.test(base)
  return /\.(key|pem)$/i.test(base)
}

/** Fichiers qui ne devraient presque jamais partir dans un commit. */
const UNINTENDED: readonly [RegExp, string][] = [
  [/(^|\/)node_modules\//, 'dépendances installées'],
  [/(^|\/)(dist|build|out|\.next|coverage)\//, 'sortie de build ou de couverture'],
  [/\.log$/i, 'fichier de log'],
  [/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i, 'fichier système'],
  [/\.(tmp|swp|swo|bak|orig)$/i, 'fichier temporaire'],
  [/(^|\/)qa-report\.md$/, 'rapport qa-guardian'],
]

export const LARGE_COMMIT = 30

// Les crochets ([D], [M]) évitent que ce fichier se signale lui-même.
const TODO = /\b(TO[D]O|FIX[M]E)\b/

type SecretRule = { re: RegExp; label: string; level: Level }

const SECRETS: readonly SecretRule[] = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'clé privée', level: 'block' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'clé AWS', level: 'block' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, label: 'jeton GitHub', level: 'block' },
  { re: /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/, label: 'clé API (sk-…)', level: 'block' },
  { re: /\b[rs]k_live_[A-Za-z0-9]{16,}/, label: 'clé Stripe live', level: 'block' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, label: 'jeton Slack', level: 'block' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'clé Google API', level: 'block' },
  {
    re: /(api[_-]?key|secret|passw(or)?d|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    label: 'secret en clair (affectation)',
    level: 'block',
  },
  // Les clés anon Supabase sont des JWT publics : avertissement seulement.
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, label: 'JWT', level: 'warn' },
]

export type AddedLine = { file: string; line: number; text: string }

/** Lignes ajoutées d'un `git diff -U0`, avec leur fichier et leur numéro. */
export function parseDiff(diff: string): AddedLine[] {
  const added: AddedLine[] = []
  let file = ''
  let line = 0
  // Un `+++ ` n'est un en-tête qu'entre `diff --git` et le premier `@@` : ailleurs, c'est une ligne ajoutée.
  let isHeader = false
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      isHeader = true
      file = ''
      continue
    }
    if (isHeader && raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^"(.*)"$/, '$1')
      file = path.startsWith('b/') ? path.slice(2) : ''
      continue
    }
    const hunk = /^@@ -\S+ \+(\d+)/.exec(raw)
    if (hunk) {
      isHeader = false
      line = Number(hunk[1])
      continue
    }
    if (!isHeader && file && raw.startsWith('+')) {
      added.push({ file, line, text: raw.slice(1) })
      line += 1
    }
  }
  return added
}

/** Toutes les lignes d'un fichier non suivi, comme si elles étaient ajoutées. */
export function linesOf(file: string, text: string): AddedLine[] {
  return text.split('\n').map((t, i) => ({ file, line: i + 1, text: t }))
}

/** Secrets et TODO dans les lignes ajoutées. La valeur trouvée n'est jamais recopiée. */
export function scanLines(lines: readonly AddedLine[]): Finding[] {
  const found: Finding[] = []
  for (const { file, line, text } of lines) {
    const rule = SECRETS.find(s => s.re.test(text))
    if (rule) found.push({ check: 'secrets', level: rule.level, message: `${file}:${line} — ${rule.label}` })
    const todo = TODO.exec(text)
    if (todo) found.push({ check: 'todo', level: 'warn', message: `${file}:${line} — ${todo[1]} non résolu` })
  }
  return found
}

export function checkFiles(files: readonly string[], unstaged: readonly string[] = []): Finding[] {
  const found: Finding[] = []
  for (const file of files) {
    if (isForbiddenFile(file)) {
      found.push({ check: 'secrets', level: 'block', message: `${file} — fichier sensible (.env, *.key, *.pem)` })
      continue
    }
    const hit = UNINTENDED.find(([re]) => re.test(file))
    if (hit) found.push({ check: 'files', level: 'warn', message: `${file} — ${hit[1]}` })
  }
  if (files.length > LARGE_COMMIT) {
    found.push({ check: 'files', level: 'warn', message: `${files.length} fichiers dans le commit : vérifier qu'ils sont tous voulus` })
  }
  if (unstaged.length > 0) {
    const list = unstaged.slice(0, 5).join(', ') + (unstaged.length > 5 ? '…' : '')
    found.push({ check: 'files', level: 'info', message: `${unstaged.length} fichier(s) modifié(s) hors commit : ${list}` })
  }
  return found
}

/** Noms de fichiers de `git diff --name-only` / `git ls-files`, une ligne chacun. */
export function splitNames(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(s => s.trim())
    .filter(s => s !== '')
}

/** Dernières lignes utiles d'une sortie de test ou de lint, pour le rapport. */
export function tail(output: string, count = 3): string {
  const lines = output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s !== '')
  return lines.slice(-count).join(' │ ').slice(0, 300)
}

export function worst(findings: readonly Finding[]): Report['level'] {
  if (findings.some(f => f.level === 'block')) return 'block'
  return findings.some(f => f.level === 'warn') ? 'warn' : 'ok'
}

// `git commit`, y compris `git -C dir commit` ou `git -c k=v commit`, pas `git log --grep commit`.
const GIT_OPTS = String.raw`((?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*)`
const COMMIT = new RegExp(String.raw`\bgit${GIT_OPTS}\s+commit\b(.*)$`)
// Commandes qui changent l'index avant le commit, dans la même ligne (`git add -A && git commit`).
const STAGES = new RegExp(String.raw`\bgit${GIT_OPTS}\s+(add|rm|mv|stage)\b`)
const CD = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*$/
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g

// Options de `git commit` dont la valeur est le jeton suivant (pas un chemin).
const LONG_WITH_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message',
  '--fixup', '--squash', '--cleanup', '--trailer', '--pathspec-from-file',
])
const SHORT_WITH_VALUE = 'mFCct'

export type CommitIntent = { scope: Scope; cwd?: string } | null

const unquote = (s: string): string => s.replace(/^(["'])(.*)\1$/, '$2')
const isAbsolute = (p: string): boolean => /^([A-Za-z]:)?[\\/]/.test(p)
const joinPath = (base: string | undefined, p: string): string =>
  base === undefined || isAbsolute(p) ? p : `${base}/${p}`

type CommitArgs = { isAll: boolean; hasPaths: boolean }

// Les messages entre guillemets sont vidés d'abord : `-m "use -a"` ne vaut pas `-a`.
function commitArgs(rest: string): CommitArgs {
  const tokens = rest.replace(QUOTED, '""').split(/\s+/).filter(Boolean)
  let isAll = false
  let hasPaths = false
  let isValueNext = false
  let isAfterDashes = false
  for (const t of tokens) {
    if (/^\d*[<>|]/.test(t)) break
    if (isValueNext) {
      isValueNext = false
    } else if (isAfterDashes) {
      hasPaths = true
    } else if (t === '--') {
      isAfterDashes = true
    } else if (t.startsWith('--')) {
      if (t === '--all') isAll = true
      if (t === '--include' || t === '--only' || t.startsWith('--pathspec-from-file')) hasPaths = true
      isValueNext = LONG_WITH_VALUE.has(t)
    } else if (t.startsWith('-') && t.length > 1) {
      for (const [i, ch] of [...t.slice(1)].entries()) {
        if (ch === 'a') isAll = true
        if (SHORT_WITH_VALUE.includes(ch)) {
          isValueNext = i === t.length - 2
          break
        }
      }
    } else {
      hasPaths = true
    }
  }
  return { isAll, hasPaths }
}

/**
 * Ce que `command` committerait : `staged` (l'index), `all` (`-a` ou des chemins nommés),
 * `worktree` (un `git add`/`rm`/`mv` le précède dans la même ligne, l'index n'est pas encore rempli).
 * `cwd` suit `cd dir &&` et `git -C dir`.
 */
export function commitIntent(command: string): CommitIntent {
  let cwd: string | undefined
  let hasStaged = false
  for (const raw of command.split(/&&|\|\||;|\n/)) {
    const part = raw.trim()
    const cd = CD.exec(part)
    if (cd) {
      cwd = joinPath(cwd, unquote(cd[1] ?? ''))
      continue
    }
    if (STAGES.test(part)) hasStaged = true
    const m = COMMIT.exec(part)
    if (!m) continue
    const dir = /-C\s+(\S+)/.exec(m[1] ?? '')
    if (dir) cwd = joinPath(cwd, unquote(dir[1] ?? ''))
    const args = commitArgs(m[2] ?? '')
    const scope: Scope = hasStaged ? 'worktree' : args.isAll || args.hasPaths ? 'all' : 'staged'
    return cwd === undefined ? { scope } : { scope, cwd }
  }
  return null
}

export type Pm = 'pnpm' | 'yarn' | 'npm'

export function packageManager(has: { pnpm: boolean; yarn: boolean }): Pm {
  if (has.pnpm) return 'pnpm'
  return has.yarn ? 'yarn' : 'npm'
}

/** Scripts `test` et `lint` d'un package.json ; le stub `npm init` ne compte pas. */
export function scriptsOf(json: string): { test: boolean; lint: boolean } {
  try {
    const parsed: unknown = JSON.parse(json)
    const scripts =
      typeof parsed === 'object' && parsed !== null && 'scripts' in parsed ? parsed.scripts : undefined
    if (typeof scripts !== 'object' || scripts === null) return { test: false, lint: false }
    const s = scripts as Record<string, unknown>
    const test = typeof s.test === 'string' && !/no test specified/.test(s.test)
    return { test, lint: typeof s.lint === 'string' }
  } catch {
    return { test: false, lint: false }
  }
}

export type Parsed = { kind: 'run'; report: boolean } | { kind: 'toggle'; on: boolean } | { kind: 'help' }

export function parseCommand(args: string): Parsed {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { kind: 'run', report: false }
  if (words.length === 1 && (words[0] === '--report' || words[0] === 'report')) return { kind: 'run', report: true }
  if (words.length === 1 && (words[0] === 'on' || words[0] === 'off')) return { kind: 'toggle', on: words[0] === 'on' }
  return { kind: 'help' }
}

const LABEL: Record<CheckId, string> = {
  tests: 'Tests',
  lint: 'Lint',
  todo: 'TODO / FIXME',
  secrets: 'Secrets',
  files: 'Fichiers',
  git: 'Git',
}

const ICON: Record<Level, string> = { block: '✖', warn: '⚠', info: 'ℹ' }

export function headline(report: Report): string {
  const blocks = report.findings.filter(f => f.level === 'block').length
  const warns = report.findings.filter(f => f.level === 'warn').length
  if (report.level === 'ok' && report.isEmpty) return 'ℹ rien à vérifier (aucune modification git, pas de script test ni lint)'
  if (report.level === 'ok') return `✓ QA OK (${report.files} fichier(s))`
  if (report.level === 'warn') return `⚠ ${warns} avertissement(s)`
  return `✖ ${blocks} problème(s) bloquant(s)` + (warns > 0 ? `, ${warns} avertissement(s)` : '')
}

export function denyText(report: Report): string {
  const lines = report.findings.filter(f => f.level === 'block').map(f => `- ${f.message}`)
  return [`qa-guardian a bloqué le commit :`, ...lines, 'Corrige puis relance (ou /qa off pour désactiver le garde).'].join(
    '\n',
  )
}

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const SCOPE: Record<Scope, string> = {
  staged: 'fichiers indexés (git add)',
  all: 'tous les fichiers suivis modifiés (commit -a)',
  worktree: 'modifications depuis HEAD',
}

export function toMarkdown(report: Report): string {
  const out = [
    '# Rapport qa-guardian',
    '',
    `- Date : ${stamp(report.at)}`,
    `- Périmètre : ${SCOPE[report.scope]} — ${report.files} fichier(s)`,
    `- Résultat : **${headline(report)}**`,
    '',
  ]
  for (const check of Object.keys(LABEL) as CheckId[]) {
    const items = report.findings.filter(f => f.check === check)
    if (check === 'git' && items.length === 0) continue
    out.push(`## ${LABEL[check]}`, '')
    if (items.length === 0) out.push('- ✓ rien à signaler')
    for (const f of items) out.push(`- ${ICON[f.level]} ${f.message.replaceAll('|', '\\|')}`)
    out.push('')
  }
  out.push('> Les valeurs des secrets ne sont jamais recopiées dans ce rapport.', '')
  return out.join('\n')
}
