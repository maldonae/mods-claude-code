// Tests Node natifs des helpers purs, pour la couverture (scripts/coverage.mjs).
// Les tests du harnais (fil.test.ts, via `claude plugin test`) restent la référence.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  applyPlan,
  bar,
  estimate,
  formatElapsed,
  isVisible,
  newTask,
  statusText,
  stepOf,
  titleOf,
  truncate,
} from '../hooks/progress.ts'

const task = (over = {}) => ({ ...newTask({ id: 't', kind: 'turn', agentId: null, title: 'x', startedAt: 0 }), ...over })

describe('progress', () => {
  test('formatElapsed', () => {
    assert.equal(formatElapsed(-1), '0s')
    assert.equal(formatElapsed(4200), '4s')
    assert.equal(formatElapsed(83000), '1m23s')
    assert.equal(formatElapsed(3720000), '1h02m')
  })

  test('bar', () => {
    assert.equal(bar(50, 10), '█████░░░░░')
    assert.equal(bar(150, 4), '████')
    assert.equal(bar(-5, 3), '░░░')
  })

  test('truncate et titleOf', () => {
    assert.equal(truncate('  a \n b  ', 10), 'a b')
    assert.equal(truncate('abcdef', 4), 'abc…')
    assert.equal(titleOf('\n  \nPremière ligne\nSuite'), 'Première ligne')
    assert.equal(titleOf('   '), 'Tâche')
  })

  test('estimate et isVisible', () => {
    assert.equal(estimate(task({ status: 'done' }), 0), 100)
    assert.equal(estimate(task({ planTotal: 4, planDone: 1.5 }), 0), 38)
    assert.equal(estimate(task({ planTotal: 4, planDone: 4 }), 0), 95)
    assert.equal(estimate(task(), 0), 1)
    assert.ok(estimate(task({ tools: 50 }), 600000) <= 90)
    assert.equal(isVisible(task({ status: 'aborted' }), 0), true)
    assert.equal(isVisible(task(), 1000), false)
    assert.equal(isVisible(task(), 3000), true)
    assert.equal(isVisible(task({ tools: 1 }), 0), true)
  })

  test('stepOf', () => {
    assert.equal(stepOf('Bash', { command: 'pnpm test', description: 'Run tests' }), 'Bash : Run tests')
    assert.equal(stepOf('PowerShell', { command: 'ls' }), 'PowerShell : ls')
    assert.equal(stepOf('Edit', { file_path: 'C:\\src\\app.ts' }), 'Edit app.ts')
    assert.equal(stepOf('NotebookEdit', { notebook_path: '/a/b.ipynb' }), 'NotebookEdit b.ipynb')
    assert.equal(stepOf('Read', {}), 'Read ')
    assert.equal(stepOf('Grep', { pattern: 'foo' }), 'Grep foo')
    assert.equal(stepOf('Agent', { description: 'Explore' }), 'Sous-agent : Explore')
    assert.equal(stepOf('WebFetch', { url: 'https://x.y' }), 'WebFetch https://x.y')
    assert.equal(stepOf('WebSearch', { query: 'q' }), 'WebSearch q')
    assert.equal(stepOf('TodoWrite', {}), 'Mise à jour du plan')
    assert.equal(stepOf('EnterPlanMode', {}), 'Planification')
    assert.equal(stepOf('ExitPlanMode', {}), 'Plan proposé')
    assert.equal(stepOf('mcp__n8n__search_nodes', {}), 'search_nodes (n8n)')
    assert.equal(stepOf('mcp__plugin_x_y__do__it', {}), 'do__it (plugin_x_y)')
    assert.equal(stepOf('mcp____x', {}), 'mcp____x')
    assert.equal(stepOf('mcp__a__', {}), 'mcp__a__')
    assert.equal(stepOf('Unknown', {}), 'Unknown')
  })

  test('applyPlan', () => {
    const t = applyPlan(task(), 'TodoWrite', {
      todos: [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'in_progress', activeForm: 'Writing tests' },
        { content: 'c', status: 'pending' },
      ],
    })
    assert.deepEqual([t.planTotal, t.planDone, t.step], [3, 1.5, 'Writing tests'])
    assert.equal(applyPlan(task(), 'TodoWrite', { todos: [{ status: 'pending' }] }).step, 'Démarrage…')

    const created = applyPlan(task({ planTotal: 1 }), 'TaskCreate', {})
    assert.equal(created.planTotal, 2)
    const started = applyPlan(created, 'TaskUpdate', { status: 'in_progress', subject: 'Sujet' })
    assert.deepEqual([started.planDone, started.step], [0.5, 'Sujet'])
    assert.equal(applyPlan(created, 'TaskUpdate', { status: 'in_progress' }).step, 'Démarrage…')
    assert.equal(applyPlan(started, 'TaskUpdate', { status: 'completed' }).planDone, 1)
    assert.equal(applyPlan(task(), 'TaskUpdate', { status: 'deleted' }).planTotal, 0)
    assert.equal(applyPlan(created, 'TaskUpdate', { status: 'pending' }), created)
    assert.equal(applyPlan(created, 'Read', {}), created)
  })

  test('statusText', () => {
    const running = task({ tools: 1, step: 'Edit a.ts' })
    assert.match(statusText([running], 5000), /^▶ \d+% .{8} 5s · Edit a\.ts$/)
    assert.match(statusText([task({ kind: 'agent', tools: 1 })], 0), /^◆ /)
    const done = task({ status: 'done', endedAt: 2000 })
    assert.equal(statusText([task(), done], 1000), `✔ 100% ${bar(100, 8)} 2s · Démarrage…`)
    assert.match(statusText([task({ status: 'aborted', endedAt: 0 })], 0), /^■ /)
    assert.equal(statusText([], 0), '')
  })
})
