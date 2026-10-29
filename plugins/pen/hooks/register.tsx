import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase } from '../types'
import { findInjection, guardRewrite, stripInvisible } from './guard'
import { MAX_DRAFT, SYSTEM, buildPrompt, checkDraft, cleanReply } from './rewrite'

const isEnabled = atom({ plugin: 'pen', key: 'isEnabled' } as const, true)
const phase = atom({ plugin: 'pen', key: 'phase' } as const, 'idle' as Phase)

// Le choix de /pen survit aux sessions, comme celui de /fil.
const STORE_ENABLED = 'enabled'

async function improve($: EngineInterface): Promise<void> {
  if ((await read($, phase)) === 'busy') return
  const box = await $.prompt.read()
  const check = checkDraft(box.text)
  if (!check.ok) {
    $.ui.toast(
      check.reason === 'empty'
        ? 'pen : écris d’abord une demande dans le champ.'
        : `pen : brouillon trop long (plus de ${MAX_DRAFT} caractères).`,
    )
    return
  }

  // Le modèle ne voit jamais ce que l'utilisateur ne voit pas.
  const visible = stripInvisible(check.draft)
  const injected = findInjection(visible.text)
  if (injected !== undefined) {
    $.ui.toast(`pen : le brouillon contient une consigne suspecte (« ${injected} »), réécriture refusée.`)
    return
  }

  await update($, phase, () => 'busy')
  try {
    const r = await $.model.complete({
      model: 'sonnet',
      system: SYSTEM,
      prompt: buildPrompt(visible.text),
      maxTokens: 2000,
      effort: 'low',
      timeoutMs: 45_000,
    })
    const reply = r.isAnswered ? cleanReply(r.text) : ''
    if (reply === '') {
      $.ui.toast('pen : réécriture impossible, brouillon inchangé.')
      return
    }
    const verdict = guardRewrite(visible.text, reply)
    if (!verdict.ok) {
      $.ui.toast(`pen : réécriture rejetée (${verdict.reason}), brouillon inchangé.`)
      return
    }
    const { text } = verdict
    // Pendant l'appel, l'utilisateur a pu continuer à taper : on n'écrase pas son texte.
    if ((await $.prompt.read()).text !== check.draft) {
      $.ui.toast('pen : le champ a changé pendant la réécriture, brouillon gardé.')
      return
    }
    const filled = await $.prompt.fill({ text, mode: 'replace' })
    if (!filled.isFilled) $.ui.toast('pen : champ de saisie indisponible')
    else if (visible.removed > 0) $.ui.toast(`pen : ${visible.removed} caractère(s) invisible(s) retiré(s) du brouillon.`)
  } catch {
    $.ui.toast('pen : réécriture impossible, brouillon inchangé.')
  } finally {
    await update($, phase, () => 'idle')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pen',
      description: 'Active ou désactive le bouton « Améliorer le prompt »',
    })
    const stored = await $.store.get(STORE_ENABLED).catch(() => undefined)
    if (typeof stored === 'boolean') await update($, isEnabled, () => stored)

    return next(e)
  })

  on('command.run', { command: 'pen' }, async $ => {
    const now = await update($, isEnabled, v => !v)
    const isSaved = await $.store.set(STORE_ENABLED, now).then(() => true).catch(() => false)

    const text = now ? 'pen activé : bouton « Améliorer le prompt » affiché.' : 'pen désactivé.'
    return { text: isSaved ? text : `${text} (choix non conservé pour les prochaines sessions)` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey || !(await read($, isEnabled))) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const mine =
      (await read($, phase)) === 'busy' ? (
        <Text key="pen" dimColor>pen › réécriture du prompt…</Text>
      ) : (
        <Box key="pen" flexDirection="row">
          <Text dimColor>pen › </Text>
          <Button key="pen-go" label="Améliorer le prompt" onPress={() => improve($)} />
        </Box>
      )

    // Les bandes des autres mods (cap, jauge, fil) restent dessinées sous pen.
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
