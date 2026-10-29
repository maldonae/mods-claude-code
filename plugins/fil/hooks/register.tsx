import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { FilRemote, FilStatus, FilTask } from '../types'
import {
  KEEP_DONE_MS,
  LONG_MS,
  REMOTE_STALE_MS,
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
} from './progress'

const enabled = atom({ plugin: 'fil', key: 'enabled' } as const, true)
const tasks = atom({ plugin: 'fil', key: 'tasks' } as const, [])
const remote = atom({ plugin: 'fil', key: 'remote' } as const, [])
const clockNow = atom({ plugin: 'fil', key: 'now' } as const, 0)

const STORE_ENABLED = 'enabled'
const STORE_SESSION = 's:'
const MAX_BARS = 6
const PANE = 'fil'

type Pending = { prompt: string; description: string }

// Module state: a hot reload starts it over; what the bars draw lives in $.state.
const ctx = {
  sessionKey: '',
  label: '',
  ticks: 0,
  hasPublished: false,
  lastChime: 0,
  lastStatus: '',
  /** Last tick that read other sessions from the store. */
  lastShared: 0,
  /** The saved /fil choice could not be read at session start. */
  isChoiceUnread: false,
  stopTick: undefined as (() => void) | undefined,
  /** A sharing pass is running: the next one waits its turn. */
  isSharing: false,
}
/** Events seen since load, for `/fil status`. */
const seen = { submit: 0, turnStart: 0, tool: 0, complete: 0, render: 0, pane: 0, tick: 0 }
const pending: Pending[] = []

function taskFor(list: readonly FilTask[], agentId: string | undefined): FilTask | undefined {
  return agentId === undefined
    ? [...list].reverse().find(t => t.kind === 'turn' && t.status === 'running')
    : list.find(t => t.agentId === agentId)
}

/** Starts the main bar, or renames the one already running for this prompt. */
async function startMain($: EngineInterface, id: string, text: string, now: number): Promise<void> {
  await update($, tasks, l => {
    const running = taskFor(l, undefined)
    if (running !== undefined) {
      return l.map(t => (t === running ? { ...t, id, title: text.trim() ? titleOf(text) : t.title } : t))
    }
    const task = newTask({ id, kind: 'turn', agentId: null, title: titleOf(text), startedAt: now })
    return [...l.filter(t => t.kind !== 'turn' || t.status === 'running'), task].slice(-20)
  })
}

async function chime($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  if (now - ctx.lastChime < 2000) return
  ctx.lastChime = now
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const argv = isWindows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', '[console]::beep(880,110);[console]::beep(1320,150)']
    : ['afplay', '/System/Library/Sounds/Glass.aiff']
  // Not awaited: the chime never holds the session.
  void $.process.run(argv, { timeoutMs: 5000 }).catch(() =>
    isWindows ? undefined : $.process.run(['paplay', '/usr/share/sounds/freedesktop/stereo/complete.oga'], { timeoutMs: 5000 }).catch(() => undefined),
  )
}

async function tick($: EngineInterface): Promise<void> {
  seen.tick += 1
  const now = await $.clock.now()
  const list = await read($, tasks)
  const kept = list.filter(t => t.status === 'running' || now - (t.endedAt ?? now) < KEEP_DONE_MS)
  if (kept.length !== list.length) await update($, tasks, l => l.filter(t => kept.some(k => k.id === t.id)))
  if (kept.length > 0 || (await read($, remote)).length > 0) await update($, clockNow, () => now)
  // The status line: shown wherever the band above the prompt is not drawn.
  const line = (await read($, enabled)) ? statusText(kept, now) : ''
  if (line !== ctx.lastStatus) {
    ctx.lastStatus = line
    $.ui.status(line === '' ? undefined : line)
  }

  ctx.ticks += 1
  if (ctx.sessionKey === '' || ctx.ticks % 2 !== 0) return
  // One sharing pass at a time: a slow or hung store must not stack passes,
  // and never holds the local part above, which runs on every tick.
  if (ctx.isSharing) return
  ctx.isSharing = true
  try {
    await share($, now, kept)
  } finally {
    ctx.isSharing = false
  }
}

/** Cross-session sharing through $.store, best effort: each session writes its own key. */
async function share($: EngineInterface, now: number, kept: readonly FilTask[]): Promise<void> {
  // A failed write is retried on a later tick.
  if (kept.length > 0) {
    const entry = { updatedAt: now, label: ctx.label, tasks: kept }
    if (await $.store.set(STORE_SESSION + ctx.sessionKey, entry).then(() => true, () => false)) ctx.hasPublished = true
  } else if (ctx.hasPublished) {
    if (await $.store.delete(STORE_SESSION + ctx.sessionKey).then(() => true, () => false)) ctx.hasPublished = false
  }
  const others = await readOthers($, now)
  if (others !== undefined) ctx.lastShared = now
  // Unreadable store: skip this tick, but never keep other sessions' bars past their staleness.
  const shared = others ?? (now - ctx.lastShared > REMOTE_STALE_MS ? [] : undefined)
  if (shared === undefined) return
  const before = await read($, remote)
  if (JSON.stringify(before) !== JSON.stringify(shared)) await update($, remote, () => shared)
}

