import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import type { Finding, Report, Scope } from '../types'
import {
  FORBIDDEN_PATHSPECS,
  REPORT_FILE,
  checkFiles,
  commitIntent,
  denyText,
  headline,
  isForbiddenFile,
  linesOf,
  packageManager,
  parseCommand,
  parseDiff,
  scanLines,
  scriptsOf,
  splitNames,
  tail,
  toMarkdown,
  worst,
} from './checks'
import type { AddedLine, Pm } from './checks'

const isEnabled = atom({ plugin: 'qa-guardian', key: 'isEnabled' } as const, true)
const isRunning = atom({ plugin: 'qa-guardian', key: 'isRunning' } as const, false)
const isHidden = atom({ plugin: 'qa-guardian', key: 'isHidden' } as const, false)
const report = atom({ plugin: 'qa-guardian', key: 'report' } as const, null as Report | null)

const HELP = [
  '/qa — lance les vérifications maintenant',
  '/qa --report — idem, et écrit qa-report.md',
  '/qa off | on — désactive / réactive le garde avant git commit',
].join('\n')

const TEN_MINUTES = 600_000
const MAX_LINES = 4

// Fichiers non suivis lus au plus pour la recherche de secrets (au-delà : signalé).
const MAX_UNTRACKED = 200

const inDir = (cwd: string | undefined, path: string): string => (cwd === undefined ? path : `${cwd}/${path}`)

// `core.quotePath=false` : les chemins accentués arrivent en clair, pas en `"donn\303\251es"`.
async function git($: EngineInterface, cwd: string | undefined, args: readonly string[]): Promise<ProcessRunResult> {
  const where = cwd === undefined ? [] : ['-C', cwd]
  return $.process.run(['git', ...where, '-c', 'core.quotePath=false', ...args])
}

// Sans shell, Windows ne lance pas `pnpm.cmd` directement : on repasse par cmd.exe.
// Les noms de scripts sont fixes (`test`, `lint`), rien de l'extérieur n'entre dans la ligne.
async function runScript(
  $: EngineInterface,
  cwd: string | undefined,
  pm: Pm,
  script: 'test' | 'lint',
): Promise<ProcessRunResult> {
  const init = { env: { CI: '1', FORCE_COLOR: '0' }, timeoutMs: TEN_MINUTES, ...(cwd === undefined ? {} : { cwd }) }
  try {
    return await $.process.run([pm, 'run', script], init)
  } catch (err) {
    if (/time/i.test(String(err))) throw err
    return $.process.run(['cmd.exe', '/d', '/c', `${pm} run ${script}`], init)
  }
}

async function scriptFinding(
  $: EngineInterface,
  cwd: string | undefined,
  pm: Pm,
  script: 'test' | 'lint',
): Promise<Finding | null> {
  const check = script === 'test' ? 'tests' : 'lint'
  const level = script === 'test' ? 'block' : 'warn'
  try {
    const r = await runScript($, cwd, pm, script)
    if (r.exitCode === 0) return null
    const what = script === 'test' ? 'a échoué' : 'signale des erreurs'
    return { check, level, message: `${pm} run ${script} ${what} — ${tail(r.stdout + '\n' + r.stderr)}` }
  } catch (err) {
    return { check, level, message: `${pm} run ${script} n'a pas abouti (${String(err).slice(0, 120)})` }
  }
}

type ScriptsOutcome = { findings: Finding[]; hasRun: boolean }

async function checkScripts($: EngineInterface, cwd: string | undefined): Promise<ScriptsOutcome> {
  if (!(await $.fs.exists(inDir(cwd, 'package.json')))) {
    return {
      findings: [{ check: 'tests', level: 'info', message: 'pas de package.json : tests et lint non lancés' }],
      hasRun: false,
    }
  }
  const scripts = scriptsOf(await $.fs.read(inDir(cwd, 'package.json')))
  const pm = packageManager({
    pnpm: await $.fs.exists(inDir(cwd, 'pnpm-lock.yaml')),
    yarn: await $.fs.exists(inDir(cwd, 'yarn.lock')),
  })
  // Tests et lint sont indépendants : en parallèle, le commit attend le plus lent des deux.
  const [test, lint] = await Promise.all([
    scripts.test ? scriptFinding($, cwd, pm, 'test') : null,
    scripts.lint ? scriptFinding($, cwd, pm, 'lint') : null,
  ])
  const found: Finding[] = []
  if (!scripts.test) found.push({ check: 'tests', level: 'info', message: 'aucun script "test" dans package.json' })
  if (!scripts.lint) found.push({ check: 'lint', level: 'info', message: 'aucun script "lint" dans package.json' })
  for (const f of [test, lint]) if (f) found.push(f)
  return { findings: found, hasRun: scripts.test || scripts.lint }
}

