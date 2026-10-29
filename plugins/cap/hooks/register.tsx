import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, Suggestion } from '../types'
import { SYSTEM, buildPrompt, fillOf, fitsOneRow, labelOf, parseSuggestions } from './suggest'

const isEnabled = atom({ plugin: 'cap', key: 'isEnabled' } as const, false)
const isHidden = atom({ plugin: 'cap', key: 'isHidden' } as const, false)
const phase = atom({ plugin: 'cap', key: 'phase' } as const, 'idle' as Phase)
const suggestions = atom({ plugin: 'cap', key: 'suggestions' } as const, [] as Suggestion[], {
  shape: 'suggestions-2',
})

// Le choix de /cap survit aux sessions ; sans choix enregistré, cap reste éteint.
const STORE_ENABLED = 'enabled'

// Demande du dernier tour principal, et tour dont on attend les suggestions :
// une réponse arrivée après un nouveau tour est jetée.
let request = ''
let latestTurn = ''

async function clearAll($: EngineInterface, next: Phase): Promise<void> {
  await update($, suggestions, () => [])
  await update($, phase, () => next)
}

async function suggest($: EngineInterface, turnId: string, answer: string): Promise<void> {
  await update($, phase, () => 'thinking')
  await update($, isHidden, () => false)
  try {
    const prompt = buildPrompt(request, answer)
    const r = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt,
      maxTokens: 400,
      effort: 'low',
      timeoutMs: 20_000,
    })
    if (turnId !== latestTurn || !(await read($, isEnabled))) return
    const list = r.isAnswered ? parseSuggestions(r.text, prompt) : []
    await update($, suggestions, () => list)
    await update($, phase, () => (list.length > 0 ? 'ready' : 'failed'))
  } catch {
    // Modèle bloqué ou requête refusée : pas de suggestions, le tour n'est pas touché.
    if (turnId === latestTurn) await clearAll($, 'failed')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Un enregistrement refusé ne retire que /cap : le choix enregistré est quand même relu.
    await $.command
      .register({
        name: 'cap',
        description: 'Active ou désactive les 3 suggestions d’actions au-dessus du prompt',
      })
      .catch(() => undefined)
    // Stockage illisible : cap reste éteint et la session continue jusqu'à next(e).
    const stored = await $.store.get(STORE_ENABLED).catch(() => undefined)
    if (typeof stored === 'boolean') await update($, isEnabled, () => stored)

    return next(e)
  })

  on('command.run', { command: 'cap' }, async $ => {
    const now = await update($, isEnabled, v => !v)
    // Écriture refusée : le choix vaut pour cette session seulement.
    const isSaved = await $.store.set(STORE_ENABLED, now).then(() => true).catch(() => false)
    if (!now) await clearAll($, 'idle')

    const text = now ? 'cap activé : 3 suggestions après chaque tour.' : 'cap désactivé.'
    return { text: isSaved ? text : `${text} (choix non conservé pour les prochaines sessions)` }
  })

  // Lecture seule : le texte de l'utilisateur passe tel quel.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      request = e.text
      latestTurn = e.turnId
      await clearAll($, 'idle')
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const isMain = e.agentId === undefined
    if (!isMain || e.reason !== 'answer' || e.answer.trim() === '' || !(await read($, isEnabled))) {
      return result
    }

    latestTurn = e.turnId
    const { turnId, answer } = e
    // Hors du tour : l'appel au modèle ne retarde pas la fin du tour.
    $.clock.after(0, () => void suggest($, turnId, answer))

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const current = await read($, phase)
    if (
      e.props.hasSurvey ||
      current === 'idle' ||
      current === 'failed' ||
      !(await read($, isEnabled)) ||
      (await read($, isHidden))
    ) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, suggestions)

    const take = async (s: Suggestion): Promise<void> => {
      const { text } = await $.prompt.read()
      const filled = await $.prompt.fill(fillOf(text, s.prompt))
      if (!filled.isFilled) $.ui.toast('cap : champ de saisie indisponible')
    }

    const hide = (
      <Button key="cap-hide" label="×" plain dimColor role="dismiss" onPress={() => update($, isHidden, () => true)} />
    )

    const mine =
      current === 'thinking' ? (
        <Box key="cap" flexDirection="row">
          <Text dimColor>cap › suggestions… </Text>
          {hide}
        </Box>
      ) : (
        <Box
          key="cap"
          flexDirection={fitsOneRow(list.map(labelOf), e.props.bodyColumns) ? 'row' : 'column'}
        >
          <Text dimColor>cap › </Text>
          {list.map((s, i) => (
            <Button key={`cap-${i}`} label={labelOf(s)} onPress={() => take(s)} />
          ))}
          {hide}
        </Box>
      )

    // Les bandes des mods en dessous (jauge, fil) restent dessinées sous cap.
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
