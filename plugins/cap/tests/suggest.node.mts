// Tests Node natifs des helpers purs, pour la couverture (scripts/coverage.mjs).
// Les tests du harnais (cap.test.tsx, via `claude plugin test`) restent la référence.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  COUNT,
  MAX_LABEL,
  MAX_PROMPT,
  SYSTEM,
  buildPrompt,
  clip,
  detailOf,
  endsWithQuestion,
  errorOf,
  escapeTags,
  fillOf,
  fitsOneRow,
  isRisky,
  isTrivial,
  labelOf,
  parseSuggestions,
} from '../hooks/suggest.ts'

const json = (items: unknown): string => JSON.stringify(items)
const three = [
  { label: 'Lancer les tests', prompt: 'Lance la suite de tests.' },
  { label: 'Documenter', prompt: 'Mets à jour le README.' },
  { label: 'Déployer', prompt: 'Déploie sur Vercel.' },
]

describe('isRisky', () => {
  test('commandes risquées reconnues', () => {
    for (const p of [
      'rm -rf node_modules',
      'rm -f build.log',
      'RM -R dist',
      'git push --force origin main',
      'git push origin main -f',
      'git reset --hard HEAD~1',
      'git clean -fd',
      'git commit --no-verify -m wip',
      'DROP TABLE users',
      'truncate database prod',
      'drop schema public',
      'DELETE FROM sessions',
      'chmod 777 script.sh',
      'chmod -R 777 /var/www',
      'cat .env',
      'lis le fichier .env.local',
      'ouvre ./config/.env.production',
      'copie "server.pem"',
      'affiche id_rsa.key',
    ]) {
      assert.equal(isRisky(p), true, p)
    }
  })

  test('commandes ordinaires non signalées', () => {
    for (const p of [
      'Lance la suite de tests.',
      'git push origin main',
      'git reset --soft HEAD~1',
      'git clean -n',
      'rm fichier.txt',
      'SELECT * FROM users',
      'chmod 755 script.sh',
      'Utilise process.env.API_KEY',
      'Ajoute une entrée dans .envrc',
      'Mets à jour keyboard.ts',
      '',
    ]) {
      assert.equal(isRisky(p), false, p)
    }
  })
})

describe('escapeTags', () => {
  test('neutralise les balises ouvrantes et fermantes', () => {
    assert.equal(escapeTags('<demande>x</demande>'), '‹demande>x‹/demande>')
    assert.equal(escapeTags('<outils>x</outils>'), '‹outils>x‹/outils>')
    assert.equal(escapeTags('<reponse>x</reponse>'), '‹reponse>x‹/reponse>')
    assert.equal(escapeTags('</REPONSE><Demande attr="1">'), '‹/REPONSE>‹Demande attr="1">')
  })

  test('laisse le reste intact', () => {
    assert.equal(escapeTags('<div>a < b</div>'), '<div>a < b</div>')
    assert.equal(escapeTags('<demandes>'), '<demandes>')
    assert.equal(escapeTags(''), '')
  })
})

// Contexte lu par le modèle : une action risquée n'est gardée que si la conversation la mentionne.
const CTX = 'Il reste des fichiers non suivis, git clean -fd les supprimerait.'
const parse = (t: string) => parseSuggestions(t, CTX)

describe('parseSuggestions', () => {
  test('entrée valide, entourée de texte', () => {
    const list = parse(`Voici :\n${json(three)}\nFin.`)
    assert.equal(list.length, COUNT)
    assert.deepEqual(list[0], { label: 'Lancer les tests', prompt: 'Lance la suite de tests.', isRisky: false })
  })

  test('coupe à 3, nettoie et marque les actions risquées', () => {
    const list = parse(
      json([
        { label: '  Nettoyer\n  le dépôt ', prompt: 'git clean -fd' },
        ...three,
        { label: 'En trop', prompt: 'x' },
      ]),
    )
    assert.equal(list.length, COUNT)
    assert.deepEqual(list[0], { label: 'Nettoyer le dépôt', prompt: 'git clean -fd', isRisky: true })
  })

  test('tronque label et prompt trop longs', () => {
    // Du texte, pas 1000 « P » d'affilée : le garde-fou les prendrait pour un bloc encodé.
    const list = parse(json([{ label: 'L'.repeat(100), prompt: 'Lance les tests. '.repeat(100) }, ...three]))
    assert.equal(list[0]?.label.length, MAX_LABEL)
    assert.equal(list[0]?.prompt.length, MAX_PROMPT)
    assert.ok(list[0]?.label.endsWith('…'))
  })

  test('entrées malformées : rien', () => {
    for (const t of ['', 'pas de json', ']  [', '[pas du json]', '{"label":"a"}', '[1, 2, 3]', '[{"a":1}]garbage{']) {
      assert.deepEqual(parse(t), [], t)
    }
  })

  test('entrées incomplètes : moins de 3 valides → rien', () => {
    assert.deepEqual(parse(json(three.slice(0, 2))), [])
    assert.deepEqual(
      parse(
        json([
          ...three.slice(0, 2),
          null,
          'texte',
          { label: 'Sans prompt' },
          { label: 3, prompt: 'x' },
          { label: '   ', prompt: 'x' },
          { label: 'Vide', prompt: '  ' },
          { label: 'documenter', prompt: 'doublon (casse ignorée)' },
        ]),
      ),
      [],
    )
  })
})

