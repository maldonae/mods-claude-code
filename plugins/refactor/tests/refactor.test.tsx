import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PLAN_ONLY_END, knipFixVerdict, knipItemOf, parseCommand, parsePlan, resolvePath, shellVerdict } from '../hooks/plan'

const BAND = {
  plugin: 'refactor',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'refactor',
  component: 'Pane',
  requestId: 'refactor',
  props: {
    title: 'Refactor',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const run = (args: string) =>
  ({
    command: 'refactor',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 160 },
  }) as const

// Assemblé à l'exécution pour que ce fichier ne contienne pas lui-même de clé.
const FAKE_AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP'

const DISK: Record<string, string> = {
  '/repo/src': '',
  '/repo/src/a.ts': 'export const a = 1\n',
  '/repo/src/b.ts': 'export const b = 2\n',
  '/repo/src/secret.ts': `export const k = "${FAKE_AWS}"\n`,
  '/repo/.env': 'X=1\n',
}

const PLAN = {
  tool: 'mcp__refactor__plan',
  hasTests: true,
  testCommand: 'pnpm test',
  issues: [{ kind: 'complexité', file: 'src/a.ts', detail: 'fonction de 80 lignes' }],
  steps: [
    { title: 'Extraction de la validation JWT', files: ['src/a.ts'], risk: 'moyen', tests: ['pnpm test'] },
    { title: 'Renommage des helpers', files: ['src/b.ts'], risk: 'faible', tests: ['pnpm test'] },
  ],
} as const

const WITH_KNIP: Record<string, string> = {
  ...DISK,
  '/repo/package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { knip: '^5.0.0' } }),
  '/repo/src/old.ts': 'export const old = 1\n',
}

const WITHOUT_KNIP: Record<string, string> = {
  ...DISK,
  '/repo/package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
}

function engine(on: On, disk: Record<string, string> = DISK) {
  const clock = mock.clock(on)
  const submitted: string[] = []
  const reached: string[] = []
  // Le kit passe aux hooks fs.* des chemins absolus de la machine (D:\repo\… sous Windows).
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'refactor' } }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__refactor__${e.name}` } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('fs.exists', (_$, e) => ({ value: norm(e.path) in disk }) as never)
  on('fs.read', (_$, e) => {
    const text = disk[norm(e.path)]
    if (text === undefined) throw new Error(`absent : ${e.path}`)
    return { value: text } as never
  })
  // Le moteur : ce qui arrive ici n'a pas été refusé par le mod.
  on('tool.call', (_$, e) => {
    reached.push(e.tool === 'Bash' ? `Bash ${String((e as { command?: string }).command)}` : e.tool)
    return { result: {} } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })
  return { submitted, reached, clock }
}

const edit = (file_path: string, new_string = 'export const a = 2') =>
  ({ tool: 'Edit', file_path, old_string: 'x', new_string }) as const

const bash = (command: string) => ({ tool: 'Bash', command, description: 'test' }) as const

const textOf = (r: unknown): string => {
  const o = r as { result?: unknown; deny?: string }
  return o.deny ?? (typeof o.result === 'string' ? o.result : '')
}

test('arguments de /refactor', () => {
  expect(parseCommand('src/utils/date.ts réduire la complexité')).toEqual({
    kind: 'start',
    target: 'src/utils/date.ts',
    goal: 'réduire la complexité',
    isPlanOnly: false,
  })
  expect(parseCommand('src/services --plan-only')).toEqual({ kind: 'start', target: 'src/services', goal: '', isPlanOnly: true })
  expect(parseCommand('"mon dossier/x.ts"')).toMatchObject({ target: 'mon dossier/x.ts' })
  expect(parseCommand('go')).toEqual({ kind: 'go' })
  expect(resolvePath('C:\\proj', 'src/../lib/./a.ts')).toBe('C:/proj/lib/a.ts')
})

test('commandes shell refusées pendant un refactor, tests autorisés', () => {
  expect(shellVerdict('git commit -m x')).toContain('git commit')
  expect(shellVerdict('git push origin main')).toContain('push')
  expect(shellVerdict('git reset --hard HEAD~1')).toContain('reset --hard')
  expect(shellVerdict('rm -rf src/old')).toContain('suppression')
  expect(shellVerdict("sed -i 's/a/b/' src/a.ts")).toContain('Edit ou Write')
  expect(shellVerdict('echo x > src/a.ts')).toContain('redirection')
  expect(shellVerdict('pnpm test 2>&1')).toBeNull()
  expect(shellVerdict('git diff -- src/a.ts')).toBeNull()
  expect(shellVerdict('node -e "[1].map(x => x)"')).toBeNull()
})

test('/refactor génère un plan avant toute modification', async ($, on) => {
  const { submitted, reached, clock } = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const started = await $.command.run(run('src/a.ts'))
  await clock.settle()
  expect(started?.text).toContain('Aucun fichier ne sera modifié avant ta validation')
  expect(submitted[0]).toContain('lecture seule')
  expect(submitted[0]).toContain('mcp__refactor__plan')

  // Pendant l'analyse : aucune écriture.
  expect(textOf(await $.tool.call(edit('/repo/src/a.ts')))).toContain('pas encore validé')

  const planned = await $.tool.call(PLAN as never)
  expect(textOf(planned)).toContain('ARRÊTE-TOI')

  // Plan reçu mais pas validé : toujours aucune écriture.
  expect(textOf(await $.tool.call(edit('/repo/src/a.ts')))).toContain('pas encore validé')
  expect(reached.filter(t => t === 'Edit' || t === 'Write')).toEqual([])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /en attente de validation/ }))?.text).toContain('2 étape(s)')
  expect(await ui.find({ key: 'refactor-go' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'moteur' })).toBeDefined()
  await ui.unmount()
})

test('--plan-only ne modifie aucun fichier', async ($, on) => {
  const { submitted, reached, clock } = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.command.run(run('src --plan-only'))
  await clock.settle()
  expect(submitted[0]).toContain('plan seul')
  expect(textOf(await $.tool.call(PLAN as never))).toContain(PLAN_ONLY_END('src'))

  expect(textOf(await $.tool.call(edit('/repo/src/a.ts')))).toContain('--plan-only')
  expect(textOf(await $.tool.call({ tool: 'Write', file_path: '/repo/src/new.ts', content: 'x' }))).toContain('--plan-only')
  expect(textOf(await $.tool.call(bash("sed -i 's/1/2/' src/a.ts")))).toContain('Edit ou Write')
  expect((await $.command.run(run('go')))?.text).toContain('Mode plan seul')

  // Lecture et tests passent ; aucune écriture n'atteint le moteur.
  await $.tool.call(bash('pnpm test'))
  expect(reached).toEqual(['Bash pnpm test'])
  expect(submitted).toHaveLength(1)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect(await pane.find({ type: 'Text', text: /Extraction de la validation JWT/ })).toBeDefined()
    await pane.unmount()
  }
})

test('aucun fichier modifié sans validation explicite, puis seulement dans le périmètre', async ($, on) => {
  const { submitted, reached, clock } = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run(run('src'))
  await clock.settle()
  await $.tool.call(PLAN as never)
  expect(textOf(await $.tool.call(edit('/repo/src/a.ts')))).toContain('pas encore validé')
  expect(reached).toEqual([])

  // Validation explicite : le bouton de la bande.
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'refactor-go' })
  await clock.settle()
  await ui.unmount()
  expect(submitted.at(-1)).toContain('étape 1/2')

  await $.tool.call(edit('/repo/src/a.ts'))
  expect(reached).toEqual(['Edit'])

  expect(textOf(await $.tool.call(edit('/repo/.env')))).toContain('fichier sensible')
  expect(textOf(await $.tool.call(edit('/repo/lib/x.ts')))).toContain('hors de l’étape')
  expect(textOf(await $.tool.call(edit('/repo/src/secret.ts')))).toContain('contient un secret')
  expect(textOf(await $.tool.call(edit('/repo/src/a.ts', `const k = "${FAKE_AWS}"`)))).toContain('contient un secret')
  expect(textOf(await $.tool.call(bash('git commit -am refactor')))).toContain('validation explicite')
  expect(textOf(await $.tool.call(bash('git reset --hard')))).toContain('validation explicite')
  expect(textOf(await $.tool.call(bash('rm src/b.ts')))).toContain('validation explicite')
  expect(reached).toEqual(['Edit'])
})

test('une étape à la fois : échec = pause, reprise, résumé final', async ($, on) => {
  const { submitted, reached, clock } = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run(run('src'))
  await clock.settle()
  await $.tool.call(PLAN as never)
  expect((await $.command.run(run('go')))?.text).toContain('étape 1/2')
  await clock.settle()

  const first = await $.tool.call({ tool: 'mcp__refactor__step', step: 1, status: 'ok', tests: 'OK' } as never)
  expect(textOf(first)).toContain('étape 2/2')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Refactor 2\/2 — Renommage des helpers/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /risque faible/ })).toBeDefined()
  await ui.unmount()

  // Tests en échec : pause, plus aucune écriture.
  const failed = await $.tool.call({ tool: 'mcp__refactor__step', step: 2, status: 'ok', tests: 'échec' } as never)
  expect(textOf(failed)).toContain('arrêtée')
  expect(textOf(await $.tool.call(edit('/repo/src/b.ts')))).toContain('en pause')
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /En pause/ }))?.text).toContain('échec')
  await ui.unmount()

  expect((await $.command.run(run('go')))?.text).toContain('étape 2/2')
  await clock.settle()
  expect(submitted.at(-1)).toContain('étape 2/2')
  await $.tool.call(edit('/repo/src/b.ts'))
  const last = await $.tool.call({ tool: 'mcp__refactor__step', step: 2, status: 'ok', tests: 'OK' } as never)
  expect(textOf(last)).toContain('résumé final')
  expect(textOf(last)).toContain('/repo/src/b.ts')

  // Refactor terminé : le mod ne garde plus les fichiers.
  await $.tool.call(edit('/repo/lib/x.ts'))
  expect(reached).toEqual(['Edit', 'Edit'])
})

test('sans tests détectés : prévient et propose des tests de caractérisation', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run(run('src/a.ts'))
  await clock.settle()
  const reply = await $.tool.call({ ...PLAN, hasTests: false } as never)
  expect(textOf(reply)).toContain('tests de caractérisation')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /aucun test détecté/ })).toBeDefined()
  await ui.unmount()
})

const KNIP_PLAN = {
  tool: 'mcp__refactor__plan',
  hasTests: true,
  testCommand: 'pnpm test',
  knip: [
    { kind: 'export', name: 'unusedHelper', file: 'src/a.ts', risk: 'faible', reason: 'aucun import' },
    { kind: 'fichier', name: 'src/old.ts', file: 'src/old.ts', risk: 'faible', reason: 'jamais importé' },
    { kind: 'fichier', name: 'src/page.tsx', file: 'src/page.tsx', risk: 'faible', reason: 'route du framework Next' },
  ],
  steps: [
    { title: 'Extraction de la validation JWT', files: ['src/a.ts'], risk: 'moyen', tests: ['pnpm test'] },
    { title: 'Exports inutilisés', kind: 'knip-export', files: ['src/a.ts'], risk: 'faible', tests: ['pnpm test'], knip: ['unusedHelper'] },
    { title: 'Fichiers morts', kind: 'knip-file', files: ['src/old.ts'], risk: 'faible', tests: ['pnpm test'], knip: ['src/old.ts'] },
  ],
} as const

const step = (n: number, tests = 'OK') => ({ tool: 'mcp__refactor__step', step: n, status: 'ok', tests }) as never

test('Knip n’est jamais lancé avec --fix sans validation explicite', async ($, on) => {
  const { submitted, reached, clock } = engine(on, WITH_KNIP)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Hors refactor aussi.
  expect(textOf(await $.tool.call(bash('npx knip --fix')))).toContain('jamais sans validation explicite')

  await $.command.run(run('src'))
  await clock.settle()
  expect(submitted[0]).toContain('Exécute `npx knip`')
  expect(submitted[0]).toContain('jamais `--fix`')

  // Analyse : knip en lecture seule passe, --fix jamais.
  await $.tool.call(bash('npx knip'))
  expect(textOf(await $.tool.call(bash('npx knip --fix --allow-remove-files')))).toContain('--fix')
  expect(textOf(await $.tool.call(bash('npx knip --fix-type exports')))).toContain('--fix')

  // Même après validation du plan et confirmation d'un nettoyage.
  await $.tool.call(KNIP_PLAN as never)
  await $.command.run(run('go'))
  await clock.settle()
  await $.tool.call(step(1))
  await $.command.run(run('go'))
  await clock.settle()
  expect(textOf(await $.tool.call(bash('npx knip --fix')))).toContain('--fix')
  expect(reached.filter(t => t.includes('knip'))).toEqual(['Bash npx knip'])
})

test('Knip absent : installation proposée, jamais exécutée', async ($, on) => {
  const { submitted, reached, clock } = engine(on, WITHOUT_KNIP)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run(run('src --plan-only'))
  await clock.settle()

  expect(submitted[0]).toContain('npm install -D knip')
  expect(submitted[0]).toContain('sans les exécuter')
  expect(textOf(await $.tool.call(bash('npm install -D knip')))).toContain('sans les exécuter')
  expect(textOf(await $.tool.call(bash('npx knip init')))).toContain('sans l’exécuter')
  expect(textOf(await $.tool.call(bash('npx knip')))).toContain('pas installé')
  expect(reached).toEqual([])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /Knip : non installé/ })).toBeDefined()
  await pane.unmount()
})

test('nettoyages Knip : un par un, chacun confirmé, suppression limitée aux fichiers confirmés', async ($, on) => {
  const { submitted, reached, clock } = engine(on, WITH_KNIP)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run(run('src'))
  await clock.settle()
  expect(textOf(await $.tool.call(KNIP_PLAN as never))).toContain('2 nettoyage(s) Knip')
  await $.command.run(run('go'))
  await clock.settle()

  // Étape 1 faite : l'étape 2 (exports) attend sa confirmation, rien ne s'écrit.
  expect(textOf(await $.tool.call(step(1)))).toContain('confirmation explicite')
  expect(textOf(await $.tool.call(edit('/repo/src/a.ts')))).toContain('pas encore confirmé')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Confirmation requise/ }))?.text).toContain('1 export(s) : unusedHelper')
  expect(await ui.find({ key: 'refactor-skip' })).toBeDefined()
  await ui.press({ key: 'refactor-go' })
  await clock.settle()
  await ui.unmount()
  expect(submitted.at(-1)).toContain('étape 2/3')

  // Étape 3 (fichiers morts) : rm refusé avant confirmation, puis limité au fichier confirmé.
  expect(textOf(await $.tool.call(step(2)))).toContain('confirmation explicite')
  expect(textOf(await $.tool.call(bash('rm src/old.ts')))).toContain('validation explicite')
  await $.command.run(run('go'))
  await clock.settle()
  expect(textOf(await $.tool.call(bash('rm src/a.ts')))).toContain('validation explicite')
  expect(textOf(await $.tool.call(bash('rm -rf src')))).toContain('validation explicite')
  await $.tool.call(bash('git rm src/old.ts'))
  expect(reached).toEqual(['Bash git rm src/old.ts'])

  expect(textOf(await $.tool.call(step(3)))).toContain('résumé final')

  // Panneau : statuts et résultats Knip, dont le fichier de framework laissé « à analyser ».
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /✓ terminée/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /knip · export unusedHelper/ })).toBeDefined()
  expect((await pane.find({ type: 'Text', text: /src\/page\.tsx/ }))?.text).toContain('élevé')
  await pane.unmount()
})

test('knip --fix : visé quand Knip est lancé, pas quand il est cité', () => {
  for (const run of [
    'npx knip --fix',
    'pnpm exec knip --fix-type exports',
    'cd app && npx -y knip@5 --fix --allow-remove-files',
    'bash -c "npx knip --fix"',
  ]) {
    expect(knipFixVerdict(run)).toContain('--fix')
  }
  const commit = "git commit -q -F - <<'EOF'\nNettoyages Knip ; knip --fix toujours refusé.\nEOF"
  expect(knipFixVerdict(commit)).toBeNull()
  expect(knipFixVerdict('npx knip --reporter json')).toBeNull()
  expect(knipFixVerdict('grep -r "fix" knip.json')).toBeNull()
})

test('Knip : risque élevé forcé, jamais de suppression d’un fichier à risque élevé, ordre des nettoyages', () => {
  expect(knipItemOf({ kind: 'fichier', name: 'x.ts', risk: 'faible', reason: 'import dynamique' })?.risk).toBe('élevé')
  expect(knipItemOf({ kind: 'export', name: 'y', risk: 'faible', reason: 'aucun import' })?.risk).toBe('faible')

  const risky = parsePlan({
    hasTests: true,
    knip: [{ kind: 'fichier', name: 'next.config.js', risk: 'faible', reason: 'configuration du framework' }],
    steps: [{ title: 'Fichiers morts', kind: 'knip-file', files: ['next.config.js'], risk: 'faible', tests: [], knip: ['next.config.js'] }],
  })
  expect(risky).toContain('risque élevé')

  const disorder = parsePlan({
    hasTests: true,
    steps: [
      { title: 'Fichiers', kind: 'knip-file', files: ['a.ts'], risk: 'faible', tests: [] },
      { title: 'Exports', kind: 'knip-export', files: ['b.ts'], risk: 'faible', tests: [] },
    ],
  })
  expect(disorder).toContain('exports, puis dépendances, puis fichiers')
})
