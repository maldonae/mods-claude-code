/** info : n'influe pas sur la couleur ; warn : orange ; block : rouge, bloque le commit. */
export type Level = 'info' | 'warn' | 'block'

export type CheckId = 'tests' | 'lint' | 'todo' | 'secrets' | 'files' | 'git'

export type Finding = { check: CheckId; level: Level; message: string }

/** staged : index git ; all : `git commit -a` ; worktree : tout ce qui diffère de HEAD. */
export type Scope = 'staged' | 'all' | 'worktree'

export type Report = {
  /** Pire niveau trouvé ; `ok` si aucun avertissement ni blocage. */
  level: 'ok' | 'warn' | 'block'
  scope: Scope
  trigger: 'commit' | 'command'
  at: number
  files: number
  findings: Finding[]
  /** Aucun fichier à examiner et ni test ni lint lancé : rien n'a été vérifié. */
  isEmpty?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'qa-guardian': {
      isEnabled: boolean
      isRunning: boolean
      isHidden: boolean
      report: Report | null
    }
  }
}
