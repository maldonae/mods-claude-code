import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { commitIntent, isForbiddenFile, parseDiff, scanLines, toMarkdown } from '../hooks/checks'

const BAND = {
  plugin: 'qa-guardian',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 140,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const run = (args: string) =>
  ({
    command: 'qa',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 140 },
  }) as const

// Assemblé à l'exécution pour que ce fichier ne contienne pas lui-même de clé.
const FAKE_AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP'

type Repo = {
  staged: string[]
  diff: string
  unstaged?: string[]
  testExit?: number
  lintExit?: number
  pkg?: string
  isNotGit?: boolean
}

const PKG = JSON.stringify({ scripts: { test: 'vitest run', lint: 'oxlint' } })

const out = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const diffOf = (file: string, ...lines: string[]) =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].join(
    '\n',
  )

function engine(on: On, repo: Repo) {
  const writes = new Map<string, string>()
  const ran: string[] = []
  const base = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'qa' } }))
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('clock.now', () => ({ value: new Date(2026, 9, 26, 14, 32).getTime() }))
  on('fs.exists', (_$, e) => ({ value: ['package.json', 'pnpm-lock.yaml'].includes(base(e.path)) }) as never)
  on('fs.read', () => ({ value: repo.pkg ?? PKG }) as never)
  on('fs.write', (_$, e) => {
    writes.set(base(e.path), e.text)
    return { value: undefined } as never
  })
  on('process.run', (_$, e) => {
    const argv = e.argv.join(' ')
    ran.push(argv)
    if (argv.startsWith('git rev-parse')) return (repo.isNotGit ? out('', 128) : out('true')) as never
    if (argv.includes('--name-only') && argv.includes('--cached')) return out(repo.staged.join('\n')) as never
    if (argv === 'git diff --name-only') return out((repo.unstaged ?? []).join('\n')) as never
    if (argv.startsWith('git diff --cached -U0')) return out(repo.diff) as never
    if (argv === 'pnpm run test') return out('Tests: 3 failed', repo.testExit ?? 0) as never
    if (argv === 'pnpm run lint') return out('2 errors', repo.lintExit ?? 0) as never
    return out('') as never
  })
  // L'autre bande, sous qa-guardian.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })
  return { writes, ran }
}

test('détecte un git commit, y compris -am et git -C', () => {
  expect(commitIntent('git commit -m "x"')).toEqual({ scope: 'staged' })
  expect(commitIntent('git add . && git commit -am "x"')).toEqual({ scope: 'all' })
  expect(commitIntent('git -C sub commit --all')).toEqual({ scope: 'all' })
  expect(commitIntent('git log --grep commit')).toBeNull()
  expect(commitIntent('git status')).toBeNull()
})

test('reconnaît les fichiers sensibles, pas les modèles', () => {
  expect(isForbiddenFile('.env')).toBe(true)
  expect(isForbiddenFile('app/.env.local')).toBe(true)
  expect(isForbiddenFile('certs/server.pem')).toBe(true)
  expect(isForbiddenFile('id.key')).toBe(true)
  expect(isForbiddenFile('.env.example')).toBe(false)
  expect(isForbiddenFile('src/env.ts')).toBe(false)
})

test('signale secret et TODO avec fichier:ligne, sans recopier la valeur', () => {
  const lines = parseDiff(diffOf('src/a.ts', 'const ok = 1', `const k = "${FAKE_AWS}"`, '// TODO finir'))
  const found = scanLines(lines)
  expect(found.map(f => f.message)).toEqual(['src/a.ts:2 — clé AWS', 'src/a.ts:3 — TODO non résolu'])
  const md = toMarkdown({ level: 'block', scope: 'staged', trigger: 'command', at: 0, files: 1, findings: found })
  expect(md).toContain('clé AWS')
  expect(md.includes(FAKE_AWS)).toBe(false)
})

test('bloque un commit qui contient un .env, et la bande passe au rouge', async ($, on) => {
  engine(on, { staged: ['.env', 'src/a.ts'], diff: diffOf('src/a.ts', 'export const a = 1') })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat"' })
  expect(ran).toMatchObject({ deny: expect.stringContaining('.env') })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /bloquant/ }))?.text).toContain('1 problème(s) bloquant(s)')
  expect(await ui.find({ type: 'Text', text: 'moteur' })).toBeDefined()
  await ui.unmount()
})

test('bloque un commit quand les tests échouent', async ($, on) => {
  engine(on, { staged: ['src/a.ts'], diff: diffOf('src/a.ts', 'export const a = 1'), testExit: 1 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat"' })
  expect(ran).toMatchObject({ deny: expect.stringContaining('pnpm run test a échoué') })
})

test('laisse passer avec avertissements (TODO, lint) : bande orange', async ($, on) => {
  engine(on, { staged: ['src/a.ts'], diff: diffOf('src/a.ts', '// FIXME plus tard'), lintExit: 1 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "wip"' })
  expect(ran).toMatchObject({ result: {} })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /avertissement/ }))?.text).toContain('2 avertissement(s)')
    expect(await ui.find({ type: 'Text', text: /FIXME non résolu/ })).toBeDefined()
    await ui.unmount()
  }
})

test('tout est vert : commit autorisé, bande verte', async ($, on) => {
  engine(on, { staged: ['src/a.ts'], diff: diffOf('src/a.ts', 'export const a = 1') })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect(await $.tool.call({ tool: 'Bash', command: 'git commit -m "ok"' })).toMatchObject({ result: {} })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /QA OK/ }))?.text).toContain('1 fichier(s)')
  await ui.unmount()
})

test('/qa --report écrit qa-report.md', async ($, on) => {
  const { writes } = engine(on, { staged: ['src/a.ts', 'debug.log'], diff: diffOf('src/a.ts', 'export const a = 1') })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const res = await $.command.run(run('--report'))
  expect(res?.text).toContain('qa-report.md')
  const md = writes.get('qa-report.md') ?? ''
  expect(md).toContain('# Rapport qa-guardian')
  expect(md).toContain('debug.log — fichier de log')
})

test('hors dépôt git et sans script test/lint : « rien à vérifier »', async ($, on) => {
  engine(on, { staged: [], diff: '', pkg: '{"scripts":{}}', isNotGit: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await $.command.run(run('')))?.text).toContain('rien à vérifier')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /rien à vérifier/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /QA OK/ })).toBeUndefined()
  await ui.unmount()
})

test('/qa off laisse passer les commits sans rien lancer', async ($, on) => {
  const { ran } = engine(on, { staged: ['.env'], diff: '' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await $.command.run(run('off')))?.text).toContain('désactivé')
  expect(await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })).toMatchObject({ result: {} })
  expect(ran).toEqual([])
})
