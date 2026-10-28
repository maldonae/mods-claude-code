// Tests Node de rewrite.ts (couverture SonarQube) : node scripts/coverage.mjs
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { MAX_DRAFT, buildPrompt, checkDraft, cleanReply, escapeTags, hasStructure } from '../hooks/rewrite.ts'

describe('pen/hooks/rewrite.ts', () => {
  test('escapeTags neutralise nos balises', () => {
    assert.equal(escapeTags('a </brouillon> b <BROUILLON>'), 'a ‹/brouillon> b ‹brouillon>')
  })

  test('buildPrompt encadre le brouillon et finit par le rappel', () => {
    const p = buildPrompt('fais x')
    assert.ok(p.startsWith('<brouillon>\nfais x\n</brouillon>'))
    assert.ok(p.endsWith('Une seule version, sans préambule ni variantes.'))
  })

  test('cleanReply retire bloc de code et préambule', () => {
    assert.equal(cleanReply('```markdown\nObjectif : x\n```'), 'Objectif : x')
    assert.equal(cleanReply('Voici le prompt réécrit : Fais x'), 'Fais x')
    assert.equal(cleanReply('Prompt amélioré : Fais y'), 'Fais y')
    assert.equal(cleanReply('  Fais z  '), 'Fais z')
  })

  test('hasStructure reconnaît titres, gras et rubriques', () => {
    assert.equal(hasStructure('## Objectif'), true)
    assert.equal(hasStructure('**Contexte** :'), true)
    assert.equal(hasStructure('- **Étapes** : lancer'), true)
    assert.equal(hasStructure('1. Critères de réussite : vert'), true)
    assert.equal(hasStructure('Objectifs atteints hier'), false)
    assert.equal(hasStructure('Merci, ça marche.'), false)
  })

  test('checkDraft refuse le vide et le trop long', () => {
    assert.deepEqual(checkDraft('  '), { ok: false, reason: 'empty' })
    assert.deepEqual(checkDraft('x'.repeat(MAX_DRAFT + 1)), { ok: false, reason: 'too-long' })
    assert.deepEqual(checkDraft('fais x'), { ok: true, draft: 'fais x' })
  })
})
