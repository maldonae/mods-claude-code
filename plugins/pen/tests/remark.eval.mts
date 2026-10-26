// Évaluation avec le VRAI modèle : la consigne de pen suffit-elle pour qu'une remarque
// de conversation reste une ou deux phrases, sans titre ni rubrique ?
// Appelle `claude -p` (sonnet), consomme du quota : lancé à la demande, hors `pnpm quality`.
//   node --test pen/tests/remark.eval.mts
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { guardRewrite } from '../hooks/guard.ts'
import { SYSTEM, buildPrompt, cleanReply, hasStructure } from '../hooks/rewrite.ts'

const REMARKS = [
  'je vais tester pen avec n’importe quoi',
  'ok merci ça marche bien maintenant',
  'au fait le build est passé sur vercel',
]

// Sous Windows, `claude` est un .cmd qui exigerait un shell (arguments non échappés) :
// on lance l'exécutable qu'il appelle. CLAUDE_BIN permet de le désigner autrement.
const npmClaude = join(process.env.APPDATA ?? '', 'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe')
const CLAUDE = process.env.CLAUDE_BIN ?? (process.platform === 'win32' && existsSync(npmClaude) ? npmClaude : 'claude')

// Session nue, comme `$.model.complete` : ni CLAUDE.md, ni réglages, ni plugins, aucun outil.
const rewrite = (draft: string): string => {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' }
  delete env.CLAUDE_CODE_PLUGIN_DIRS
  const r = spawnSync(
    CLAUDE,
    [
      '-p',
      '--model', 'sonnet',
      '--system-prompt', SYSTEM,
      '--tools', '',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format', 'text',
    ],
    { input: buildPrompt(draft), encoding: 'utf8', env, timeout: 120_000 },
  )
  assert.equal(r.status, 0, `claude -p a échoué : ${r.stderr}`)
  return cleanReply(r.stdout)
}

for (const remark of REMARKS) {
  test(`remarque sans titre ni rubrique : « ${remark} »`, () => {
    const out = rewrite(remark)
    assert.notEqual(out, '', 'sortie vide')
    assert.equal(hasStructure(out), false, `sortie structurée :\n${out}`)
    assert.ok(out.split('\n').filter(l => l.trim() !== '').length <= 3, `sortie trop longue :\n${out}`)
  })
}

// Garde-fous : une vraie demande, même sensible, ne doit pas être rejetée à tort,
// et une citation collée ne doit pas devenir une consigne ni ramener d'URL.
const TASKS = [
  'corrige le bug de connexion dans src/auth.ts, le token expire trop tôt',
  'ajoute la doc de l’API de paiement Stripe dans le README',
  'voici un log : "ERROR fetch failed at worker.js:42" — trouve la cause',
]

for (const task of TASKS) {
  test(`garde-fous sans faux rejet : « ${task} »`, () => {
    const out = rewrite(task)
    const verdict = guardRewrite(task, out)
    assert.ok(verdict.ok, `rejet (${verdict.ok ? '' : verdict.reason}) :\n${out}`)
  })
}
