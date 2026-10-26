import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Snapshot, Window } from '../types'
import { bar, colorFor, formatResetAt, formatTokens } from './format'

const EMPTY: Snapshot = {
  contextPercent: null,
  rateLimits: [],
  costUsd: null,
  lastTurnTokens: null,
}

const isEnabled = atom({ plugin: 'jauge', key: 'isEnabled' } as const, true)
const snapshot = atom({ plugin: 'jauge', key: 'snapshot' } as const, EMPTY)

type Figures = Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>

const store = ($: EngineInterface, u: Figures) =>
  update($, snapshot, prev => ({
    ...prev,
    contextPercent: u.context.percent ?? prev.contextPercent,
    // Liste vide = hors abonnement ou pas encore de lecture : on garde la dernière connue.
    rateLimits:
      u.rateLimits.length > 0
        ? u.rateLimits.map(w => ({
            kind: w.kind,
            percentUsed: w.percentUsed,
            resetsAt: w.resetsAt ?? null,
          }))
        : prev.rateLimits,
    costUsd: u.cost?.usd ?? prev.costUsd,
  }))

// Une jauge ne doit jamais faire échouer un tour ni un appel d'outil.
const refresh = async ($: EngineInterface): Promise<void> => {
  try {
    await store($, await $.session.usage())
  } catch {
    // Chiffres indisponibles : on garde le dernier relevé.
  }
}

const windowOf = (s: Snapshot, kind: string): Window | undefined =>
  s.rateLimits.find(w => w.kind === kind)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jauge',
      description: 'Active ou désactive la jauge d’usage au-dessus du prompt',
    })

    return next(e)
  })

  on('command.run', { command: 'jauge' }, async $ => {
    const now = await update($, isEnabled, v => !v)

    return { text: now ? 'Jauge activée.' : 'Jauge désactivée.' }
  })

  // Poussé par le moteur après chaque tour, et quand une fenêtre bouge d'un point.
  on('session.measure', async ($, e, next) => {
    await store($, e)

    return next(e)
  })

  // Après chaque appel d'outil : relecture des chiffres.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  // Consommation récente : tokens du dernier tour.
  // TODO(api mods 2.1.301) : aucune conso « glissante » (ex. 15 dernières min) ni
  // tokens consommés sur la fenêtre 5h ne sont exposés ; seuls le dernier tour
  // (turn.complete `usage`) et le coût cumulé de la session (`cost.usd`) le sont.
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      const total =
        u.input_tokens +
        u.output_tokens +
        u.cache_read_input_tokens +
        u.cache_creation_input_tokens
      await update($, snapshot, prev => ({ ...prev, lastTurnTokens: total }))
    }
    await refresh($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isEnabled))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const now = await $.clock.now()
    const fiveHour = windowOf(s, 'five_hour')
    const sevenDay = windowOf(s, 'seven_day')
    const width = Math.max(10, Math.min(30, e.props.bodyColumns - 45))
    const resetOf = (w: Window): string =>
      w.resetsAt ? ` · reset ${formatResetAt(Date.parse(w.resetsAt), now)}` : ''

    // Une ligne par mesure : libellé, barre colorée, pourcentage, heure du reset.
    const row = (key: string, label: string, percent: number | null, suffix: string) => (
      <Box key={key} flexDirection="row">
        <Text dimColor>{label.padEnd(9)}</Text>
        {percent === null ? (
          <Text key={`${key}-bar`} dimColor>
            {`${'░'.repeat(width)}    —`}
          </Text>
        ) : (
          <Text key={`${key}-bar`} color={colorFor(percent)}>
            {`${bar(percent, width)} ${String(percent).padStart(3)}%`}
          </Text>
        )}
        {suffix !== '' && (
          <Text key={`${key}-reset`} dimColor>
            {suffix}
          </Text>
        )}
      </Box>
    )

    // Ce que les mods en dessous dessinent (les barres de fil) reste affiché sous la jauge.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {row('ctx', 'Contexte', s.contextPercent, '')}
        {/* five_hour / seven_day : absents hors abonnement Claude (clé API) → masqués. */}
        {fiveHour && row('5h', '5h', fiveHour.percentUsed, resetOf(fiveHour))}
        {sevenDay && row('7d', '7j', sevenDay.percentUsed, resetOf(sevenDay))}
        {(s.lastTurnTokens !== null || s.costUsd !== null) && (
          <Text key="recent" dimColor>
            Récent{' '}
            {s.lastTurnTokens !== null ? `${formatTokens(s.lastTurnTokens)} tok/tour` : ''}
            {s.lastTurnTokens !== null && s.costUsd !== null ? ', ' : ''}
            {s.costUsd !== null ? `session $${s.costUsd.toFixed(2)}` : ''}
          </Text>
        )}
        {below}
      </Box>
    )
  })
}
