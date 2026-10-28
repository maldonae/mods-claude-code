// Garde-fous déterministes contre l'injection de prompt : un mod ne doit jamais fabriquer
// ni relayer une consigne cachée ou ajoutée. La consigne du modèle ne suffit pas, le code vérifie.
// Copie IDENTIQUE dans cap, pen et relay (un mod ne peut pas importer hors de son dossier) :
// modifier les trois, `node scripts/check-guard.mjs` vérifie qu'elles sont égales.

// Zéro-largeur, contrôles bidi, tags Unicode (« ASCII smuggling »), BOM, trait d'union
// conditionnel, contrôles C0/C1 sauf saut de ligne et tabulation : invisibles à l'écran.
const INVISIBLE =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g

export const stripInvisible = (text: string): { text: string; removed: number } => {
  let removed = 0
  const clean = text.replace(INVISIBLE, () => {
    removed += 1
    return ''
  })
  return { text: clean, removed }
}

// Formulations typiques d'une injection.
const INJECTION = [
  /\b(ignore|oublie|disregard|forget)\b[^\n]{0,40}\b(instructions?|consignes?|règles|rules|prompts?)\b/i,
  /\b(system prompt|prompt système|invite système)\b/i,
  /\b(tu es|you are) (maintenant|désormais|now)\b/i,
  /\b(désactive|contourne|bypass|disable)\b[^\n]{0,30}\b(sécurité|garde-fous?|safety|guardrails?|confirmations?|permissions?)\b/i,
  /--dangerously-skip-permissions\b/i,
  /<\/?(system|assistant|instructions?)>/i,
]

export const findInjection = (text: string): string | undefined => {
  for (const r of INJECTION) {
    const m = r.exec(text)
    if (m) return m[0]
  }
  return undefined
}

// Actions sensibles : tolérées si elles figurent déjà dans le texte de référence.
const RISKY = [
  /\brm\s+-[a-z]*[rf]/i,
  /\bpush\b[^\n]*(--force|\s-f\b)/i,
  /\breset\s+--hard\b/i,
  /\bclean\s+-[a-z]*f/i,
  /--no-verify\b/i,
  /\b(drop|truncate)\s+(table|database|schema)\b/i,
  /\bdelete\s+from\b/i,
  /\bchmod\s+(-R\s+)?777\b/i,
  /(^|[\s/'"`])\.env(\.[\w-]+)?\b/i,
  /\.(pem|key)\b/i,
  /\b(id_rsa|id_ed25519|\.ssh|\.aws|credentials|passwd|shadow)\b/i,
  /\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b/i,
  /\|\s*(sh|bash|zsh|pwsh|powershell|iex)\b/i,
  /\b(powershell|pwsh)\b[^\n]*\s-(e|enc|encodedcommand)\b/i,
  /\b(eval|exec)\s*\(/i,
]

export const isRisky = (text: string): boolean => RISKY.some(r => r.test(text))

// Éléments qui font sortir des données ou pointent ailleurs : comparés un à un à la référence.
const URL = /\b(?:https?|ftp|file):\/\/[^\s<>"'`)\]]+|\bwww\.[^\s<>"'`)\]]+/gi
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
// Long bloc base64 ou hexadécimal : charge encodée illisible pour l'utilisateur.
const BLOB = /[A-Za-z0-9+/=]{60,}|\b[0-9a-f]{40,}\b/gi

// Ponctuation finale retirée par une boucle (pas de regex ancrée en fin : backtracking).
const TRAILING = new Set('.,;:!?»')
const trimEnd = (s: string): string => {
  let end = s.length
  while (end > 0 && TRAILING.has(s.charAt(end - 1))) end -= 1
  return s.slice(0, end).toLowerCase()
}
const itemsOf = (text: string, r: RegExp): Set<string> =>
  new Set([...text.matchAll(r)].map(m => trimEnd(m[0])))

// Ce que `text` apporte que `reference` n'avait pas : URL, e-mail, IP, bloc encodé, action sensible.
export const findUnseen = (reference: string, text: string): string | undefined => {
  for (const [label, r] of [['URL', URL], ['adresse e-mail', EMAIL], ['adresse IP', IP], ['bloc encodé', BLOB]] as const) {
    const before = itemsOf(reference, r)
    for (const item of itemsOf(text, r)) {
      if (!before.has(item)) return `${label} absente du contexte`
    }
  }
  for (const r of RISKY) {
    if (r.test(text) && !r.test(reference)) return 'action sensible absente du contexte'
  }
  return undefined
}

// Secrets reconnaissables à leur forme : jamais écrits sur disque ni copiés.
const SECRETS = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export const maskSecrets = (text: string): { text: string; masked: number } => {
  let masked = 0
  const clean = SECRETS.reduce(
    (t, r) =>
      t.replace(r, () => {
        masked += 1
        return '[masqué]'
      }),
    text,
  )
  return { text: clean, masked }
}

const MAX_GROWTH = 3
const MIN_ROOM = 1500

export type Verdict = { ok: true; text: string } | { ok: false; reason: string }

// Une réécriture n'est acceptée que si elle n'apporte rien que le brouillon n'avait pas.
export const guardRewrite = (draft: string, rewritten: string): Verdict => {
  const { text } = stripInvisible(rewritten)
  if (text.length > Math.max(MIN_ROOM, draft.length * MAX_GROWTH)) {
    return { ok: false, reason: 'réécriture anormalement longue' }
  }
  const unseen = findUnseen(draft, text)
  if (unseen !== undefined) return { ok: false, reason: unseen.replace('du contexte', 'du brouillon') }
  if (findInjection(text) !== undefined) return { ok: false, reason: 'formulation d’injection' }

  return { ok: true, text }
}