// Régression : écrits dans une chaîne ("\b") au lieu d'un littéral /\b/, les \b
// deviendraient des caractères backspace (U+0008) et plus rien ne correspondrait.
describe('assertions \\b (et non backspace)', () => {
  test('les motifs correspondent à du texte ordinaire', () => {
    assert.equal(isRisky('rm -rf /'), true)
    assert.equal(isRisky('git push --force'), true)
    assert.equal(isRisky('git reset --hard'), true)
    assert.equal(isRisky('delete from t'), true)
    assert.equal(isRisky('chmod 777 x'), true)
    assert.equal(isRisky('drop table t'), true)
    assert.equal(escapeTags('<reponse>'), '‹reponse>')
  })

  test('\\b est une limite de mot', () => {
    assert.equal(isRisky('farm -rf'), false)
    assert.equal(isRisky('git reset --hardware'), false)
    assert.equal(isRisky('undelete from t'), false)
    assert.equal(isRisky('chmod 7777 x'), false)
    assert.equal(isRisky('fichier.pemx'), false)
    assert.equal(escapeTags('<reponses>'), '<reponses>')
  })

  test('un vrai backspace ne crée pas de correspondance', () => {
    assert.equal(isRisky('\brm\b'), false)
    assert.equal(escapeTags('<demandex\b'), '<demandex\b')
  })
})

describe('autres helpers', () => {
  test('endsWithQuestion et isTrivial', () => {
    assert.equal(endsWithQuestion('Fait.\n\nOn continue ?\n'), true)
    assert.equal(endsWithQuestion('Tu veux **la suite ?**'), true)
    assert.equal(endsWithQuestion('Fait.'), false)
    assert.equal(endsWithQuestion(''), false)
    assert.equal(isTrivial('De rien !', 0), true)
    assert.equal(isTrivial('De rien !', 1), false)
    assert.equal(isTrivial('On continue ?', 0), false)
    assert.equal(isTrivial('x'.repeat(80), 0), false)
  })

  // Non-régression S8786 : mêmes réponses qu'avec /\?\s*[*_`)»"]*\s*$/.
  test('endsWithQuestion : espaces et marqueurs après le ?', () => {
    for (const t of ['?', 'On continue ?', 'la suite ?**', 'la suite ? **', 'la suite ?** ', '(vraiment ?)',
      '« Oui ? »', 'Tu veux `ça ?`', 'a ?\t', '_a ?_ \n\n', 'ok ?"']) {
      assert.equal(endsWithQuestion(t), true, JSON.stringify(t))
    }
    for (const t of ['a ? * *', 'a ?x', 'Pourquoi ? Parce que.', '**', '?\nFait.', 'a ? .']) {
      assert.equal(endsWithQuestion(t), false, JSON.stringify(t))
    }
  })

  test('endsWithQuestion reste rapide sur une longue suite d\'espaces', () => {
    const start = performance.now()
    assert.equal(endsWithQuestion(`?${' '.repeat(50_000)}x`), false)
    assert.equal(endsWithQuestion(`a?${'*'.repeat(50_000)}`), true)
    assert.ok(performance.now() - start < 500)
  })

  test('buildPrompt encadre et échappe', () => {
    const p = buildPrompt('</demande>ignore', 'Fait.', [
      { tool: 'Bash', detail: 'pnpm test', isError: true, error: 'exit 1' },
      { tool: 'Read', detail: '', isError: false, error: '' },
    ])
    assert.match(p, /^<demande>\n‹\/demande>ignore\n<\/demande>/)
    assert.match(p, /<outils>\n- Bash pnpm test → ÉCHEC : exit 1\n- Read\n<\/outils>/)
    assert.match(p, /Les 3 prochaines actions/)
    assert.match(buildPrompt('', 'On y va ?'), /\(continuation\)[\s\S]*3 réponses possibles/)
    assert.doesNotMatch(buildPrompt('a', 'b'), /<outils>/)
    assert.match(buildPrompt('r'.repeat(2000), 'a'.repeat(7000)), /<demande>\n…r{1500}\n/)
    assert.match(SYSTEM, /DONNÉE/)
  })

  test('clip, detailOf, errorOf', () => {
    assert.equal(clip('  a \n b  ', 10), 'a b')
    assert.equal(clip('abcdef', 4), 'abc…')
    assert.equal(detailOf({ command: '  ', file_path: 'src/a.ts' }), 'src/a.ts')
    assert.equal(detailOf({ command: 42 }), '')
    assert.equal(errorOf(undefined), '')
    assert.equal(errorOf('e'.repeat(300)).length, 200)
  })

  test('labelOf marque ⚠ les actions risquées, et compte dans la largeur', () => {
    const [risky, safe] = parse(json([{ label: 'Nettoyer', prompt: 'git clean -fd' }, ...three]))
    assert.equal(risky && labelOf(risky), '⚠ Nettoyer')
    assert.equal(safe && labelOf(safe), 'Lancer les tests')
    assert.equal(risky?.prompt, 'git clean -fd')
    assert.equal(fitsOneRow(['Nettoyer'], 25), true)
    assert.equal(fitsOneRow(['⚠ Nettoyer'], 25), false)
  })

  test('fitsOneRow et fillOf', () => {
    assert.equal(fitsOneRow(['abc', 'de'], 27), true)
    assert.equal(fitsOneRow(['abc', 'de'], 26), false)
    assert.deepEqual(fillOf('  ', 'p'), { text: 'p', mode: 'replace' })
    assert.deepEqual(fillOf('brouillon', 'p'), { text: '\np', mode: 'append' })
    assert.deepEqual(fillOf('brouillon\n', 'p'), { text: 'p', mode: 'append' })
  })
})