/**
 * Other sessions' tasks from the store, or undefined when its keys cannot be read this tick.
 * An unreadable entry is skipped on its own: it never hides the readable ones.
 */
async function readOthers($: EngineInterface, now: number): Promise<FilRemote[] | undefined> {
  const keys = await $.store.keys().catch(() => undefined)
  if (keys === undefined) return undefined
  const others: FilRemote[] = []
  for (const key of keys) {
    if (!key.startsWith(STORE_SESSION) || key === STORE_SESSION + ctx.sessionKey) continue
    const got = await $.store.get(key).then(
      value => ({ entry: value as { updatedAt?: number; label?: string; tasks?: FilTask[] } | undefined }),
      () => undefined,
    )
    if (got === undefined) continue
    const { entry } = got
    if (entry?.updatedAt === undefined || now - entry.updatedAt > REMOTE_STALE_MS) {
      if (entry?.updatedAt !== undefined && now - entry.updatedAt > 10 * REMOTE_STALE_MS) await $.store.delete(key).catch(() => undefined)
      continue
    }
    others.push({ session: key.slice(STORE_SESSION.length), label: entry.label ?? '?', tasks: entry.tasks ?? [] })
  }
  return others
}

/** Every bar to draw: this session's visible tasks, then other sessions'. */
async function shownTasks($: EngineInterface, now: number, limit: number): Promise<FilTask[]> {
  const mine = (await read($, tasks)).filter(t => isVisible(t, now))
  const others = (await read($, remote)).flatMap(r => r.tasks.map(t => ({ ...t, title: `⇄ ${r.label} · ${t.title}` })))
  return [...mine, ...others].slice(-Math.max(1, limit))
}

