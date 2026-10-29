import type { On, RenderElement } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { applyPlan, bar, estimate, formatElapsed, newTask, statusText, stepOf } from '../hooks/progress'

const BAND = {
  plugin: 'fil',
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
}

const TYPED = {
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 100 },
}

describe('progress', () => {
  test('formats elapsed time', () => {
    expect(formatElapsed(4200)).toBe('4s')
    expect(formatElapsed(83000)).toBe('1m23s')
    expect(formatElapsed(3720000)).toBe('1h02m')
  })

  test('draws a bar of the given width', () => {
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(100, 4)).toBe('████')
  })

  test('estimates from the plan, never 100 while running', () => {
    const t = applyPlan(
      newTask({ id: 't', kind: 'turn', agentId: null, title: 'x', startedAt: 0 }),
      'TodoWrite',
      {
        todos: [
          { content: 'a', status: 'completed', activeForm: 'A' },
          { content: 'b', status: 'in_progress', activeForm: 'Writing tests' },
          { content: 'c', status: 'pending', activeForm: 'C' },
          { content: 'd', status: 'pending', activeForm: 'D' },
        ],
      },
    )
    expect(t.step).toBe('Writing tests')
    expect(estimate(t, 0)).toBe(38)
    expect(estimate({ ...t, planDone: 4 }, 0)).toBe(95)
    expect(estimate({ ...t, status: 'done' }, 0)).toBe(100)
  })

  test('labels tool calls', () => {
    expect(stepOf('Edit', { file_path: 'C:\\src\\app.ts' })).toBe('Edit app.ts')
    expect(stepOf('Bash', { command: 'pnpm test', description: 'Run tests' })).toBe('Bash : Run tests')
    expect(stepOf('mcp__n8n__search_nodes', {})).toBe('search_nodes (n8n)')
    expect(stepOf('mcp__a__b', {})).toBe('b (a)')
    expect(stepOf('mcp__plugin_x_y__do__it', {})).toBe('do__it (plugin_x_y)')
    expect(stepOf('mcp__a__b__c__d', {})).toBe('b__c__d (a)')
    expect(stepOf('mcp___a__b', {})).toBe('b (_a)')
    expect(stepOf('mcp__a___b', {})).toBe('_b (a)')
    expect(stepOf('mcp____x', {})).toBe('mcp____x')
    expect(stepOf('mcp__a__', {})).toBe('mcp__a__')
    expect(stepOf('mcp__a', {})).toBe('mcp__a')
  })
})

describe('band', () => {
  test('a turn shows a bar, then 100% in green when done', async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('tool.call', () => ({ deny: 'test bottom' }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, 'engine') as RenderElement
    })

    await $.turn.start({ text: 'Refactorer le module auth\nen détail', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/auth.ts' })
    await clock.advance(5000)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Refactorer le module auth' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read auth\.ts/ })).toBeDefined()

    await clock.advance(20000)
    await $.turn.complete({ answer: 'ok', durationMs: 25000, isAborted: false, turnId: 't1', reason: 'answer' })
    const done = await ui.find({ type: 'Text', text: /100%/ })
    expect(done).toBeDefined()
    const title = await ui.find({ type: 'Text', text: /✔ Refactorer/ })
    expect(title?.props.color).toBe('success')
    // The band beneath (jauge) is still drawn under the bars.
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  })

  test('a subagent gets its own bar', async ($, on) => {
    mock.clock(on, { now: 2_000_000 })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ deny: 'test bottom' }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, 'engine') as RenderElement
    })

    await $.turn.start({ text: 'Tâche principale', turnId: 'main' })
    await $.turn.start({ text: 'Cherche les usages', turnId: 'sub', agentId: 'agent-1' })
    // A subagent's call carries its agentId, as the engine stamps it.
    const fromAgent = { tool: 'Grep' as const, pattern: 'useAuth', agentId: 'agent-1' }
    await $.tool.call(fromAgent)
    await $.tool.call({ tool: 'Glob', pattern: '**/*.ts' })

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Tâche principale/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /◆ Cherche les usages/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Grep useAuth/ })).toBeDefined()
  })

  test('/fil toggles the band', async ($, on) => {
    mock.clock(on, { now: 3_000_000 })
    mock.store(on)
    // The engine's own band, drawn when fil hands the site on.
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, 'engine') as RenderElement
    })
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ deny: 'test bottom' }))

    const off = await $.command.run({ command: 'fil', args: 'off', ...TYPED })
    expect(off.text).toContain('désactivé')
    await $.turn.start({ text: 'Invisible', turnId: 't2' })
    await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
    let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Invisible/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()

    const onAgain = await $.command.run({ command: 'fil', args: '', ...TYPED })
    expect(onAgain.text).toContain('activé')
    await $.turn.start({ text: 'Visible', turnId: 't3' })
    await $.tool.call({ tool: 'Read', file_path: '/b.ts' })
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Visible/ })).toBeDefined()
  })
})

