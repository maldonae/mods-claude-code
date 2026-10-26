// Tests Node natifs des helpers purs, pour la couverture (scripts/coverage.mjs).
// Les tests du harnais (jauge.test.tsx, via `claude plugin test`) restent la référence.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bar, colorFor, formatRemaining, formatResetAt, formatTokens } from '../hooks/format.ts'

test('seuils de couleur', () => {
  assert.equal(colorFor(39), 'success')
  assert.equal(colorFor(40), 'warning')
  assert.equal(colorFor(60), 'warning')
  assert.equal(colorFor(61), 'error')
})

test('formats', () => {
  assert.equal(formatRemaining(133 * 60_000), '2h13')
  assert.equal(formatRemaining(45 * 60_000), '45 min')
  assert.equal(formatRemaining(-5), '0 min')
  assert.equal(formatTokens(850), '850')
  assert.equal(formatTokens(12_345), '12.3k')
  assert.equal(formatTokens(1_234_567), '1.2M')
  assert.equal(bar(50, 10), '█████░░░░░')
  assert.equal(bar(200, 3), '███')
})

test('heure du reset en heure locale', () => {
  // Lundi 19 octobre 2026, 18h25 (heure locale).
  const now = new Date(2026, 9, 19, 18, 25).getTime()
  assert.equal(formatResetAt(new Date(2026, 9, 19, 21, 51).getTime(), now), '21h51')
  assert.equal(formatResetAt(new Date(2026, 9, 20, 9, 5).getTime(), now), 'demain 09h05')
  assert.equal(formatResetAt(new Date(2026, 9, 26, 9, 0).getTime(), now), 'lun. 09h00')
})
