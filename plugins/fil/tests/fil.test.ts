import type { RenderElement } from 'claude-code'
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

describe('status line', () => {
  test('summarises running tasks, then the finished one', () => {
    const t = { ...newTask({ id: 'a', kind: 'turn', agentId: null, title: 'x', startedAt: 0 }), tools: 2, step: 'Edit app.ts' }
    expect(statusText([t], 65000)).toContain('▶')
    expect(statusText([t], 65000)).toContain('1m05s · Edit app.ts')
    expect(statusText([{ ...t, status: 'done', endedAt: 5000, step: 'Terminé' }], 9000)).toContain('✔ 100%')
    expect(statusText([], 0)).toBe('')
  })
})
