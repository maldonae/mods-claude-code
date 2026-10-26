import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KnipStatus, Run, Step, TestState } from '../types'
import {
  DEFAULT_GOAL,
  RISK_COLOR,
  STATUS_LABEL,
  analysisPrompt,
  cleanupLabel,
  confirmReply,
  isConfirmedRemoval,
  isForbiddenFile,
  isGuarded,
  knipFixVerdict,
  knipStatusOf,
  needsConfirmation,
  parseCommand,
  parsePlan,
  parseStepReport,
  pausedReply,
  planReply,
  resolvePath,
  secretIn,
  shellVerdict,
  statusOf,
  stepPrompt,
  summaryReply,
  writeVerdict,
} from './plan'

const PANE = 'refactor'

// Changer le tag quand les champs de Run changent : une valeur d'une version antérieure est écartée.
const run = atom({ plugin: 'refactor', key: 'run' } as const, null as Run | null, { shape: 'run-2' })
const cwd = atom({ plugin: 'refactor', key: 'cwd' } as const, '')
const isBandHidden = atom({ plugin: 'refactor', key: 'isBandHidden' } as const, false)

const HELP = [
  '/refactor <fichier-ou-dossier> [objectif] [--plan-only] — analyse puis plan de refactorisation',
  '/refactor go — valide le plan, confirme un nettoyage Knip ou reprend après un échec',
  '/refactor passer — saute le nettoyage Knip en attente de confirmation',
  '/refactor stop — arrête le refactor en cours',
  '/refactor statut — où en est le refactor',
].join('\n')

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      description: 'Étapes classées par priorité, petites, isolées et vérifiables.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Ex. « Extraction de la validation JWT »' },
          kind: {
            type: 'string',
            enum: ['refactor', 'knip-export', 'knip-dependency', 'knip-file'],
            description: 'refactor par défaut ; nettoyages Knip dans l’ordre exports, dépendances, fichiers',
          },
          files: { type: 'array', items: { type: 'string' }, description: 'Fichiers concernés' },
          risk: { type: 'string', enum: ['faible', 'moyen', 'élevé'] },
          tests: { type: 'array', items: { type: 'string' }, description: 'Tests à lancer ou à créer après l’étape' },
          knip: { type: 'array', items: { type: 'string' }, description: 'Noms des résultats Knip traités (exports, paquets, fichiers)' },
        },
        required: ['title', 'files', 'risk', 'tests'],
      },
    },
    knip: {
      type: 'array',
      description: 'Résultats de `npx knip`, classés par risque.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['fichier', 'export', 'dépendance', 'manquante'] },
          name: { type: 'string' },
          file: { type: 'string' },
          risk: { type: 'string', enum: ['faible', 'moyen', 'élevé'] },
          reason: { type: 'string', description: 'Pourquoi ce risque (usage dynamique, entry point, framework, configuration, test…)' },
        },
        required: ['kind', 'name', 'risk'],
      },
    },
    issues: {
      type: 'array',
      description: 'Problèmes repérés à l’analyse.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'complexité, duplication, responsabilités, nommage, code mort, dépendance, testabilité, régression' },
          file: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    hasTests: { type: 'boolean', description: 'Des tests automatisés existent-ils pour la cible ?' },
    testCommand: { type: 'string', description: 'Commande qui lance les tests, ex. « pnpm test »' },
  },
  required: ['steps', 'hasTests'],
}

const STEP_SCHEMA = {
  type: 'object',
  properties: {
    step: { type: 'integer', description: 'Numéro de l’étape (1, 2, …)' },
    status: { type: 'string', enum: ['ok', 'échec', 'annulée'] },
    tests: { type: 'string', enum: ['OK', 'échec', 'non exécutés'] },
    note: { type: 'string', description: 'Ce qui a été fait, ou pourquoi l’étape a échoué' },
  },
  required: ['step', 'status', 'tests'],
}

// Un hook command.run ne peut pas soumettre de prompt (il attendrait le tour qu'il tient) : on soumet juste après.
function submitSoon($: EngineInterface, text: string): void {
  $.clock.after(0, () => void $.prompt.submit({ text }))
}

const deny = (why: string): { deny: string } => ({
  deny: `refactor : ${why}. Demande à l'utilisateur : il peut le faire lui-même ou terminer le refactor (/refactor stop).`,
})

