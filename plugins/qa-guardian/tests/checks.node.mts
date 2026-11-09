// Tests Node de checks.ts (couverture SonarQube) : node scripts/coverage.mjs
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { Report } from '../types'
import {
  LARGE_COMMIT,
  baseOf,
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
} from '../hooks/checks.ts'

// Assemblés à l'exécution : ce fichier ne contient pas lui-même de secret.
const FAKE_SK = 'sk-' + 'x'.repeat(24)
const FAKE_AWS = 'AKIA' + 'A'.repeat(16)
const FAKE_JWT = ['eyJ', 'eyJ', ''].map(p => p + 'a'.repeat(12)).join('.')
const MARK = 'TO' + 'DO'
const ESC = String.fromCharCode(27)

const report = (over: Partial<Report>): Report => ({
  level: 'ok',
  scope: 'staged',
  trigger: 'command',
  at: new Date(2026, 9, 27, 9, 5).getTime(),
  files: 2,
  findings: [],
  ...over,
})

describe('qa-guardian/hooks/checks.ts', () => {
  test('fichiers interdits', () => {
    assert.equal(baseOf('a/b/.env'), '.env')
    assert.equal(isForbiddenFile('a/.env'), true)
    assert.equal(isForbiddenFile('.env.local'), true)
    assert.equal(isForbiddenFile('.env.example'), false)
    assert.equal(isForbiddenFile('certs/server.pem'), true)
    assert.equal(isForbiddenFile('id.key'), true)
    assert.equal(isForbiddenFile('src/env.ts'), false)
  })

  test('parseDiff : lignes ajoutées, en-têtes, chemins entre guillemets', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '+++ b/x.ts',
      '@@ -1,0 +3,2 @@',
      '+un',
      '++++ pas un en-tête',
      'diff --git "a/é.ts" "b/é.ts"',
      '+++ "b/é.ts"',
      '@@ -0,0 +1 @@',
      '+deux',
      'diff --git a/del.ts b/del.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '+ignoré',
    ].join('\n')
    assert.deepEqual(parseDiff(diff), [
      { file: 'x.ts', line: 3, text: 'un' },
      { file: 'x.ts', line: 4, text: '+++ pas un en-tête' },
      { file: 'é.ts', line: 1, text: 'deux' },
    ])
  })

  test('linesOf numérote toutes les lignes', () => {
    assert.deepEqual(linesOf('f', 'a\nb'), [
      { file: 'f', line: 1, text: 'a' },
      { file: 'f', line: 2, text: 'b' },
    ])
  })

  test('scanLines : secrets bloquants, JWT et marqueur en avertissement, valeur jamais recopiée', () => {
    const found = scanLines([
      { file: 'a.ts', line: 1, text: `const k = '${FAKE_SK}'` },
      { file: 'a.ts', line: 2, text: FAKE_AWS },
      { file: 'a.ts', line: 3, text: FAKE_JWT },
      { file: 'a.ts', line: 4, text: `// ${MARK} plus tard` },
      { file: 'a.ts', line: 5, text: 'rien' },
    ])
    assert.deepEqual(
      found.map(f => [f.check, f.level]),
      [
        ['secrets', 'block'],
        ['secrets', 'block'],
        ['secrets', 'warn'],
        ['todo', 'warn'],
      ],
    )
    assert.ok(found.every(f => !f.message.includes(FAKE_SK)))
  })

  test('checkFiles : sensibles, non voulus, gros commit, hors commit', () => {
    const found = checkFiles(['.env', 'dist/a.js', 'src/a.ts'], ['b.ts'])
    assert.deepEqual(
      found.map(f => f.level),
      ['block', 'warn', 'info'],
    )
    const many = Array.from({ length: LARGE_COMMIT + 1 }, (_, i) => `f${i}.ts`)
    const big = checkFiles(many, ['1', '2', '3', '4', '5', '6'])
    assert.ok(big.some(f => f.message.startsWith(`${LARGE_COMMIT + 1} fichiers`)))
    assert.ok(big.some(f => f.message.endsWith('1, 2, 3, 4, 5…')))
  })

  test('splitNames et tail', () => {
    assert.deepEqual(splitNames(' a \n\nb\n'), ['a', 'b'])
    assert.equal(tail(`${ESC}[31mun${ESC}[0m\ndeux\n\ntrois\nquatre`), 'deux │ trois │ quatre')
    assert.equal(tail('x'.repeat(400), 1).length, 300)
  })

  test('worst', () => {
    assert.equal(worst([]), 'ok')
    assert.equal(worst([{ check: 'files', level: 'info', message: '' }]), 'ok')
    assert.equal(worst([{ check: 'todo', level: 'warn', message: '' }]), 'warn')
    assert.equal(
      worst([
        { check: 'todo', level: 'warn', message: '' },
        { check: 'tests', level: 'block', message: '' },
      ]),
      'block',
    )
  })

  test('commitIntent', () => {
    assert.deepEqual(commitIntent('git commit -m "use -a"'), { scope: 'staged' })
    assert.deepEqual(commitIntent('git commit -am "x"'), { scope: 'all' })
    assert.deepEqual(commitIntent('git commit --all'), { scope: 'all' })
    assert.deepEqual(commitIntent('git commit -m x src/a.ts'), { scope: 'all' })
    assert.deepEqual(commitIntent('git commit -- a.ts'), { scope: 'all' })
    assert.deepEqual(commitIntent('git commit --only a.ts'), { scope: 'all' })
    assert.deepEqual(commitIntent('git commit --author "A <a@b>" -m x'), { scope: 'staged' })
    assert.deepEqual(commitIntent('git commit -m x > out.txt'), { scope: 'staged' })
    assert.deepEqual(commitIntent('git add -A && git commit -m x'), { scope: 'worktree' })
    assert.deepEqual(commitIntent('cd "mon dossier" && cd sub && git commit'), {
      scope: 'staged',
      cwd: 'mon dossier/sub',
    })
    assert.deepEqual(commitIntent('cd /abs; git -C rel commit'), { scope: 'staged', cwd: '/abs/rel' })
    assert.equal(commitIntent('git log --grep commit'), null)
    assert.equal(commitIntent('ls'), null)
  })

  test('packageManager et scriptsOf', () => {
    assert.equal(packageManager({ pnpm: true, yarn: true }), 'pnpm')
    assert.equal(packageManager({ pnpm: false, yarn: true }), 'yarn')
    assert.equal(packageManager({ pnpm: false, yarn: false }), 'npm')
    assert.deepEqual(scriptsOf('{"scripts":{"test":"vitest","lint":"oxlint"}}'), { test: true, lint: true })
    assert.deepEqual(scriptsOf('{"scripts":{"test":"echo no test specified"}}'), { test: false, lint: false })
    assert.deepEqual(scriptsOf('{}'), { test: false, lint: false })
    assert.deepEqual(scriptsOf('pas du json'), { test: false, lint: false })
  })

  test('parseCommand', () => {
    assert.deepEqual(parseCommand(''), { kind: 'run', report: false })
    assert.deepEqual(parseCommand('--report'), { kind: 'run', report: true })
    assert.deepEqual(parseCommand('OFF'), { kind: 'toggle', on: false })
    assert.deepEqual(parseCommand('autre chose'), { kind: 'help' })
  })

  test('headline et denyText', () => {
    const warn = { check: 'todo', level: 'warn', message: 'w' } as const
    const block = { check: 'secrets', level: 'block', message: 'a.ts:1 — clé' } as const
    assert.match(headline(report({ isEmpty: true })), /rien à vérifier/)
    assert.equal(headline(report({})), '✓ QA OK (2 fichier(s))')
    assert.equal(headline(report({ level: 'warn', findings: [warn] })), '⚠ 1 avertissement(s)')
    assert.equal(headline(report({ level: 'block', findings: [block] })), '✖ 1 problème(s) bloquant(s)')
    assert.equal(
      headline(report({ level: 'block', findings: [block, warn] })),
      '✖ 1 problème(s) bloquant(s), 1 avertissement(s)',
    )
    assert.match(denyText(report({ level: 'block', findings: [block, warn] })), /- a\.ts:1 — clé\nCorrige/)
  })

  test('toMarkdown', () => {
    const md = toMarkdown(
      report({
        level: 'warn',
        scope: 'all',
        findings: [
          { check: 'todo', level: 'warn', message: 'a|b' },
          { check: 'git', level: 'info', message: 'g' },
        ],
      }),
    )
    assert.ok(md.includes('- Date : 2026-10-27 09:05'))
    assert.ok(md.includes('tous les fichiers suivis modifiés'))
    assert.ok(md.includes('- ⚠ a\\|b'))
    assert.ok(md.includes('## Git\n\n- ℹ g'))
    assert.ok(md.includes('## Tests\n\n- ✓ rien à signaler'))
    assert.ok(!toMarkdown(report({})).includes('## Git'))
  })
})
