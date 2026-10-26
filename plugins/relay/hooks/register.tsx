import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, UiCopyArgs } from 'claude-code'

import type { Outcome, Phase } from '../types'
import {
  DEFAULT_THRESHOLD,
  RELAY_DIR,
  baseName,
  buildForkPrompt,
  finalize,
  freePath,
  isOverThreshold,
  parseCommand,
  parseThreshold,
} from './relay'

type Surface = UiCopyArgs['surface']

const isEnabled = atom({ plugin: 'relay', key: 'isEnabled' } as const, true)
const threshold = atom({ plugin: 'relay', key: 'threshold' } as const, DEFAULT_THRESHOLD)
const contextPercent = atom({ plugin: 'relay', key: 'contextPercent' } as const, null as number | null)
const phase = atom({ plugin: 'relay', key: 'phase' } as const, 'idle' as Phase)
const isSnoozed = atom({ plugin: 'relay', key: 'isSnoozed' } as const, false)
const outcome = atom({ plugin: 'relay', key: 'outcome' } as const, null as Outcome | null)
const error = atom({ plugin: 'relay', key: 'error' } as const, null as string | null)

const HELP = [
  '/relay — active ou désactive le mod',
  '/relay seuil 60 — seuil de contexte (10–95 %, défaut 50)',
  '/relay maintenant — passer le relais tout de suite (avec confirmation)',
  '/relay statut — état actuel',
].join('\n')

async function setPercent($: EngineInterface, percent: number | null): Promise<void> {
  if (percent === null) return
  const before = await read($, contextPercent)
  await update($, contextPercent, () => percent)
  const limit = await read($, threshold)
  const crossed = !isOverThreshold(before, limit) && isOverThreshold(percent, limit)
  if (crossed && (await read($, isEnabled)) && !(await read($, isSnoozed))) {
    $.ui.toast(`relay : contexte à ${percent} % (seuil ${limit} %) — pensez à passer le relais`)
  }
}

async function fail($: EngineInterface, message: string): Promise<void> {
  await update($, error, () => message)
  await update($, phase, () => 'failed')
}

// Claude rédige la fiche sur une copie de la conversation (sans outils) ; le mod l'écrit
// dans un fichier neuf, jamais par-dessus un fichier existant.
async function runRelay($: EngineInterface, surface: Surface): Promise<void> {
  await update($, phase, () => 'writing')
  await update($, error, () => null)
  try {
    const exists = (p: string): Promise<boolean> => $.fs.exists(p)
    const base = baseName(await $.clock.now())
    let path = await freePath(base, exists)
    const reply = await $.model.fork({ prompt: buildForkPrompt(path) })
    if (!reply.isAnswered) {
      const why =
        reply.reason === 'nothing-to-fork' ? 'aucun tour terminé à résumer' : `Claude n’a pas répondu (${reply.reason})`
      await fail($, why)
      return
    }
    // Un fichier a pu apparaître pendant la rédaction : on reprend un nom libre.
    if (await exists(path)) path = await freePath(base, exists)
    const sheet = finalize(reply.text, path)
    if (!sheet) {
      await fail($, 'fiche incomplète, sections manquantes')
      return
    }
    await $.fs.write(path, sheet.doc)
    // Une fiche suspecte est écrite pour être relue, mais son prompt n'est pas proposé à coller.
    const isCopyable = sheet.suspect === undefined
    await update($, outcome, () => ({ path, resume: isCopyable ? sheet.resume : '' }))
    await update($, phase, () => 'done')
    await update($, isSnoozed, () => true)
    const note = sheet.masked > 0 ? `\n${sheet.masked} secret(s) remplacé(s) par [masqué].` : ''
    if (!isCopyable) {
      $.ui.toast('relay : formulation suspecte dans la fiche, prompt non copié')
      $.ui.log(
        `relay › fiche écrite : ${path}${note}\n⚠ formulation suspecte (« ${sheet.suspect} ») : ` +
          'prompt de reprise non copié. Relis la fiche avant de la donner à une nouvelle session.',
      )
      return
    }
    const copied = await $.ui.copy({ text: sheet.resume, surface })
    $.ui.log(`relay › fiche écrite : ${path}${copied.isCopied ? ' (prompt copié)' : ''}${note}\n\n${sheet.resume}`)
  } catch (err) {
    await fail($, err instanceof Error ? err.message : String(err))
  }
}

