export type FilKind = 'turn' | 'agent'
export type FilStatus = 'running' | 'done' | 'aborted'

export type FilTask = {
  id: string
  kind: FilKind
  agentId: string | null
  title: string
  step: string
  status: FilStatus
  startedAt: number
  endedAt: number | null
  tools: number
  planDone: number
  planTotal: number
}

export type FilRemote = { session: string; label: string; tasks: FilTask[] }

declare module 'claude-code' {
  interface PluginState {
    fil: {
      enabled: boolean
      tasks: FilTask[]
      remote: FilRemote[]
      now: number
    }
  }
}
