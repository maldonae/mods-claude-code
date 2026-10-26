/** idle : rien à faire ; confirm : demande de confirmation ; writing : fiche en cours ; done / failed : résultat. */
export type Phase = 'idle' | 'confirm' | 'writing' | 'done' | 'failed'

export type Outcome = {
  /** Chemin relatif au dossier courant, ex. `.claude/relay/relay-2026-10-26-1432.md`. */
  path: string
  /** Prompt de reprise, prêt à coller. */
  resume: string
}

declare module 'claude-code' {
  interface PluginState {
    relay: {
      isEnabled: boolean
      threshold: number
      contextPercent: number | null
      phase: Phase
      /** Proposition au seuil masquée par « Plus tard » (jusqu'au prochain relais ou changement de seuil). */
      isSnoozed: boolean
      outcome: Outcome | null
      error: string | null
    }
  }
}