async function statusText($: EngineInterface): Promise<string> {
  const on = await read($, isEnabled)
  const limit = await read($, threshold)
  const percent = await read($, contextPercent)
  const last = await read($, outcome)

  return [
    `relay ${on ? 'activé' : 'désactivé'} · seuil ${limit} % · contexte ${percent === null ? '—' : `${percent} %`}`,
    last ? `Dernière fiche : ${last.path}` : 'Aucune fiche dans cette session.',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'relay',
      description: 'Passer le relais : active/désactive, seuil N, maintenant, statut',
      argumentHint: '[seuil N | maintenant | statut]',
    })
    const stored = await $.store.get('threshold')
    const limit = typeof stored === 'number' ? parseThreshold(String(stored)) : undefined
    if (limit !== undefined) await update($, threshold, () => limit)
    try {
      await setPercent($, (await $.session.usage()).context.percent ?? null)
    } catch {
      // Chiffres indisponibles : la prochaine mesure les donnera.
    }

    return next(e)
  })

  on('command.run', { command: 'relay' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    switch (cmd.kind) {
      case 'toggle': {
        const now = await update($, isEnabled, v => !v)
        if (!now) await update($, phase, () => 'idle')
        return { text: now ? 'relay activé.' : 'relay désactivé.' }
      }
      case 'threshold': {
        if (cmd.value === undefined) return { text: 'Seuil illisible. Exemple : /relay seuil 60' }
        const value = cmd.value
        await update($, threshold, () => value)
        await update($, isSnoozed, () => false)
        await $.store.set('threshold', value)
        return { text: `Seuil de relais : ${value} % (enregistré).` }
      }
      case 'now': {
        await update($, isEnabled, () => true)
        await update($, phase, () => 'confirm')
        return { text: 'Confirmez au-dessus du prompt pour passer le relais.' }
      }
      case 'status':
        return { text: await statusText($) }
      case 'help':
        return { text: HELP }
    }
  })

  // Poussé par le moteur après chaque tour et quand le contexte bouge d'un point.
  on('session.measure', async ($, e, next) => {
    await setPercent($, e.context.percent ?? null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await read($, isEnabled))) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, phase)
    const limit = await read($, threshold)
    const percent = await read($, contextPercent)
    const surface = e.surface
    const toIdle = () => update($, phase, () => 'idle')
    const ask = () => update($, phase, () => 'confirm')
    const close = (
      <Button key="relay-close" label="×" plain dimColor role="dismiss" onPress={toIdle} />
    )

    let mine
    if (current === 'confirm') {
      mine = (
        <Box key="relay" flexDirection="row">
          <Text color="warning">relay › Écrire une fiche de relais dans {RELAY_DIR}/ ? </Text>
          <Button key="relay-yes" label="Confirmer" variant="primary" onPress={() => runRelay($, surface)} />
          <Button key="relay-no" label="Annuler" onPress={toIdle} />
        </Box>
      )
    } else if (current === 'writing') {
      mine = <Text key="relay" dimColor>relay › Claude rédige la fiche de relais…</Text>
    } else if (current === 'done') {
      const last = await read($, outcome)
      mine = (
        <Box key="relay" flexDirection="row">
          <Text color="success">relay › ✓ {last?.path ?? ''} </Text>
          {last && last.resume !== '' && (
            <Button
              key="relay-copy"
              label="Copier le prompt de reprise"
              onPress={async () => {
                const r = await $.ui.copy({ text: last.resume, surface })
                $.ui.toast(r.isCopied ? 'relay : prompt copié' : 'relay : copie impossible, voir le transcript')
              }}
            />
          )}
          {close}
        </Box>
      )
    } else if (current === 'failed') {
      const why = await read($, error)
      mine = (
        <Box key="relay" flexDirection="row">
          <Text color="error">relay › échec : {why ?? 'inconnu'} </Text>
          <Button key="relay-retry" label="Réessayer" onPress={ask} />
          {close}
        </Box>
      )
    } else if (isOverThreshold(percent, limit) && !(await read($, isSnoozed))) {
      mine = (
        <Box key="relay" flexDirection="row">
          <Text color="warning">
            relay › contexte {percent} % ≥ {limit} %{' '}
          </Text>
          <Button key="relay-go" label="Passer le relais" variant="primary" onPress={ask} />
          <Button key="relay-later" label="Plus tard" plain dimColor onPress={() => update($, isSnoozed, () => true)} />
        </Box>
      )
    } else {
      mine = (
        <Box key="relay" flexDirection="row">
          <Text dimColor>relay › </Text>
          <Button key="relay-go" label="Passer le relais" onPress={ask} />
        </Box>
      )
    }

    // Les bandes des autres mods (jauge, fil, cap) restent dessinées sous relay.
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
