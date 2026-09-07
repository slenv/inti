import { useTranslation } from '@/lib/i18n'
import type { Period } from '@/lib/period'

const ORDER: Period[] = ['all', 'week', 'month', 'year']

export default function PeriodSelector({
  value,
  onChange,
  className = '',
}: {
  value: Period
  onChange: (period: Period) => void
  className?: string
}) {
  const { t } = useTranslation()
  const labelKey: Record<Period, string> = {
    all: 'period.all',
    week: 'period.week',
    month: 'period.month',
    year: 'period.year',
  }

  return (
    <div
      className={`grid grid-cols-4 gap-1 w-full bg-gray-100 dark:bg-white/5 rounded-xl p-1 ${className}`}
    >
      {ORDER.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-1 py-1.5 rounded-lg text-[11px] font-semibold text-center truncate transition-all duration-150 ${
            value === p
              ? 'bg-white dark:bg-night-input text-accent shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {t(labelKey[p] as any)}
        </button>
      ))}
    </div>
  )
}