function drawBars($: EngineInterface, e: RenderInput, shown: readonly FilTask[], now: number, columns: number) {
  const { Box, Text } = $.ui.resolve(e)
  const width = Math.max(10, Math.min(30, columns - 40))

  return (
    <Box flexDirection="column">
      {shown.map(t => {
        const percent = estimate(t, now)
        const color = t.status === 'done' ? 'success' : t.status === 'aborted' ? 'warning' : 'claude'
        const elapsed = formatElapsed((t.endedAt ?? Math.max(now, t.startedAt)) - t.startedAt)
        const icon = t.status === 'done' ? '✔' : t.status === 'aborted' ? '■' : t.kind === 'agent' ? '◆' : '▶'
        return (
          <Box key={t.id} flexDirection="column">
            <Text color={color} weight="bold">
              {icon} {truncate(t.title, columns - 4)}
            </Text>
            <Text>
              <Text color={color}>{bar(percent, width)}</Text> {String(percent).padStart(3)}% · {elapsed}
              <Text dimColor> · {truncate(t.step, Math.max(10, columns - width - 20))}</Text>
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The previous session's timer stops before anything is awaited.
    ctx.stopTick?.()
    ctx.stopTick = undefined
    // A refused registration only drops /fil: the rest of the setup still runs.
    await $.command
      .register({
        name: 'fil',
        description: 'Active ou désactive les barres de progression (fil)',
        argumentHint: '[on|off|status|pane]',
      })
      .catch(() => undefined)
    // An unreadable store leaves the current state as is and still reaches next(e).
    const got = await $.store.get(STORE_ENABLED).then(value => ({ value }), () => undefined)
    ctx.isChoiceUnread = got === undefined
    if (typeof got?.value === 'boolean') {
      const stored = got.value
      await update($, enabled, () => stored)
    }
    // A new session starts its sharing over.
    ctx.ticks = 0
    ctx.hasPublished = false
    ctx.lastShared = 0
    // A pass hung in the previous session must not block this one's sharing.
    ctx.isSharing = false
    ctx.sessionKey = await $.session.id()
    ctx.label = e.cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'session'
    const timer = $.clock.every(1000, () => {
      void tick($).catch(() => undefined)
    })
    ctx.stopTick = () => timer.cancel()
    // Opened unasked, the pane seats only where the terminal is wide enough,
    // and never when the saved choice could not be read.
    if (!ctx.isChoiceUnread && (await read($, enabled))) void $.ui.open({ id: PANE, title: 'fil' }).catch(() => undefined)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // Sharing stops first: no tick may publish this session while its entry is deleted.
    const key = ctx.sessionKey
    const wasPublished = ctx.hasPublished
    ctx.stopTick?.()
    ctx.stopTick = undefined
    ctx.hasPublished = false
    ctx.sessionKey = ''
    // Best-effort cleanup: a stale entry expires on its own in other sessions.
    if (wasPublished && key !== '') await $.store.delete(STORE_SESSION + key).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'fil' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase().split(/\s+/)[0] ?? ''
    if (arg === 'status') {
      const list = await read($, tasks)
      const state = (await read($, enabled)) ? 'activé' : 'désactivé'
      const counts = Object.entries(seen).map(([k, v]) => `${k}=${v}`).join(' ')
      const unread = ctx.isChoiceUnread ? ' (choix enregistré illisible)' : ''
      return { text: `fil ${state}${unread} · ${list.length} tâche(s) · ${counts}` }
    }
    if (arg === 'pane') {
      const opened = await $.ui.open({ id: PANE, title: 'fil' })
      return { text: opened.isPlaced ? 'Panneau fil ouvert.' : 'Panneau fil demandé : il s’affichera quand le terminal sera assez large.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage : /fil [on|off|status|pane] (sans argument : bascule).' }
    }
    const current = await read($, enabled)
    const next = arg === 'on' ? true : arg === 'off' ? false : !current
    await update($, enabled, () => next)
    // A refused write keeps the choice for this session only.
    const isSaved = await $.store.set(STORE_ENABLED, next).then(() => true).catch(() => false)
    // Once written, the saved choice is known again.
    if (isSaved) ctx.isChoiceUnread = false
    if (!next) await update($, tasks, () => [])

    const text = next ? 'fil activé : barres de progression affichées.' : 'fil désactivé.'
    return { text: isSaved ? text : `${text} (choix non conservé pour les prochaines sessions)` }
  })

  on('agent.spawn', ($, e, next) => {
    pending.push({ prompt: e.prompt, description: e.description })
    if (pending.length > 20) pending.shift()

    return next(e)
  })

  // The main bar starts with the prompt; turn.start then names it by its turn.
  on('prompt.submit', async ($, e, next) => {
    seen.submit += 1
    if (e.command === undefined && e.isMeta !== true && (await read($, enabled))) {
      const now = await $.clock.now()
      await startMain($, `p:${now}`, e.text, now)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    seen.turnStart += 1
    if (await read($, enabled)) {
      const now = await $.clock.now()
      const agentId = e.agentId
      if (agentId === undefined) {
        await startMain($, e.turnId, e.text, now)
      } else {
        const index = pending.findIndex(p => p.prompt === e.text)
        const spawn = index >= 0 ? pending.splice(index, 1)[0] : undefined
        const title = spawn?.description ? truncate(spawn.description, 80) : titleOf(e.text)
        await update($, tasks, l => {
          const found = l.find(t => t.agentId === agentId)
          if (found) return l.map(t => (t === found ? { ...t, status: 'running' as const, endedAt: null } : t))
          return [...l, newTask({ id: agentId, kind: 'agent', agentId, title, startedAt: now })].slice(-20)
        })
      }
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    seen.tool += 1
    if (await read($, enabled)) {
      const tool = String(e.tool)
      const input = e as unknown as Record<string, unknown>
      const agentId = e.agentId
      const now = await $.clock.now()
      await update($, tasks, l => {
        let list = l
        let task = taskFor(list, agentId)
        if (task === undefined) {
          task =
            agentId === undefined
              ? newTask({ id: `t:${now}`, kind: 'turn', agentId: null, title: 'Tâche en cours', startedAt: now })
              : newTask({ id: agentId, kind: 'agent', agentId, title: 'Sous-agent', startedAt: now })
          list = [...list, task]
        }
        const target = task
        const stepped = applyPlan({ ...target, tools: target.tools + 1, step: stepOf(tool, input) }, tool, input)
        return list.map(t => (t === target ? stepped : t))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    seen.complete += 1
    if (!(await read($, enabled))) return result
    const now = await $.clock.now()
    const list = await read($, tasks)
    const task =
      e.agentId === undefined
        ? (list.find(t => t.id === e.turnId) ?? taskFor(list, undefined))
        : list.find(t => t.agentId === e.agentId)
    if (task === undefined) return result
    const status: FilStatus = e.isAborted || e.reason === 'aborted' ? 'aborted' : 'done'
    await update($, tasks, l =>
      l.map(t => (t.id === task.id ? { ...t, status, endedAt: now, step: status === 'done' ? 'Terminé' : 'Interrompu' } : t)),
    )
    await update($, clockNow, () => now)
    if (status === 'done' && now - task.startedAt >= LONG_MS) await chime($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    seen.render += 1
    if (e.props.hasSurvey || !(await read($, enabled))) return next(e)
    const now = (await read($, clockNow)) || (await $.clock.now())
    const shown = await shownTasks($, now, Math.min(MAX_BARS, Math.floor(e.props.maxRows / 2)))
    if (shown.length === 0) return next(e)

    // What the plugins beneath draw (jauge) stays, under the bars.
    const { Box } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {drawBars($, e, shown, now, e.props.bodyColumns)}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    seen.pane += 1
    const { Text } = $.ui.resolve(e)
    const now = (await read($, clockNow)) || (await $.clock.now())
    const shown = await shownTasks($, now, MAX_BARS * 2)
    if (shown.length === 0) return <Text dimColor>Aucune tâche en cours.</Text>

    return drawBars($, e, shown, now, e.props.bodyColumns)
  })
}