// The engine beneath fil, with a store that fails on demand (`fail` can change mid-test):
// `hang` leaves every store.set pending forever, `badKeys` makes store.get throw for those keys only,
// `register` makes command.register throw.
type Fail = {
  get?: boolean
  set?: boolean
  delete?: boolean
  keys?: boolean
  hang?: boolean
  badKeys?: string[]
  register?: boolean
}
const failingEngine = (on: On, fail: Fail, entries: Record<string, unknown> = {}) => {
  const calls = {
    registered: 0,
    opens: 0,
    setTries: 0,
    sets: 0,
    deletes: 0,
    statuses: [] as (string | undefined)[],
    nextReached: false,
  }
  const store: Record<string, unknown> = { ...entries }
  on('session.start', (_$, e) => {
    calls.nextReached = true
    return { cwd: e.cwd }
  })
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: 'session-1' }) as never)
  on('ui.open', () => {
    calls.opens += 1
    return { value: { isPlaced: true } } as never
  })
  on('ui.status', (_$, e) => {
    calls.statuses.push(e.text)
    return { value: undefined } as never
  })
  on('command.register', () => {
    calls.registered += 1
    if (fail.register) throw new Error('command refused')
    return { value: undefined } as never
  })
  on('store.get', (_$, e) => {
    if (fail.get || fail.badKeys?.includes(e.key)) throw new Error('unreadable store')
    return { value: store[e.key] } as never
  })
  on('store.set', async (_$, e) => {
    calls.setTries += 1
    if (fail.hang) await new Promise(() => undefined)
    if (fail.set) throw new Error('read-only store')
    calls.sets += 1
    store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.keys', () => {
    if (fail.keys) throw new Error('unreadable store')
    return { value: Object.keys(store) } as never
  })
  on('store.delete', (_$, e) => {
    calls.deletes += 1
    if (fail.delete) throw new Error('read-only store')
    delete store[e.key]
    return { value: undefined } as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ deny: 'test bottom' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'engine') as RenderElement
  })
  return calls
}

const START = { cwd: '/projets/fil', surface: 'terminal' as const, isInteractive: true }
const END = { reason: 'other' as const, sessionId: 'session-1', resume: { id: 'session-1' } }

