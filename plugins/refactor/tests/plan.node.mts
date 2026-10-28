// Tests Node de plan.ts (couverture SonarQube) : node scripts/coverage.mjs
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { Run, Step } from '../types'
import {
  PLAN_ONLY_END,
  RISK_COLOR,
  STATUS_LABEL,
  analysisPrompt,
  cleanupLabel,
  confirmReply,
  isConfirmedRemoval,
  isForbiddenFile,
  isGuarded,
  isHighRiskReason,
  isInside,
  knipFixVerdict,
  knipItemOf,
  knipMatches,
  knipRunVerdict,
  knipStatusOf,
  needsConfirmation,
  parseCommand,
  parsePlan,
  parseStepReport,
  pausedReply,
  planReply,
  resolvePath,
  secretIn,
  shellVerdict,
  stepPrompt,
  statusOf,
  summaryReply,
  withoutHeredocs,
  words,
  writeVerdict,
} from '../hooks/plan.ts'

// Assemblé à l'exécution : ce fichier ne contient pas lui-même de clé.
const FAKE_SK = 'sk-' + 'y'.repeat(24)
const CWD = 'D:/repo'

const step = (over: Partial<Step> = {}): Step => ({
  title: 'Extraction',
  kind: 'refactor',
  files: ['src/a.ts'],
  risk: 'faible',
  tests: ['pnpm test'],
  knip: [],
  status: 'todo',
  testState: 'non exécutés',
  isConfirmed: true,
  ...over,
})

const run = (over: Partial<Run> = {}): Run => ({
  target: 'src',
  targetAbs: 'D:/repo/src',
  goal: '',
  isPlanOnly: false,
  phase: 'applying',
  steps: [step()],
  current: 0,
  hasTests: true,
  testCommand: 'pnpm test',
  issues: [],
  knipStatus: 'detected',
  knip: [],
  modified: [],
  ...over,
})

