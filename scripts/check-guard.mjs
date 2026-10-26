// Vérifie que les copies de guard.ts (garde-fous anti-injection) sont identiques.
// Un mod ne peut pas importer hors de son dossier : chaque mod garde sa copie.
// Usage, depuis la racine du dépôt : node scripts/check-guard.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const copies = ['cap', 'pen', 'relay'].map(mod => `plugins/${mod}/hooks/guard.ts`)
const [ref, ...rest] = copies.map(f => readFileSync(path.join(root, f), 'utf8'))
const differ = rest.flatMap((text, i) => (text === ref ? [] : [copies[i + 1]]))

if (differ.length > 0) {
  console.error(`guard.ts diffère de ${copies[0]} : ${differ.join(', ')}`)
  process.exit(1)
}
console.log(`guard.ts identique dans ${copies.length} mods`)
