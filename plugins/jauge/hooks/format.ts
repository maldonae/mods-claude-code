// Helpers purs, sans accès à `$`.

export type Level = 'success' | 'warning' | 'error'

/** Vert < 40 %, orange 40–60 %, rouge > 60 %. */
export const colorFor = (percent: number): Level =>
  percent < 40 ? 'success' : percent <= 60 ? 'warning' : 'error'

/** "2h13", "45 min", "0 min". */
export const formatRemaining = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return hours > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${rest} min`
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Heure locale du reset : "21h51" le jour même, "demain 09h00", sinon "lun. 09h00". */
export const formatResetAt = (resetMs: number, nowMs: number): string => {
  const at = new Date(resetMs)
  const hm = `${String(at.getHours()).padStart(2, '0')}h${String(at.getMinutes()).padStart(2, '0')}`
  const days = Math.round((startOfDay(at) - startOfDay(new Date(nowMs))) / 86_400_000)

  return days <= 0 ? hm : days === 1 ? `demain ${hm}` : `${DAYS[at.getDay()]} ${hm}`
}

/** "█████░░░░░" : `width` cases, remplies selon `percent`. */
export const bar = (percent: number, width: number): string => {
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)

  return '█'.repeat(full) + '░'.repeat(width - full)
}

/** "850", "12.3k", "1.2M". */
export const formatTokens = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n)