describe('refactor/hooks/plan.ts', () => {
  test('words et parseCommand', () => {
    assert.deepEqual(words(`a "b c" 'd e' f`), ['a', 'b c', 'd e', 'f'])
    assert.deepEqual(parseCommand(''), { kind: 'help' })
    assert.deepEqual(parseCommand('go'), { kind: 'go' })
    assert.deepEqual(parseCommand('Passer'), { kind: 'skip' })
    assert.deepEqual(parseCommand('arrêter'), { kind: 'stop' })
    assert.deepEqual(parseCommand('statut'), { kind: 'status' })
    assert.deepEqual(parseCommand('--help'), { kind: 'help' })
    assert.deepEqual(parseCommand('src/a.ts réduire la complexité --plan-only'), {
      kind: 'start',
      target: 'src/a.ts',
      goal: 'réduire la complexité',
      isPlanOnly: true,
    })
    assert.deepEqual(parseCommand('go --plan-only'), { kind: 'start', target: 'go', goal: '', isPlanOnly: true })
  })

  test('resolvePath et isInside', () => {
    assert.equal(resolvePath('D:\\repo', 'src\\.\\a\\..\\b.ts'), 'D:/repo/src/b.ts')
    assert.equal(resolvePath(CWD, '/abs/x/'), '/abs/x')
    assert.equal(resolvePath(CWD, '../../..'), 'D:')
    assert.equal(resolvePath('/', '..'), '/')
    assert.equal(isInside('D:/Repo/SRC/a.ts', 'd:/repo/src'), true)
    assert.equal(isInside('d:/repo/src', 'd:/repo/src'), true)
    assert.equal(isInside('d:/repo/srcx/a.ts', 'd:/repo/src'), false)
  })

  test('isForbiddenFile et secretIn', () => {
    assert.equal(isForbiddenFile('a\\.env'), true)
    assert.equal(isForbiddenFile('.env.sample'), false)
    assert.equal(isForbiddenFile('cert.p12'), true)
    assert.equal(isForbiddenFile('a.ts'), false)
    assert.equal(secretIn(`k = ${FAKE_SK}`), 'clé API (sk-…)')
    assert.equal(secretIn('rien'), null)
  })

  test('knipStatusOf', () => {
    assert.equal(knipStatusOf(null, true), 'none')
    assert.equal(knipStatusOf('{}', true), 'detected')
    assert.equal(knipStatusOf('{"devDependencies":{"knip":"5"}}', false), 'detected')
    assert.equal(knipStatusOf('{"dependencies":{"knip":"5"}}', false), 'detected')
    assert.equal(knipStatusOf('{"dependencies":{}}', false), 'missing')
    assert.equal(knipStatusOf('null', false), 'missing')
    assert.equal(knipStatusOf('pas du json', false), 'missing')
  })

  test('withoutHeredocs : corps retiré, reste de la ligne gardé, heredoc non fermé gardé', () => {
    assert.equal(withoutHeredocs("git commit -F - <<'EOF'\nknip --fix\nEOF\nls"), 'git commit -F - <<heredoc\nls')
    assert.equal(withoutHeredocs('cat <<-EOF > out.txt\n\tcorps\n\tEOF'), 'cat <<heredoc > out.txt')
    assert.equal(withoutHeredocs('cat <<EOF\nsans fin'), 'cat <<EOF\nsans fin')
    assert.equal(withoutHeredocs('ls -la'), 'ls -la')
    assert.equal(withoutHeredocs('git commit -F - <<A 3<<"B"\nmsg\nA\nknip --fix\nB\nls'), 'git commit -F - <<heredoc 3<<heredoc\nls')
  })

  test('withoutHeredocs ne masque pas de vraies commandes', () => {
    // here-string, délimiteur collé, `<<` entre guillemets ou en commentaire : rien n'est ouvert
    for (const command of [
      'cat <<<EOF\nnpx knip --fix\nEOF',
      "cat <<'EOF'x\nEOFx\nnpx knip --fix\nEOF",
      'echo "<<EOF"\nnpx knip --fix\nEOF',
      "echo '<<EOF'\nnpx knip --fix\nEOF",
      'ls # <<EOF\nnpx knip --fix\nEOF',
    ]) {
      assert.equal(withoutHeredocs(command), command)
      assert.ok(knipFixVerdict(command), command)
    }
    assert.ok(shellVerdict('cat <<<EOF\necho x > src/a.ts\nEOF'))
    assert.equal(withoutHeredocs('echo a#<<EOF\nx\nEOF'), 'echo a#<<heredoc')
  })

  test('knipFixVerdict', () => {
    assert.ok(knipFixVerdict('npx knip --fix'))
    assert.ok(knipFixVerdict('npx knip --fix-type exports'))
    assert.ok(knipFixVerdict('./node_modules/.bin/knip --allow-remove-files'))
    assert.ok(knipFixVerdict('ls && "knip" --fix'))
    assert.equal(knipFixVerdict('npx knip'), null)
    assert.equal(knipFixVerdict('oxlint --fix && npx knip'), null)
    assert.equal(knipFixVerdict("git commit -F - <<'EOF'\nnpx knip --fix\nEOF"), null)
  })

  test('knipRunVerdict', () => {
    assert.match(knipRunVerdict('npm install -D knip', 'detected') ?? '', /installer Knip/)
    assert.match(knipRunVerdict('npx knip init', 'detected') ?? '', /knip init/)
    assert.match(knipRunVerdict('npx knip', 'missing') ?? '', /pas installé/)
    assert.equal(knipRunVerdict('npx knip', 'detected'), null)
    assert.equal(knipRunVerdict('ls', 'missing'), null)
  })

  test('isHighRiskReason tient compte des négations', () => {
    assert.equal(isHighRiskReason('utilisé par la configuration Vite'), true)
    assert.equal(isHighRiskReason('import dynamique possible'), true)
    assert.equal(isHighRiskReason('non utilisé par les tests'), false)
    assert.equal(isHighRiskReason('ni la config ni un script, mais un plugin'), true)
    assert.equal(isHighRiskReason('aucun usage'), false)
  })

  test('shellVerdict', () => {
    assert.match(shellVerdict('npx knip --fix') ?? '', /knip --fix/)
    assert.match(shellVerdict('npx knip', 'missing') ?? '', /pas installé/)
    assert.match(shellVerdict('git commit -m x') ?? '', /git commit/)
    assert.match(shellVerdict('git reset --hard') ?? '', /reset --hard/)
    assert.match(shellVerdict('rm -rf build') ?? '', /suppression/)
    assert.match(shellVerdict('Remove-Item a.ts') ?? '', /suppression/)
    assert.match(shellVerdict('sed -i s/a/b/ f') ?? '', /en place/)
    assert.match(shellVerdict('npx oxfmt .') ?? '', /formateur/)
    assert.match(shellVerdict('pnpm format') ?? '', /script qui réécrit/)
    assert.match(shellVerdict('pnpm add zod') ?? '', /dépendances/)
    assert.match(shellVerdict('Set-Content a.ts x') ?? '', /PowerShell/)
    assert.match(shellVerdict('echo x > a.ts') ?? '', /redirection/)
    assert.match(shellVerdict('cat <<EOF > a.ts\nx\nEOF') ?? '', /redirection/)
    assert.equal(shellVerdict('pnpm test 2>&1 > /dev/null'), null)
    assert.equal(shellVerdict('grep "<Button>" src'), null)
    assert.equal(shellVerdict('npx knip'), null)
  })

  test('isConfirmedRemoval', () => {
    const files = step({ kind: 'knip-file', files: ['src/old.ts'], isConfirmed: true })
    const fileRun = run({ steps: [files] })
    assert.equal(isConfirmedRemoval('git rm src/old.ts', fileRun, CWD), true)
    assert.equal(isConfirmedRemoval('rm -f ./src/old.ts', fileRun, CWD), true)
    assert.equal(isConfirmedRemoval('rm src/other.ts', fileRun, CWD), false)
    assert.equal(isConfirmedRemoval('rm -rf src/old.ts', fileRun, CWD), false)
    assert.equal(isConfirmedRemoval('rm', fileRun, CWD), false)
    assert.equal(isConfirmedRemoval('mv src/old.ts x', fileRun, CWD), false)
    assert.equal(isConfirmedRemoval('rm src/old.ts; ls', fileRun, CWD), false)
    assert.equal(isConfirmedRemoval('git rm src/old.ts', run({ steps: [{ ...files, isConfirmed: false }] }), CWD), false)
    assert.equal(isConfirmedRemoval('git rm src/old.ts', run({ steps: [files], phase: 'confirming' }), CWD), false)

    const deps = run({ steps: [step({ kind: 'knip-dependency', knip: ['lodash'], isConfirmed: true })] })
    assert.equal(isConfirmedRemoval('npm uninstall -D lodash', deps, CWD), true)
    assert.equal(isConfirmedRemoval('pnpm remove lodash react', deps, CWD), false)
    assert.equal(isConfirmedRemoval('pnpm remove --force lodash', deps, CWD), false)
    assert.equal(isConfirmedRemoval('pnpm add lodash', deps, CWD), false)
    assert.equal(isConfirmedRemoval('cargo remove lodash', deps, CWD), false)
    assert.equal(isConfirmedRemoval('npm uninstall', deps, CWD), false)

    assert.equal(isConfirmedRemoval('rm src/a.ts', run(), CWD), false)
  })

  test('knipItemOf et knipMatches', () => {
    assert.equal(knipItemOf({ name: ' ' }), null)
    assert.deepEqual(knipItemOf({ name: 'x', kind: 'Dépendance', risk: 'low', file: 'package.json' }), {
      kind: 'dépendance',
      name: 'x',
      file: 'package.json',
      risk: 'faible',
      reason: '',
    })
    assert.equal(knipItemOf({ name: 'y', kind: '?', risk: 'faible', reason: 'chargé par le framework' })?.risk, 'élevé')
    assert.equal(knipItemOf({ name: 'z', risk: 'high' })?.risk, 'élevé')
    assert.equal(knipItemOf({ name: 'z', risk: 'medium' })?.risk, 'moyen')
    assert.equal(knipItemOf({ name: 'z', risk: 'inconnu' })?.risk, 'moyen')
    const items = [
      { kind: 'export', name: 'f', file: 'a.ts', risk: 'faible', reason: '' },
      { kind: 'export', name: 'f', file: 'b.ts', risk: 'élevé', reason: '' },
    ] as const
    assert.equal(knipMatches(items, 'f').length, 2)
    assert.equal(knipMatches(items, 'b.ts:f')[0]?.file, 'b.ts')
  })

  test('parsePlan : validation, ordre Knip, risques', () => {
    assert.match(parsePlan(null) as string, /objet est attendu/)
    assert.match(parsePlan({ steps: [] }) as string, /au moins une étape/)
    assert.match(parsePlan({ steps: [{}] }) as string, /title/)
    assert.match(
      parsePlan({ steps: [{ title: 'a', kind: 'knip-file' }, { title: 'b', kind: 'knip-export' }] }) as string,
      /dans l’ordre/,
    )
    assert.match(
      parsePlan({
        steps: [{ title: 'a', kind: 'knip-file', knip: ['old.ts'] }],
        knip: [{ name: 'old.ts', kind: 'fichier', risk: 'faible', reason: 'entry point' }],
      }) as string,
      /risque élevé/,
    )
    const plan = parsePlan({
      steps: [
        { title: ' Extraire ', files: ['a.ts', ''], risk: 'low', tests: ['t'] },
        { title: 'Exports', kind: 'knip-export', knip: ['f'], risk: 'faible' },
        { title: 'Deps', kind: 'knip-dependency', knip: ['d'], risk: 'faible' },
      ],
      knip: [
        { name: 'f', risk: 'moyen' },
        { name: 'd', risk: 'faible' },
        'ignoré',
      ],
      issues: [{ kind: 'duplication', file: 'a.ts', detail: 'x' }, 3],
      hasTests: true,
      testCommand: ' pnpm test ',
    })
    assert.ok(typeof plan !== 'string')
    assert.deepEqual(
      plan.steps.map(s => [s.title, s.kind, s.risk, s.isConfirmed]),
      [
        ['Extraire', 'refactor', 'faible', true],
        ['Exports', 'knip-export', 'moyen', false],
        ['Deps', 'knip-dependency', 'faible', false],
      ],
    )
    assert.deepEqual(plan.steps[0]?.files, ['a.ts'])
    assert.equal(plan.issues.length, 1)
    assert.equal(plan.knip.length, 2)
    assert.equal(plan.testCommand, 'pnpm test')
    const bare = parsePlan({ steps: [{ title: 'a' }] })
    assert.ok(typeof bare !== 'string')
    assert.equal(bare.hasTests, false)
    assert.equal(bare.testCommand, null)
  })

  test('parseStepReport, statusOf, needsConfirmation', () => {
    assert.match(parseStepReport('x') as string, /objet/)
    assert.match(parseStepReport({ step: 0, status: 'ok' }) as string, /numéro/)
    assert.match(parseStepReport({ step: '2', status: 'bof' }) as string, /status/)
    const ok = parseStepReport({ step: '2', status: 'OK', tests: 'ok', note: ' fait ' })
    assert.deepEqual(ok, { step: 2, status: 'ok', tests: 'OK', note: 'fait' })
    assert.equal(statusOf({ step: 1, status: 'ok', tests: 'OK', note: '' }), 'done')
    assert.equal(statusOf({ step: 1, status: 'ok', tests: 'échec', note: '' }), 'failed')
    assert.equal(statusOf({ step: 1, status: 'annulée', tests: 'non exécutés', note: '' }), 'reverted')
    assert.equal(needsConfirmation(undefined), false)
    assert.equal(needsConfirmation(step()), false)
    assert.equal(needsConfirmation(step({ kind: 'knip-export', isConfirmed: false })), true)
  })

  test('textes pour Claude', () => {
    assert.match(analysisPrompt({ target: 'src', goal: '', isPlanOnly: true, knipStatus: 'none' }), /plan seul/)
    assert.match(analysisPrompt({ target: 'src', goal: 'g', isPlanOnly: false, knipStatus: 'missing' }), /non installé/)
    assert.match(analysisPrompt({ target: 'src', goal: 'g', isPlanOnly: false, knipStatus: 'detected' }), /npx knip/)

    const item = { kind: 'export', name: 'f', file: 'a.ts', risk: 'faible', reason: '' } as const
    const reply = planReply(run({ knip: [item], knipStatus: 'missing', hasTests: false }))
    assert.match(reply, /rapport Knip/)
    assert.match(reply, /Aucun test détecté/)
    assert.match(reply, /ARRÊTE-TOI/)
    assert.ok(planReply(run({ isPlanOnly: true })).includes(PLAN_ONLY_END('src')))

    const kinds = [
      step({ knip: ['f'] }),
      step({ kind: 'knip-export', knip: ['f'] }),
      step({ kind: 'knip-export', knip: [] }),
      step({ kind: 'knip-dependency', knip: ['d'] }),
      step({ kind: 'knip-file', files: ['old.ts'], tests: [] }),
    ]
    const many = run({ steps: kinds, testCommand: null })
    assert.match(stepPrompt(many, 0), /Résultats Knip : f/)
    assert.match(stepPrompt(many, 1), /exports inutilisés confirmés \(f\)/)
    assert.match(stepPrompt(many, 2), /les résultats Knip de l’étape/)
    assert.match(stepPrompt(many, 3), /npm uninstall/)
    assert.match(stepPrompt(many, 4), /les tests du projet/)
    assert.match(stepPrompt(run({ steps: [step({ files: [] })] }), 0), /sous src/)
    assert.equal(stepPrompt(many, 9), '')

    assert.equal(cleanupLabel(step({ kind: 'knip-export', knip: ['f', 'g'] })), '2 export(s) : f, g')
    assert.equal(cleanupLabel(step({ kind: 'knip-dependency', knip: [] })), '0 dépendance(s) : —')
    assert.equal(cleanupLabel(step({ kind: 'knip-file', files: ['x.ts'] })), '1 fichier(s) : x.ts')
    assert.match(confirmReply(many, 1), /nettoyage Knip \(1 export/)
    assert.match(confirmReply(many, 9), /nettoyage Knip \(\)/)

    const done = run({
      steps: [step({ status: 'done' }), step({ status: 'skipped' })],
      modified: ['src/a.ts'],
    })
    assert.match(summaryReply(done), /1\/2 faites, 1 passée/)
    assert.match(summaryReply(run()), /étapes réalisées : aucune/)
    assert.match(pausedReply(run(), 0), /Étape 1\/1 arrêtée/)
  })

  test('gardes', () => {
    assert.equal(isGuarded(null), false)
    assert.equal(isGuarded(run({ phase: 'done' })), false)
    assert.equal(isGuarded(run({ phase: 'paused' })), true)
    assert.match(writeVerdict(run(), 'D:/repo/.env', CWD) ?? '', /sensible/)
    assert.match(writeVerdict(run({ phase: 'planned' }), 'D:/repo/src/a.ts', CWD) ?? '', /plan-only/)
    assert.match(writeVerdict(run({ phase: 'awaiting' }), 'D:/repo/src/a.ts', CWD) ?? '', /pas encore validé/)
    assert.match(writeVerdict(run({ phase: 'confirming' }), 'D:/repo/src/a.ts', CWD) ?? '', /pas encore confirmé/)
    assert.match(writeVerdict(run({ phase: 'paused' }), 'D:/repo/src/a.ts', CWD) ?? '', /pause/)
    assert.equal(writeVerdict(run(), 'D:/repo/src/deep/b.ts', CWD), null)
    const outside = run({ steps: [step({ files: ['lib/x.ts'] })] })
    assert.equal(writeVerdict(outside, 'd:/repo/lib/x.ts', CWD), null)
    assert.match(writeVerdict(outside, 'D:/repo/lib/y.ts', CWD) ?? '', /hors de l’étape/)
    assert.equal(RISK_COLOR.élevé, 'error')
    assert.equal(STATUS_LABEL.skipped, '⤼ passée')
  })
})
