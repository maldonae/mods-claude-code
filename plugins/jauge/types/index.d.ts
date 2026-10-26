export type Window = { kind: string; percentUsed: number; resetsAt: string | null }

export type Snapshot = {
  contextPercent: number | null
  rateLimits: Window[]
  costUsd: number | null
  lastTurnTokens: number | null
}

declare module 'claude-code' {
  interface PluginState {
    jauge: { isEnabled: boolean; snapshot: Snapshot }
  }
}
