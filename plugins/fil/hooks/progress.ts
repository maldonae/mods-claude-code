import type { FilTask } from '../types'

/** A running task gets a bar once it has run this long (or called a tool). */
export const SHOW_AFTER_MS = 3000
/** A task that ran at least this long chimes when it ends. */
export const LONG_MS = 15000
/** A finished bar stays this long, green, before it leaves. */
export const KEEP_DONE_MS = 8000
/** Another session's entry older than this is stale. */
export const REMOTE_STALE_MS = 10000

/** Estimated progress, 0..100. Only a finished task reaches 100. */
export function estimate(t: FilTask, now: number): number {
  if (t.status !== 'running') return 100
  if (t.planTotal > 0) {
    return Math.max(1, Math.min(95, Math.round((t.planDone / t.planTotal) * 100)))
  }
  // No plan: an asymptotic guess from tool calls, nudged by time.
  const byTools = 1 - Math.exp(-t.tools / 10)
  const byTime = 1 - Math.exp(-Math.max(0, now - t.startedAt) / 120000)
  return Math.max(1, Math.min(90, Math.round((0.7 * byTools + 0.3 * byTime) * 100)))
}

export function isVisible(t: FilTask, now: number): boolean {
  if (t.status !== 'running') return true
  return t.tools > 0 || now - t.startedAt >= SHOW_AFTER_MS
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function bar(percent: number, width: number): string {
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

export function truncate(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, Math.max(1, max - 1))}…`
}

export function titleOf(text: string): string {
  const line = text.trim().split('\n').find(l => l.trim() !== '') ?? ''
  return truncate(line, 80) || 'Tâche'
}

function baseName(path: unknown): string {
  return typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : ''
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** A short label for what a tool call is doing. */
export function stepOf(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return `${tool} : ${truncate(str(input.description) || str(input.command), 50)}`
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `${tool} ${baseName(input.file_path ?? input.notebook_path)}`
    case 'Grep':
    case 'Glob':
      return `${tool} ${truncate(str(input.pattern), 40)}`
    case 'Agent':
      return `Sous-agent : ${truncate(str(input.description), 40)}`
    case 'WebFetch':
      return `WebFetch ${truncate(str(input.url), 40)}`
    case 'WebSearch':
      return `WebSearch ${truncate(str(input.query), 40)}`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Mise à jour du plan'
    case 'EnterPlanMode':
      return 'Planification'
    case 'ExitPlanMode':
      return 'Plan proposé'
  }
  if (tool.startsWith('mcp__')) {
    const sep = tool.indexOf('__', 6)
    if (sep !== -1 && sep + 2 < tool.length) return `${tool.slice(sep + 2)} (${tool.slice(5, sep)})`
  }
  return tool
}

type Todo = { status?: unknown; activeForm?: unknown; content?: unknown }

/** Applies a plan tool call to a task's plan counters and step. */
export function applyPlan(t: FilTask, tool: string, input: Record<string, unknown>): FilTask {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos = input.todos as Todo[]
    const done = todos.filter(x => x.status === 'completed').length
    const active = todos.find(x => x.status === 'in_progress')
    return {
      ...t,
      planTotal: todos.length,
      planDone: done + (active ? 0.5 : 0),
      step: active ? truncate(str(active.activeForm) || str(active.content), 60) : t.step,
    }
  }
  if (tool === 'TaskCreate') return { ...t, planTotal: t.planTotal + 1 }
  if (tool === 'TaskUpdate') {
    const label = str(input.activeForm) || str(input.subject)
    switch (input.status) {
      case 'completed':
        return { ...t, planDone: Math.min(t.planTotal, Math.floor(t.planDone) + 1) }
      case 'in_progress':
        return { ...t, planDone: Math.floor(t.planDone) + 0.5, step: label ? truncate(label, 60) : t.step }
      case 'deleted':
        return { ...t, planTotal: Math.max(0, t.planTotal - 1) }
    }
  }
  return t
}

export function newTask(fields: Pick<FilTask, 'id' | 'kind' | 'agentId' | 'title' | 'startedAt'>): FilTask {
  return {
    ...fields,
    step: 'Démarrage…',
    status: 'running',
    endedAt: null,
    tools: 0,
    planDone: 0,
    planTotal: 0,
  }
}

/** One line for the status line: each running task, or the last finished one. */
export function statusText(list: readonly FilTask[], now: number): string {
  const running = list.filter(t => t.status === 'running' && isVisible(t, now))
  const shown = running.length > 0 ? running : list.filter(t => t.status !== 'running').slice(-1)
  return shown
    .map(t => {
      const percent = estimate(t, now)
      const icon = t.status === 'done' ? '✔' : t.status === 'aborted' ? '■' : t.kind === 'agent' ? '◆' : '▶'
      const elapsed = formatElapsed((t.endedAt ?? Math.max(now, t.startedAt)) - t.startedAt)
      return `${icon} ${percent}% ${bar(percent, 8)} ${elapsed} · ${truncate(t.step, 30)}`
    })
    .join('  |  ')
}
