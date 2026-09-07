import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  type Day,
} from 'date-fns'

export type Period = 'all' | 'week' | 'month' | 'year'

export interface PeriodRange {
  from: string
  to: string
}

export function periodRange(
  period: Period,
  opts?: { weekStartsOn?: number },
): PeriodRange | null {
  if (period === 'all') return null
  const now = new Date()
  const weekStartsOn = (opts?.weekStartsOn ?? 0) as Day
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (period) {
    case 'week':
      return {
        from: fmt(startOfWeek(now, { weekStartsOn })),
        to: fmt(endOfWeek(now, { weekStartsOn })),
      }
    case 'month':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) }
    case 'year':
      return { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) }
  }
}

export function trendRange(now: Date = new Date()): PeriodRange {
  return {
    from: format(startOfMonth(subMonths(now, 3)), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

export function fromRange(range: PeriodRange | null): { from: string; to: string } {
  return {
    from: range?.from ?? '',
    to: range?.to ?? '',
  }
}

// Rango mínimo que cubre tanto el período seleccionado como la tendencia
// (mesh de 4 meses) para poder calcular ambos con una sola consulta.
export function queryRange(
  range: PeriodRange | null,
  trend: PeriodRange,
): { from?: string; to?: string } {
  const from = range && range.from < trend.from ? range.from : trend.from
  const to = range && range.to > trend.to ? range.to : trend.to
  return { from, to }
}