type GitView = { scope: Scope; files: string[]; lines: AddedLine[]; unstaged: string[]; problems: Finding[] }

// Les non suivis n'apparaissent pas dans `git diff HEAD` : on lit leur contenu (jamais celui d'un fichier sensible).
async function untrackedLines($: EngineInterface, cwd: string | undefined, files: readonly string[]): Promise<AddedLine[]> {
  const lines: AddedLine[] = []
  for (const file of files.filter(f => !isForbiddenFile(f)).slice(0, MAX_UNTRACKED)) {
    try {
      const text = await $.fs.read(inDir(cwd, file))
      if (!text.includes('\u0000')) lines.push(...linesOf(file, text))
    } catch {
      // Illisible ou trop gros (plus de 4 Mio) : son nom reste vérifié.
    }
  }
  return lines
}

// Ce que le commit emporterait. Le contenu des fichiers sensibles est exclu du diff : jamais lu.
async function gitView($: EngineInterface, wanted: Scope | 'auto', cwd: string | undefined): Promise<GitView | null> {
  const inside = await git($, cwd, ['rev-parse', '--is-inside-work-tree']).catch(() => null)
  if (!inside || inside.exitCode !== 0) return null

  const staged = splitNames((await git($, cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])).stdout)
  const scope: Scope = wanted === 'auto' ? (staged.length > 0 ? 'staged' : 'worktree') : wanted
  const base = scope === 'staged' ? ['diff', '--cached'] : ['diff', 'HEAD']
  const names = await git($, cwd, [...base, '--name-only', '--diff-filter=ACMR'])
  // Dépôt sans commit : HEAD n'existe pas, on retombe sur l'index.
  const isFresh = names.exitCode !== 0
  const range = isFresh ? ['diff', '--cached'] : base
  const files = isFresh ? staged : splitNames(names.stdout)
  const problems: Finding[] = []
  const lines: AddedLine[] = []
  if (scope === 'worktree') {
    const untracked = splitNames((await git($, cwd, ['ls-files', '--others', '--exclude-standard'])).stdout)
    files.push(...untracked)
    lines.push(...(await untrackedLines($, cwd, untracked)))
    if (untracked.length > MAX_UNTRACKED) {
      problems.push({ check: 'secrets', level: 'warn', message: `${untracked.length - MAX_UNTRACKED} fichier(s) non suivi(s) non analysé(s)` })
    }
  }
  const diff = await git($, cwd, [...range, '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', '--', '.', ...FORBIDDEN_PATHSPECS])
  // Un diff en échec ou tronqué ne prouve rien : on bloque plutôt que de déclarer « OK ».
  if (diff.exitCode !== 0 || diff.isStdoutTruncated) {
    const why = diff.exitCode !== 0 ? `git diff a échoué (code ${diff.exitCode})` : 'diff trop gros (plus de 4 Mio), analyse incomplète'
    problems.push({ check: 'secrets', level: 'block', message: `${why} : committer en plusieurs fois ou /qa off` })
  }
  lines.push(...parseDiff(diff.stdout))
  const unstaged =
    scope === 'staged'
      ? splitNames((await git($, cwd, ['diff', '--name-only'])).stdout).filter(f => !files.includes(f))
      : []
  return { scope, files, lines, unstaged, problems }
}

// Une vérification à la fois : un clic sur « Relancer » ou un /qa attend celle en cours.
let queue: Promise<unknown> = Promise.resolve()

function runQa($: EngineInterface, wanted: Scope | 'auto', trigger: Report['trigger'], cwd?: string): Promise<Report> {
  const job = queue.then(() => checkAll($, wanted, trigger, cwd))
  queue = job.catch(() => undefined)
  return job
}

