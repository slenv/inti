const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime12(hhmm: string, locale: 'es' | 'en' = 'en'): string {
  const parts = hhmm.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h)) return hhmm
  const hour12 = ((h + 11) % 12) + 1
  const minute = isNaN(m) ? 0 : m
  const suffix = locale === 'es' ? (h >= 12 ? 'p. m.' : 'a. m.') : h >= 12 ? 'PM' : 'AM'
  return `${hour12}:${pad(minute)} ${suffix}`
}