// Each test starts its own session: session.start resets fil's sharing state,
// so nothing depends on the tests before it.
describe('storage errors', () => {
  test('store.get fails: session.start completes, no pane opens, /fil status says so', async ($, on) => {
    mock.clock(on, { now: 4_000_000 })
    const calls = failingEngine(on, { get: true })

    expect(await $.session.start(START)).toMatchObject({ cwd: '/projets/fil' })
    expect(calls.registered).toBe(1)
    expect(calls.opens).toBe(0)
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).toContain('fil activé (choix enregistré illisible)')
  })

  test('a readable choice set to on opens the pane at session start', async ($, on) => {
    mock.clock(on, { now: 4_500_000 })
    const calls = failingEngine(on, {}, { enabled: true })

    await $.session.start(START)
    expect(calls.opens).toBe(1)
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).not.toContain('illisible')
  })

  test('a saved enabled: false keeps the pane closed at session start', async ($, on) => {
    mock.clock(on, { now: 4_600_000 })
    const calls = failingEngine(on, {}, { enabled: false })

    await $.session.start(START)
    expect(calls.opens).toBe(0)
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).toContain('fil désactivé ·')
  })

  test('store.set fails on /fil off: fil turns off, says so, and clears its tasks', async ($, on) => {
    mock.clock(on, { now: 5_000_000 })
    const calls = failingEngine(on, { set: true })

    await $.session.start(START)
    await $.turn.start({ text: 'Tâche en cours', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
    const off = await $.command.run({ command: 'fil', args: 'off', ...TYPED })
    expect(off.text).toBe('fil désactivé. (choix non conservé pour les prochaines sessions)')
    // The write was tried, and refused.
    expect(calls.setTries).toBe(1)
    expect(calls.sets).toBe(0)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Tâche en cours/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).toContain('0 tâche(s)')
  })

  test('store.delete fails at session end: session.end completes, no tick publishes again', async ($, on) => {
    const clock = mock.clock(on, { now: 6_000_000 })
    const calls = failingEngine(on, { delete: true })

    await $.session.start(START)
    await $.turn.start({ text: 'Tâche partagée', turnId: 't1' })
    // Ticks 1 and 2 after the start: the second one publishes.
    await clock.advance(2000)
    expect(calls.sets).toBe(1)

    expect(await $.session.end(END)).toMatchObject({ sessionId: 'session-1' })
    expect(calls.deletes).toBe(1)
    await clock.advance(4000)
    expect(calls.sets).toBe(1)
  })

  test('unreadable store in tick: the update is skipped, then stale bars are dropped', async ($, on) => {
    const clock = mock.clock(on, { now: 7_000_000 })
    // Another session, kept fresh: only the unreadable store can drop its bar.
    const other = { updatedAt: 9_000_000_000, label: 'autre', tasks: [newTask({ id: 'o', kind: 'turn', agentId: null, title: 'Tâche distante', startedAt: 7_000_000 })] }
    const fail: Fail = {}
    failingEngine(on, fail, { 's:other': other })

    await $.session.start(START)
    await clock.advance(2000)
    let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /⇄ autre · Tâche distante/ })).toBeDefined()
    await ui.unmount()

    fail.keys = true
    await clock.advance(4000)
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /⇄ autre/ })).toBeDefined()
    await ui.unmount()

    await clock.advance(10_000)
    ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /⇄ autre/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  })

  test('a hung store never freezes the status line nor the pruning of done tasks', async ($, on) => {
    const clock = mock.clock(on, { now: 8_000_000 })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const fail: Fail = { hang: true }
    const calls = failingEngine(on, fail)

    await $.session.start(START)
    await $.turn.start({ text: 'Tâche bloquée', turnId: 't1' })
    // A tool call makes the running task visible on the status line.
    await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
    // Tick 2 starts sharing and its store.set never settles.
    await clock.advance(2000)
    expect(calls.setTries).toBe(1)
    expect(calls.statuses.at(-1)).toMatch(/^▶ .*Read a\.ts/)

    await $.turn.complete({ answer: 'ok', durationMs: 2000, isAborted: false, turnId: 't1', reason: 'answer' })
    // Past KEEP_DONE_MS, the local part still prunes the done task and clears the status line.
    await clock.advance(10_000)
    expect(calls.statuses.at(-1)).toBeUndefined()
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).toContain('0 tâche(s)')
    // The hung pass is still the only one: sharing never stacked.
    expect(calls.setTries).toBe(1)

    // A new session shares again, despite the lock the hung pass left behind.
    fail.hang = false
    await $.session.start(START)
    await $.turn.start({ text: 'Tâche suivante', turnId: 't2' })
    await clock.advance(2000)
    expect(calls.setTries).toBe(2)
    expect(calls.sets).toBe(1)
  })

  test('an unreadable remote entry never hides the readable sessions', async ($, on) => {
    const clock = mock.clock(on, { now: 9_000_000 })
    const fresh = (label: string, title: string) => ({
      updatedAt: 9_000_000_000,
      label,
      tasks: [newTask({ id: label, kind: 'turn', agentId: null, title, startedAt: 9_000_000 })],
    })
    failingEngine(on, { badKeys: ['s:cassee'] }, { 's:cassee': fresh('cassée', 'Illisible'), 's:saine': fresh('saine', 'Lisible') })

    await $.session.start(START)
    await clock.advance(2000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /⇄ saine · Lisible/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⇄ cassée/ })).toBeUndefined()
    // Still there long after: the bad entry is skipped, not a reason to drop the others.
    await clock.advance(20_000)
    const later = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await later.find({ type: 'Text', text: /⇄ saine · Lisible/ })).toBeDefined()
  })
})

describe('command.register errors', () => {
  test('command.register fails: the rest of the setup still runs and the pane opens', async ($, on) => {
    mock.clock(on, { now: 7_000_000 })
    const calls = failingEngine(on, { register: true }, { enabled: true })

    expect(await $.session.start(START)).toMatchObject({ cwd: '/projets/fil' })
    expect(calls.registered).toBe(1)
    expect(calls.opens).toBe(1)
    expect(calls.nextReached).toBe(true)
  })

  // enabled: false differs from the default, so this proves the saved choice is read back.
  test('command.register fails: a saved enabled: false is still read back', async ($, on) => {
    mock.clock(on, { now: 7_100_000 })
    const calls = failingEngine(on, { register: true }, { enabled: false })

    expect(await $.session.start(START)).toMatchObject({ cwd: '/projets/fil' })
    expect(calls.opens).toBe(0)
    const status = await $.command.run({ command: 'fil', args: 'status', ...TYPED })
    expect(status.text).toContain('fil désactivé ·')
  })
})

describe('status line', () => {
  test('summarises running tasks, then the finished one', () => {
    const t = { ...newTask({ id: 'a', kind: 'turn', agentId: null, title: 'x', startedAt: 0 }), tools: 2, step: 'Edit app.ts' }
    expect(statusText([t], 65000)).toContain('▶')
    expect(statusText([t], 65000)).toContain('1m05s · Edit app.ts')
    expect(statusText([{ ...t, status: 'done', endedAt: 5000, step: 'Terminé' }], 9000)).toContain('✔ 100%')
    expect(statusText([], 0)).toBe('')
  })
})
