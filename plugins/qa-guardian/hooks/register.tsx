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
import type { Pm } from './checks'

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

async function git($: EngineInterface, args: readonly string[]): Promise<ProcessRunResult> {
  return $.process.run(['git', ...args])
}

// Sans shell, Windows ne lance pas `pnpm.cmd` directement : on repasse par cmd.exe.
// Les noms de scripts sont fixes (`test`, `lint`), rien de l'extérieur n'entre dans la ligne.
async function runScript($: EngineInterface, pm: Pm, script: 'test' | 'lint'): Promise<ProcessRunResult> {
  const env = { CI: '1', FORCE_COLOR: '0' }
  try {
    return await $.process.run([pm, 'run', script], { env, timeoutMs: TEN_MINUTES })
  } catch (err) {
    if (/time/i.test(String(err))) throw err
    return $.process.run(['cmd.exe', '/d', '/c', `${pm} run ${script}`], { env, timeoutMs: TEN_MINUTES })
  }
}

type ScriptsOutcome = { findings: Finding[]; hasRun: boolean }

async function checkScripts($: EngineInterface): Promise<ScriptsOutcome> {
  if (!(await $.fs.exists('package.json'))) {
    return {
      findings: [{ check: 'tests', level: 'info', message: 'pas de package.json : tests et lint non lancés' }],
      hasRun: false,
    }
  }
  const scripts = scriptsOf(await $.fs.read('package.json'))
  const pm = packageManager({ pnpm: await $.fs.exists('pnpm-lock.yaml'), yarn: await $.fs.exists('yarn.lock') })
  const found: Finding[] = []

  if (scripts.test) {
    try {
      const r = await runScript($, pm, 'test')
      if (r.exitCode !== 0) {
        found.push({ check: 'tests', level: 'block', message: `${pm} run test a échoué — ${tail(r.stdout + '\n' + r.stderr)}` })
      }
    } catch (err) {
      found.push({ check: 'tests', level: 'block', message: `${pm} run test n'a pas abouti (${String(err).slice(0, 120)})` })
    }
  } else {
    found.push({ check: 'tests', level: 'info', message: 'aucun script "test" dans package.json' })
  }

  if (scripts.lint) {
    try {
      const r = await runScript($, pm, 'lint')
      if (r.exitCode !== 0) {
        found.push({ check: 'lint', level: 'warn', message: `${pm} run lint signale des erreurs — ${tail(r.stdout + '\n' + r.stderr)}` })
      }
    } catch (err) {
      found.push({ check: 'lint', level: 'warn', message: `${pm} run lint n'a pas abouti (${String(err).slice(0, 120)})` })
    }
  } else {
    found.push({ check: 'lint', level: 'info', message: 'aucun script "lint" dans package.json' })
  }
  return { findings: found, hasRun: scripts.test || scripts.lint }
}

type GitView = { scope: Scope; files: string[]; diff: string; unstaged: string[] }

// Ce que le commit emporterait. Le contenu des fichiers sensibles est exclu du diff : jamais lu.
async function gitView($: EngineInterface, wanted: Scope | 'auto'): Promise<GitView | null> {
  const inside = await git($, ['rev-parse', '--is-inside-work-tree']).catch(() => null)
  if (!inside || inside.exitCode !== 0) return null

  const staged = splitNames((await git($, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])).stdout)
  const scope: Scope = wanted === 'auto' ? (staged.length > 0 ? 'staged' : 'worktree') : wanted
  const base = scope === 'staged' ? ['diff', '--cached'] : ['diff', 'HEAD']
  const names = await git($, [...base, '--name-only', '--diff-filter=ACMR'])
  // Dépôt sans commit : HEAD n'existe pas, on retombe sur l'index.
  const isFresh = names.exitCode !== 0
  const range = isFresh ? ['diff', '--cached'] : base
  const files = isFresh ? staged : splitNames(names.stdout)
  if (scope === 'worktree') {
    files.push(...splitNames((await git($, ['ls-files', '--others', '--exclude-standard'])).stdout))
  }
  const diff = (await git($, [...range, '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', '--', '.', ...FORBIDDEN_PATHSPECS]))
    .stdout
  const unstaged =
    scope === 'staged'
      ? splitNames((await git($, ['diff', '--name-only'])).stdout).filter(f => !files.includes(f))
      : []
  return { scope, files, diff, unstaged }
}

async function runQa($: EngineInterface, wanted: Scope | 'auto', trigger: Report['trigger']): Promise<Report> {
  await update($, isRunning, () => true)
  await update($, isHidden, () => false)
  try {
    const view = await gitView($, wanted)
    const findings: Finding[] = []
    if (view) {
      findings.push(...checkFiles(view.files, view.unstaged), ...scanLines(parseDiff(view.diff)))
    } else {
      findings.push({ check: 'git', level: 'info', message: 'pas un dépôt git : seuls tests et lint sont vérifiés' })
    }
    const scripts = await checkScripts($)
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

    const done = await runQa($, intent.scope, 'commit')
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