// Refus d'une écriture : chemin interdit, phase, fichier hors étape, secret écrit ou déjà présent.
async function writeDenial($: EngineInterface, path: string, text: string): Promise<{ deny: string } | null> {
  const current = await read($, run)
  if (!isGuarded(current)) return null
  const base = await read($, cwd)
  const abs = resolvePath(base, path)
  const why = writeVerdict(current, abs, base)
  if (why) return deny(why)
  const written = secretIn(text)
  if (written) return deny(`le contenu à écrire contient un secret (${written})`)
  if (!isForbiddenFile(abs) && (await $.fs.exists(abs))) {
    const existing = secretIn(await $.fs.read(abs).catch(() => ''))
    if (existing) return deny(`${path} contient un secret (${existing}) : fichier jamais modifié par refactor`)
  }
  return null
}

// `knip --fix` est refusé à tout moment ; le reste ne l'est que pendant un refactor,
// sauf la suppression qu'un nettoyage Knip confirmé a nommée.
async function shellDenial($: EngineInterface, command: string): Promise<{ deny: string } | null> {
  const fix = knipFixVerdict(command)
  if (fix) return { deny: `refactor : ${fix}.` }
  const current = await read($, run)
  if (!isGuarded(current)) return null
  if (isConfirmedRemoval(command, current, await read($, cwd))) return null
  const why = shellVerdict(command, current.knipStatus)
  return why ? deny(why) : null
}

async function noteModified($: EngineInterface, path: string): Promise<void> {
  const abs = resolvePath(await read($, cwd), path)
  await update($, run, r =>
    r && r.phase === 'applying' && !r.modified.includes(abs) ? { ...r, modified: [...r.modified, abs] } : r,
  )
}

async function detectKnip($: EngineInterface, base: string): Promise<KnipStatus> {
  const pkg = `${base}/package.json`
  const json = (await $.fs.exists(pkg)) ? await $.fs.read(pkg).catch(() => '{}') : null
  const bin = `${base}/node_modules/.bin/knip`
  const hasBin = json !== null && ((await $.fs.exists(bin)) || (await $.fs.exists(`${bin}.cmd`)))
  return knipStatusOf(json, hasBin)
}

/** L'étape `index` devient l'étape en cours : appliquée, ou en attente de confirmation si c'est un nettoyage Knip. */
function enter(current: Run, steps: Step[], index: number): Run {
  if (index >= steps.length) return { ...current, steps, phase: 'done', current: steps.length - 1 }
  const step = steps[index]
  const phase = needsConfirmation(step) ? 'confirming' : 'applying'
  return {
    ...current,
    phase,
    current: index,
    steps: steps.map((s, i) => (i === index ? { ...s, status: phase === 'applying' ? 'running' : 'todo', testState: 'non exécutés' } : s)),
  }
}

/** Ce que Claude doit faire une fois dans `next` : l'étape, la confirmation à attendre, ou le résumé. */
function replyFor(next: Run): string {
  if (next.phase === 'done') return summaryReply(next)
  if (next.phase === 'confirming') return confirmReply(next, next.current)
  return stepPrompt(next, next.current)
}

async function approve($: EngineInterface): Promise<string> {
  const current = await read($, run)
  if (current === null) return 'Aucun refactor en cours. Lance /refactor <chemin>.'
  if (current.isPlanOnly) return `Mode plan seul : relance /refactor ${current.target} sans --plan-only pour appliquer.`
  if (current.phase !== 'awaiting' && current.phase !== 'paused' && current.phase !== 'confirming') {
    return `Rien à valider (phase : ${current.phase}).`
  }
  const index = current.phase === 'awaiting' ? 0 : Math.max(0, current.current)
  // Confirmer un nettoyage Knip : seule cette étape-là est confirmée.
  const steps = current.steps.map((s, i) => (i === index && current.phase === 'confirming' ? { ...s, isConfirmed: true } : s))
  const next = enter(current, steps, index)
  await update($, run, () => next)
  await update($, isBandHidden, () => false)
  const step = next.steps[index]
  if (next.phase === 'confirming' && step) {
    return `Plan validé. L'étape ${index + 1} est un nettoyage Knip (${cleanupLabel(step)}) : confirme-la avec /refactor go ou le bouton « Confirmer ».`
  }
  submitSoon($, stepPrompt(next, index))
  const what = current.phase === 'confirming' ? 'Nettoyage confirmé' : current.phase === 'paused' ? 'Reprise' : 'Plan validé'
  return `${what} : application de l'étape ${index + 1}/${next.steps.length}.`
}

