import { expect, mock, test } from 'claude-code/testing'

import { bar, colorFor, formatRemaining, formatResetAt, formatTokens } from '../hooks/format'

const T0 = Date.parse('2026-10-19T10:00:00Z')

const BAND = {
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

const FIGURES = {
  startedAt: T0,
  context: { window: 200_000, tokens: 70_000, percent: 35 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 52, resetsAt: new Date(T0 + 133 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: 71 },
  ],
  cost: { usd: 1.5 },
}

const RUN = {
  command: 'jauge',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 140 },
} as const

test('seuils de couleur et formats', async () => {
  expect(colorFor(39)).toBe('success')
  expect(colorFor(40)).toBe('warning')
  expect(colorFor(60)).toBe('warning')
  expect(colorFor(61)).toBe('error')
  expect(formatRemaining(133 * 60_000)).toBe('2h13')
  expect(formatRemaining(-5)).toBe('0 min')
  expect(formatTokens(12_345)).toBe('12.3k')
  expect(bar(50, 10)).toBe('█████░░░░░')
})

test('heure du reset en heure locale', async () => {
  // Lundi 19 octobre 2026, 18h25 (heure locale).
  const now = new Date(2026, 9, 19, 18, 25).getTime()
  expect(formatResetAt(new Date(2026, 9, 19, 21, 51).getTime(), now)).toBe('21h51')
  expect(formatResetAt(new Date(2026, 9, 20, 9, 5).getTime(), now)).toBe('demain 09h05')
  expect(formatResetAt(new Date(2026, 9, 26, 9, 0).getTime(), now)).toBe('lun. 09h00')
})

test('la bande affiche les chiffres et /jauge la bascule', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  // Ce que le moteur dessinerait quand la jauge passe la main (désactivée).
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })

  await $.session.measure({
    context: FIGURES.context,
    rateLimits: FIGURES.rateLimits,
    cost: FIGURES.cost,
    changed: ['context', 'rateLimits', 'cost'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'jauge', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /^Contexte/ })).toBeDefined()
    const ctx = await ui.find({ type: 'Text', text: /^█+░+ +35%$/ })
    expect(ctx?.props.color).toBe('success')

    const five = await ui.find({ type: 'Text', text: /^█+░+ +52%$/ })
    expect(five?.props.color).toBe('warning')
    const reset = formatResetAt(T0 + 133 * 60_000, T0)
    expect(await ui.find({ type: 'Text', text: ` · reset ${reset}` })).toBeDefined()

    const seven = await ui.find({ type: 'Text', text: /^█+░+ +71%$/ })
    expect(seven?.props.color).toBe('error')
    // Pas d'heure de reset connue pour la fenêtre 7 jours ici : une seule ligne de reset.
    expect(await ui.findAll({ type: 'Text', text: /reset/ })).toHaveLength(1)

    expect((await ui.find({ type: 'Text', text: /^Récent/ }))?.text).toContain('session $1.50')
    // Les mods en dessous (fil) restent dessinés sous la jauge.
    expect(await ui.find({ type: 'Text', text: 'moteur' })).toBeDefined()
    await ui.unmount()
  }

  expect(await $.command.run(RUN)).toMatchObject({ text: 'Jauge désactivée.' })
  const hidden = await $.ui.mount({ plugin: 'jauge', surface: 'terminal', ...BAND })
  expect(await hidden.find({ type: 'Text', text: /^Contexte/ })).toBeUndefined()
  expect(await hidden.find({ type: 'Text', text: 'moteur' })).toBeDefined()
  await hidden.unmount()

  expect(await $.command.run(RUN)).toMatchObject({ text: 'Jauge activée.' })
})

test('tokens du dernier tour après turn.complete', async ($, on) => {
  // $.session.usage n'a pas d'implémentation dans le kit de test : la jauge
  // doit quand même enregistrer les tokens du tour.
  mock.clock(on, { now: T0 })
  on('turn.complete', async () => ({ text: '' }))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })
  await $.turn.complete({
    usage: {
      input_tokens: 1000,
      output_tokens: 2000,
      cache_read_input_tokens: 9000,
      cache_creation_input_tokens: 300,
      model: 'claude-opus-5-5',
    },
  } as never)

  const ui = await $.ui.mount({ plugin: 'jauge', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /^Récent/ }))?.text).toBe('Récent 12.3k tok/tour')
  await ui.unmount()
})
