export type Risk = 'faible' | 'moyen' | 'élevé'

export type TestState = 'OK' | 'échec' | 'non exécutés'

/** todo : en attente ; running : en cours ; done : terminée ; failed : échec ; reverted : annulée ; skipped : passée par l'utilisateur. */
export type StepStatus = 'todo' | 'running' | 'done' | 'failed' | 'reverted' | 'skipped'

/**
 * refactor : changement de code ; les trois autres sont les nettoyages Knip, dans cet ordre,
 * chacun confirmé par l'utilisateur avant d'être appliqué.
 */
export type StepKind = 'refactor' | 'knip-export' | 'knip-dependency' | 'knip-file'

/** Un résultat de `npx knip`, classé par risque. */
export type KnipItem = {
  kind: 'fichier' | 'export' | 'dépendance' | 'manquante'
  /** Nom de l'export ou du paquet ; chemin pour un fichier. */
  name: string
  file: string
  risk: Risk
  /** Pourquoi ce risque (usage dynamique, entry point, framework, configuration…). */
  reason: string
}

/** detected : Knip installé ; missing : package.json sans Knip ; none : pas de package.json. */
export type KnipStatus = 'detected' | 'missing' | 'none'

export type Step = {
  title: string
  kind: StepKind
  /** Chemins tels que Claude les a donnés (relatifs au dossier de la session ou absolus). */
  files: string[]
  risk: Risk
  /** Tests à lancer (ou à créer) après l'étape. */
  tests: string[]
  /** Noms des résultats Knip que l'étape traite. */
  knip: string[]
  status: StepStatus
  testState: TestState
  /** Nettoyage Knip confirmé par l'utilisateur (toujours vrai pour une étape `refactor`). */
  isConfirmed: boolean
}

export type Issue = { kind: string; file: string; detail: string }

/**
 * analysing : Claude lit la cible ; awaiting : plan prêt, attente de validation ;
 * applying : étapes en cours ; confirming : nettoyage Knip en attente de confirmation ;
 * paused : arrêt après un échec ; planned : plan seul livré ;
 * done : terminé ; cancelled : arrêté par l'utilisateur ; failed : aucun plan reçu.
 */
export type Phase =
  | 'analysing'
  | 'awaiting'
  | 'applying'
  | 'confirming'
  | 'paused'
  | 'planned'
  | 'done'
  | 'cancelled'
  | 'failed'

export type Run = {
  target: string
  /** Cible résolue en chemin absolu, avec des `/`. */
  targetAbs: string
  goal: string
  isPlanOnly: boolean
  phase: Phase
  steps: Step[]
  /** Index de l'étape en cours ou à reprendre ; -1 avant la validation. */
  current: number
  hasTests: boolean | null
  testCommand: string | null
  issues: Issue[]
  knipStatus: KnipStatus
  knip: KnipItem[]
  /** Fichiers réellement modifiés (Edit/Write réussis) pendant l'application. */
  modified: string[]
}

declare module 'claude-code' {
  interface PluginState {
    refactor: {
      run: Shaped<Run | null>
      cwd: string
      isBandHidden: boolean
    }
  }
}
