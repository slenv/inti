import { useEffect, useState } from 'react'
import { COLORS } from '@/types/database'
import { useTranslation } from '@/lib/i18n'

const isPreset = (c: string) => (COLORS as readonly string[]).includes(c)

function normalizeHex(raw: string): string {
  let h = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((ch) => ch + ch).join('')
  if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase()
  return ''
}

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  const { t } = useTranslation()
  const custom = !isPreset(value)
  const [hex, setHex] = useState(value.replace(/^#/, ''))

  useEffect(() => {
    setHex(value.replace(/^#/, ''))
  }, [value])

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-full transition-shadow ${
              value === c
                ? 'ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600'
                : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 dark:hover:ring-white/10'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <label
          title={t('common.custom')}
          className="w-7 h-7 rounded-full relative overflow-hidden ring-1 ring-gray-300 dark:ring-white/25 cursor-pointer shrink-0"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            tabIndex={-1}
          />
        </label>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs text-gray-400 select-none">#</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={7}
            value={hex}
            onChange={(e) => {
              const raw = e.target.value
              setHex(raw.replace(/^#/, ''))
              const n = normalizeHex(raw)
              if (n) onChange(n)
            }}
            placeholder={custom ? '' : value.replace(/^#/, '').toUpperCase()}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-mono uppercase tracking-wide focus:border-accent outline-none bg-white dark:bg-night-input"
          />
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{t('common.custom')}</span>
      </div>
    </div>
  )
}