async function checkAll(
  $: EngineInterface,
  wanted: Scope | 'auto',
  trigger: Report['trigger'],
  cwd: string | undefined,
): Promise<Report> {
  await update($, isRunning, () => true)
  await update($, isHidden, () => false)
  try {
    const view = await gitView($, wanted, cwd)
    const findings: Finding[] = []
    if (view) {
      findings.push(...view.problems, ...checkFiles(view.files, view.unstaged), ...scanLines(view.lines))
    } else {
      findings.push({ check: 'git', level: 'info', message: 'pas un dépôt git : seuls tests et lint sont vérifiés' })
    }
    const scripts = await checkScripts($, cwd)
    findings.push(...scripts.findings)
    const files = view?.files.length ?? 0
    const done: Report = {
      level: worst(findings),
      scope: view?.scope ?? (wanted === 'auto' ? 'worktree' : wanted),
      trigger,
      at: await $.clock.now(),
      files,
      findings,
      isEmpty: files === 0 && !scripts.hasRun,
    }
    await update($, report, () => done)
    return done
  } finally {
    await update($, isRunning, () => false)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'qa',
      description: 'Vérifie tests, lint, TODO, secrets et fichiers ; --report écrit qa-report.md',
      argumentHint: '[--report | on | off]',
    })

    return next(e)
  })

  on('command.run', { command: 'qa' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    if (cmd.kind === 'help') return { text: HELP }
    if (cmd.kind === 'toggle') {
      await update($, isEnabled, () => cmd.on)
      return { text: cmd.on ? 'qa-guardian : garde avant commit activé.' : 'qa-guardian : garde avant commit désactivé.' }
    }
    const done = await runQa($, 'auto', 'command')
    const lines = [headline(done), ...done.findings.filter(f => f.level !== 'info').map(f => `- ${f.message}`)]
    if (cmd.report) {
      await $.fs.write(REPORT_FILE, toMarkdown(done))
      lines.push(`Rapport écrit dans ${REPORT_FILE}.`)
    }
    return { text: lines.join('\n') }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const intent = commitIntent(e.command)
    if (!intent || !(await read($, isEnabled))) return next(e)

    const done = await runQa($, intent.scope, 'commit', intent.cwd)
    if (done.level === 'block') return { deny: denyText(done) }
    if (done.level === 'warn') $.ui.toast(`qa-guardian : ${headline(done)}`)

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'qa-guardian : la vérification a échoué, commit non lancé. Lance /qa pour voir.' },
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || (await read($, isHidden))) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    let mine
    if (await read($, isRunning)) {
      mine = <Text key="qa" dimColor>qa-guardian › vérification en cours (tests, lint, secrets)…</Text>
    } else {
      const last = await read($, report)
      if (last === null) return below
      const color = last.level === 'ok' ? 'success' : last.level === 'warn' ? 'warning' : 'error'
      const shown = last.findings.filter(f => f.level !== 'info')
      const room = Math.max(0, Math.min(MAX_LINES, e.props.maxRows - 2))
      mine = (
        <Box key="qa" flexDirection="column">
          <Box flexDirection="row">
            {last.isEmpty && last.level === 'ok' ? (
              <Text dimColor>qa-guardian › {headline(last)} </Text>
            ) : (
              <Text color={color}>qa-guardian › {headline(last)} </Text>
            )}
            <Button key="qa-rerun" label="Relancer" plain dimColor onPress={() => runQa($, 'auto', 'command')} />
            <Button key="qa-close" label="×" plain dimColor role="dismiss" onPress={() => update($, isHidden, () => true)} />
          </Box>
          {shown.slice(0, room).map((f, i) => (
            <Text key={`qa-${i}`} color={f.level === 'block' ? 'error' : 'warning'}>
              {'  '}
              {f.level === 'block' ? '✖' : '⚠'} {f.message}
            </Text>
          ))}
          {shown.length > room && <Text dimColor>{`  … ${shown.length - room} de plus (/qa --report)`}</Text>}
        </Box>
      )
    }

    // Les bandes des autres mods (fil, jauge, cap, relay) restent dessinées dessous.
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