async function skip($: EngineInterface): Promise<string> {
  const current = await read($, run)
  if (current === null || current.phase !== 'confirming') return 'Aucun nettoyage Knip en attente de confirmation.'
  const index = current.current
  const steps = current.steps.map((s, i): Step => (i === index ? { ...s, status: 'skipped' } : s))
  const next = enter(current, steps, index + 1)
  await update($, run, () => next)
  if (next.phase !== 'confirming') submitSoon($, `[refactor] Étape ${index + 1} passée par l’utilisateur (rien supprimé).\n\n${replyFor(next)}`)
  return `Étape ${index + 1} passée : rien n'a été supprimé.`
}

async function cancel($: EngineInterface): Promise<string> {
  const current = await read($, run)
  if (!isGuarded(current)) return 'Aucun refactor en cours.'
  await update($, run, (r): Run | null => (r ? { ...r, phase: 'cancelled' } : r))
  return 'Refactor arrêté. Les étapes déjà appliquées restent en place (non committées).'
}

function statusText(r: Run | null): string {
  if (r === null) return 'Aucun refactor dans cette session.'
  const done = r.steps.filter(s => s.status === 'done').length
  return `refactor ${r.target} — phase ${r.phase} — ${done}/${r.steps.length} étape(s) faites${r.isPlanOnly ? ' (plan seul)' : ''}`
}

const KNIP_LABEL: Record<KnipStatus, string> = {
  detected: 'installé',
  missing: 'non installé (npm install -D knip, puis npx knip init)',
  none: 'sans objet (pas de package.json)',
}

const TEST_COLOR: Record<TestState, 'success' | 'error' | undefined> = {
  OK: 'success',
  échec: 'error',
  'non exécutés': undefined,
}

