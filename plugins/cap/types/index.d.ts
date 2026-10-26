export type Suggestion = { label: string; prompt: string; isRisky: boolean }

export type Phase = 'idle' | 'thinking' | 'ready' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    cap: {
      isEnabled: boolean
      isHidden: boolean
      phase: Phase
      suggestions: Shaped<Suggestion[]>
    }
  }
}
