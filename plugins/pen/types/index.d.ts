export type Phase = 'idle' | 'busy'

declare module 'claude-code' {
  interface PluginState {
    pen: {
      isEnabled: boolean
      phase: Phase
    }
  }
}