export const register: Register = on => {
  // Tour du modèle lancé pendant un refactor : sa fin sans rapport arrête la phase en cours.
  let watchedTurn: string | null = null

  on('session.start', async ($, e, next) => {
    await update($, cwd, () => e.cwd)
    await $.command.register({
      name: 'refactor',
      description: 'Refactorisation guidée : plan validé avant toute modification, puis étape par étape avec tests',
      argumentHint: '<chemin> [objectif] [--plan-only] | go | stop | statut',
    })
    await $.tool.register({
      name: 'plan',
      description:
        'Enregistre le plan de refactorisation demandé par /refactor (étapes classées, fichiers, risque, tests). À appeler une fois l’analyse faite, avant toute modification.',
      inputSchema: PLAN_SCHEMA,
      isDeferred: false,
    })
    await $.tool.register({
      name: 'step',
      description: 'Rend compte d’une étape de refactor appliquée (statut et tests). Répond avec la suite à faire.',
      inputSchema: STEP_SCHEMA,
      isDeferred: false,
    })

    return next(e)
  })

  on('command.run', { command: 'refactor' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    if (cmd.kind === 'help') {
      return { text: `${HELP}\n\n${statusText(await read($, run))}` }
    }
    if (cmd.kind === 'status') return { text: statusText(await read($, run)) }
    if (cmd.kind === 'go') return { text: await approve($) }
    if (cmd.kind === 'skip') return { text: await skip($) }
    if (cmd.kind === 'stop') return { text: await cancel($) }

    const current = await read($, run)
    if (isGuarded(current) && current.phase !== 'planned') {
      return { text: `Un refactor est déjà en cours sur ${current.target} (phase ${current.phase}). /refactor stop d'abord.` }
    }
    const base = await read($, cwd)
    const targetAbs = resolvePath(base, cmd.target)
    if (!(await $.fs.exists(targetAbs))) return { text: `Introuvable : ${cmd.target}` }
    if (isForbiddenFile(targetAbs)) return { text: `${cmd.target} est un fichier sensible : refactor ne le touche pas.` }

    const fresh: Run = {
      target: cmd.target,
      targetAbs,
      goal: cmd.goal,
      isPlanOnly: cmd.isPlanOnly,
      phase: 'analysing',
      steps: [],
      current: -1,
      hasTests: null,
      testCommand: null,
      issues: [],
      knipStatus: await detectKnip($, base),
      knip: [],
      modified: [],
    }
    await update($, run, () => fresh)
    await update($, isBandHidden, () => false)
    void $.ui.open({ id: PANE, title: `Refactor — ${cmd.target}` })
    submitSoon($, analysisPrompt(fresh))

    return {
      text: `refactor : analyse de ${cmd.target} lancée${cmd.isPlanOnly ? ' (plan seul)' : ''}. Objectif : ${cmd.goal || DEFAULT_GOAL}. Aucun fichier ne sera modifié avant ta validation.`,
    }
  })

  on('tool.call', { tool: 'mcp__refactor__plan' }, async ($, e) => {
    const current = await read($, run)
    if (current === null || current.phase !== 'analysing') {
      return { result: 'Aucune analyse /refactor en attente de plan : rien enregistré.' }
    }
    const plan = parsePlan(e)
    if (typeof plan === 'string') return { result: `Plan refusé : ${plan}. Corrige et rappelle mcp__refactor__plan.` }
    const next: Run = { ...current, ...plan, phase: current.isPlanOnly ? 'planned' : 'awaiting' }
    await update($, run, () => next)

    return { result: planReply(next) }
  })

  on('tool.call', { tool: 'mcp__refactor__step' }, async ($, e) => {
    const current = await read($, run)
    if (current === null || current.phase !== 'applying') {
      return { result: 'Aucune étape de refactor en cours : arrête-toi et attends l’utilisateur.' }
    }
    const report = parseStepReport(e)
    if (typeof report === 'string') return { result: `Rapport refusé : ${report}.` }
    const index = report.step - 1
    if (index !== current.current) {
      return { result: `L’étape en cours est la ${current.current + 1}, pas la ${report.step}. Termine-la d’abord.` }
    }
    const status = statusOf(report)
    const steps = current.steps.map((s, i) => (i === index ? { ...s, status, testState: report.tests } : s))
    if (status !== 'done') {
      const paused: Run = { ...current, steps, phase: 'paused' }
      await update($, run, () => paused)
      return { result: pausedReply(paused, index) }
    }
    const advanced = enter(current, steps, index + 1)
    await update($, run, () => advanced)

    return { result: `Étape ${report.step} validée (tests : ${report.tests}).\n\n${replyFor(advanced)}` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const refused = await writeDenial($, e.file_path, e.new_string)
    if (refused) return refused
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await noteModified($, e.file_path)
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const refused = await writeDenial($, e.file_path, e.content)
    if (refused) return refused
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await noteModified($, e.file_path)
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const refused = await writeDenial($, e.notebook_path, e.new_source)
    if (refused) return refused
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await noteModified($, e.notebook_path)
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : deny('la vérification a échoué, écriture refusée')))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const refused = await shellDenial($, e.command)
    return refused ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : deny('la vérification a échoué, commande refusée')))

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const refused = await shellDenial($, e.command)
    return refused ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : deny('la vérification a échoué, commande refusée')))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && isGuarded(await read($, run))) watchedTurn = e.turnId
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.turnId === watchedTurn) {
      watchedTurn = null
      await update($, run, (r): Run | null => {
        if (r === null) return r
        if (r.phase === 'analysing') return { ...r, phase: 'failed' }
        if (r.phase === 'applying') return { ...r, phase: 'paused' }
        // Plan seul livré : la garde s'arrête avec le tour qui l'a présenté.
        if (r.phase === 'planned') return { ...r, phase: 'done' }
        return r
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const r = await read($, run)
    if (e.props.hasSurvey || r === null || r.phase === 'cancelled' || (await read($, isBandHidden))) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const n = r.steps.length
    const step = r.steps[r.current]
    const close = (
      <Button key="refactor-close" label="×" plain dimColor role="dismiss" onPress={() => update($, isBandHidden, () => true)} />
    )
    const pane = (
      <Button key="refactor-pane" label="Plan" plain dimColor onPress={() => $.ui.open({ id: PANE, title: `Refactor — ${r.target}` })} />
    )

    let mine
    if (r.phase === 'analysing') {
      mine = <Text key="refactor" dimColor>refactor › Analyse — {r.target}{r.isPlanOnly ? ' (plan seul)' : ''}…</Text>
    } else if (r.phase === 'awaiting') {
      mine = (
        <Box key="refactor" flexDirection="column">
          <Box flexDirection="row">
            <Text color="warning">refactor › Analyse — plan prêt : {n} étape(s), en attente de validation </Text>
            <Button key="refactor-go" label="Valider le plan" variant="primary" onPress={() => approve($)} />
            <Button key="refactor-stop" label="Annuler" onPress={() => cancel($)} />
            {pane}
          </Box>
          {r.hasTests === false && (
            <Text color="error">  ⚠ aucun test détecté : commence par des tests de caractérisation</Text>
          )}
        </Box>
      )
    } else if (r.phase === 'applying' && step) {
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text>refactor › Application — Refactor {r.current + 1}/{n} — {step.title} · </Text>
          <Text color={RISK_COLOR[step.risk]}>risque {step.risk}</Text>
          <Text> · tests : </Text>
          <Text color={TEST_COLOR[step.testState]} dimColor={step.testState === 'non exécutés'}>{step.testState}</Text>
          <Text> </Text>
          {pane}
        </Box>
      )
    } else if (r.phase === 'confirming' && step) {
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text color="warning">refactor › Confirmation requise — Refactor {r.current + 1}/{n} — supprimer {cleanupLabel(step)} · </Text>
          <Text color={RISK_COLOR[step.risk]}>risque {step.risk} </Text>
          <Button key="refactor-go" label="Confirmer" variant="primary" onPress={() => approve($)} />
          <Button key="refactor-skip" label="Passer" onPress={() => skip($)} />
          <Button key="refactor-stop" label="Arrêter" onPress={() => cancel($)} />
          {pane}
        </Box>
      )
    } else if (r.phase === 'paused') {
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text color="error">
            refactor › En pause — étape {r.current + 1}/{n} {step ? `« ${step.title} »` : ''} · tests : {step?.testState ?? '—'}{' '}
          </Text>
          <Button key="refactor-go" label="Reprendre" onPress={() => approve($)} />
          <Button key="refactor-stop" label="Arrêter" onPress={() => cancel($)} />
          {pane}
        </Box>
      )
    } else if (r.phase === 'planned' || (r.phase === 'done' && r.isPlanOnly)) {
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text color="success">refactor › Plan seul : {n} étape(s) générée(s), aucun fichier modifié </Text>
          {pane}
          {close}
        </Box>
      )
    } else if (r.phase === 'done') {
      const done = r.steps.filter(s => s.status === 'done').length
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text color="success">refactor › Terminé : {done}/{n} étape(s), {r.modified.length} fichier(s) modifié(s) — à relire avant commit </Text>
          {pane}
          {close}
        </Box>
      )
    } else {
      mine = (
        <Box key="refactor" flexDirection="row">
          <Text color="error">refactor › Aucun plan reçu pour {r.target} : relance /refactor </Text>
          {close}
        </Box>
      )
    }

    // Les bandes des autres mods restent dessinées dessous.
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, run)
    if (r === null) return <Text dimColor>Aucun refactor. Lance /refactor &lt;chemin&gt;.</Text>
    const unplaced = r.knip.filter(k => !r.steps.some(s => s.knip.includes(k.name)))

    return (
      <Box flexDirection="column">
        <Text bold>{r.target}</Text>
        <Text dimColor>
          {r.isPlanOnly ? 'Plan seul' : 'Plan + application'} · phase {r.phase} · tests{' '}
          {r.hasTests === null ? '?' : r.hasTests ? `détectés${r.testCommand ? ` (${r.testCommand})` : ''}` : 'absents'}
        </Text>
        <Text dimColor>Knip : {KNIP_LABEL[r.knipStatus]}{r.knip.length > 0 ? ` · ${r.knip.length} résultat(s)` : ''}</Text>
        {r.issues.length > 0 && <Text dimColor>{r.issues.length} problème(s) repéré(s)</Text>}
        {r.steps.length === 0 && <Text dimColor>Analyse en cours…</Text>}
        {r.steps.map((s, i) => (
          <Box key={`step-${i}`} flexDirection="column">
            <Box flexDirection="row">
              <Text bold={i === r.current}>
                {i + 1}. {s.title}{' '}
              </Text>
              <Text color={RISK_COLOR[s.risk]}>[{s.risk}] </Text>
              <Text dimColor={s.status === 'todo'} color={s.status === 'failed' ? 'error' : s.status === 'done' ? 'success' : undefined}>
                {STATUS_LABEL[s.status]}
                {s.kind !== 'refactor' && s.status === 'todo' && !s.isConfirmed ? ' (confirmation requise)' : ''}
              </Text>
              {s.status !== 'todo' && <Text dimColor> · tests : {s.testState}</Text>}
            </Box>
            {s.files.length > 0 && <Text dimColor>{'   '}{s.files.join(', ')}</Text>}
            {r.knip
              .filter(k => s.knip.includes(k.name))
              .map(k => (
                <Text key={`knip-${i}-${k.name}`} color={RISK_COLOR[k.risk]}>
                  {'   '}knip · {k.kind} {k.name}
                  {k.file && k.file !== k.name ? ` (${k.file})` : ''} — {k.risk}
                </Text>
              ))}
          </Box>
        ))}
        {unplaced.length > 0 && <Text bold>À analyser (Knip, non traités)</Text>}
        {unplaced.map(k => (
          <Text key={`knip-rest-${k.name}`} color={RISK_COLOR[k.risk]}>
            {'   '}{k.kind} {k.name} — {k.risk}{k.reason ? ` : ${k.reason}` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
