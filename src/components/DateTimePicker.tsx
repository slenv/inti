import { useState, useEffect } from 'react'
import { Calendar, Clock, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

const pad = (n: number) => String(n).padStart(2, '0')

interface Props {
  open: boolean
  setOpen: (b: boolean) => void
  date: string
  time: string
  onConfirm: (date: string, time: string) => void
}

export default function DateTimePicker({ open, setOpen, date, time, onConfirm }: Props) {
  const { t, locale } = useTranslation()
  const [viewYear, setViewYear] = useState(2026)
  const [viewMonth, setViewMonth] = useState(0)
  const [draftDate, setDraftDate] = useState('')
  const [draftHour, setDraftHour] = useState('12')
  const [draftMinute, setDraftMinute] = useState('00')
  const [draftPm, setDraftPm] = useState(false)

  useEffect(() => {
    if (!open) return
    const parts = date.split('-')
    const [y, m, d] = [parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)]
    const [h, mi] = time.split(':').map((v) => parseInt(v, 10) || 0)
    setViewYear(y); setViewMonth(m); setDraftDate(date)
    setDraftHour(String(((h + 11) % 12) + 1)); setDraftMinute(String(mi)); setDraftPm(h >= 12)
  }, [open, date, time])

  const navigate = (dir: 1 | -1) => {
    const d = new Date(viewYear, viewMonth + dir, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const todayStr = () => {
    const n = new Date()
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
  }
  const isToday = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` === todayStr()

  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 1, 4 + i))
  )
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstOffset = new Date(viewYear, viewMonth, 1).getDay()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(viewYear, viewMonth, 1))

  const pickTime = (kind: 'h' | 'm', dir: 1 | -1) => {
    if (kind === 'h') {
      setDraftHour((h) => {
        const n = parseInt(h, 10) || 12
        return String((((n - 1 + dir) % 12) + 12) % 12 + 1)
      })
    } else setDraftMinute((m) => pad(((parseInt(m, 10) || 0) + dir + 60) % 60))
  }

  const onHourTyped = (v: string) => {
    setDraftHour(v.replace(/\D/g, '').slice(0, 2))
  }

  const onMinuteTyped = (v: string) => {
    setDraftMinute(v.replace(/\D/g, '').slice(0, 2))
  }

  const commitHour = () => {
    const n = parseInt(draftHour, 10)
    setDraftHour(String(isNaN(n) || n < 1 || n > 12 ? 12 : n))
  }

  const commitMinute = () => {
    const n = parseInt(draftMinute, 10)
    setDraftMinute(pad(isNaN(n) ? 0 : Math.min(59, n)))
  }

  if (!open) return null

  const confirm = () => {
    const dH = parseInt(draftHour, 10)
    const h12 = isNaN(dH) || dH < 1 || dH > 12 ? 12 : dH
    const h = (h12 % 12) + (draftPm ? 12 : 0)
    const m = Math.max(0, Math.min(59, parseInt(draftMinute, 10) || 0))
    onConfirm(
      `${viewYear}-${pad(viewMonth + 1)}-${pad(parseInt(draftDate.split('-')[2] as string, 10))}`,
      `${pad(h)}:${pad(m)}`
    )
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full lg:max-w-md flex flex-col rounded-t-3xl lg:rounded-3xl bg-white dark:bg-[#1A1D27] shadow-2xl overflow-y-auto overscroll-contain max-h-[92dvh] animate-slide-up">
        <div className="flex items-center justify-between px-4 pt-4 pb-2.5 border-b border-gray-100 dark:border-white/10 shrink-0">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
            <span className="inline-flex items-center gap-2"><Calendar className="w-4 h-4 text-accent" /> {t('add.dateTime')}</span>
          </h2>
          <button onClick={() => setOpen(false)} className="text-sm text-accent font-semibold px-2 py-1 rounded-lg hover:bg-accent/10 transition-colors">
            {t('common.cancel')}
          </button>
        </div>

        {/* Calendar */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 capitalize">{monthLabel}</p>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {weekdayNames.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{w}</div>
            ))}
            {cells.map((day, i) => (
              <button
                key={i}
                disabled={day === null}
                onClick={() => setDraftDate(`${viewYear}-${pad(viewMonth + 1)}-${pad(day as number)}`)}
                className={`aspect-square rounded-lg text-sm font-medium transition-colors disabled:opacity-0 ${
                  day === parseInt(draftDate.split('-')[2] as string, 10) && viewMonth === parseInt(draftDate.split('-')[1] as string, 10) - 1 && viewYear === parseInt(draftDate.split('-')[0] as string, 10)
                    ? 'bg-accent text-white shadow-md shadow-accent/40'
                    : isToday(viewYear, viewMonth, day as number)
                      ? 'text-accent font-bold ring-1 ring-accent/60'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="px-4 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5" /> {t('add.time')}
          </p>
          <div className="flex items-center justify-center gap-4 py-1">
            <div className="flex flex-col items-center gap-0.5">
              <button onClick={() => pickTime('h', 1)} className="p-1 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"><ChevronUp className="w-4 h-4" /></button>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                placeholder="12"
                value={draftHour}
                onChange={(e) => onHourTyped(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={commitHour}
                aria-label={t('add.hour')}
                className="w-14 text-center text-3xl font-bold tabular-nums text-gray-800 dark:text-gray-100 bg-transparent rounded-xl focus:bg-accent/10 outline-none py-1"
              />
              <button onClick={() => pickTime('h', -1)} className="p-1 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"><ChevronDown className="w-4 h-4" /></button>
            </div>
            <span className="text-3xl font-bold text-gray-300">:</span>
            <div className="flex flex-col items-center gap-0.5">
              <button onClick={() => pickTime('m', 1)} className="p-1 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"><ChevronUp className="w-4 h-4" /></button>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={draftMinute}
                onChange={(e) => onMinuteTyped(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={commitMinute}
                aria-label={t('add.minute')}
                className="w-14 text-center text-3xl font-bold tabular-nums text-gray-800 dark:text-gray-100 bg-transparent rounded-xl focus:bg-accent/10 outline-none py-1"
              />
              <button onClick={() => pickTime('m', -1)} className="p-1 text-gray-400 hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"><ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 bg-gray-100 dark:bg-white/5 rounded-xl p-1 w-fit mx-auto">
            <button
              type="button"
              onClick={() => setDraftPm(false)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${!draftPm ? 'bg-white dark:bg-night-input text-accent shadow-sm' : 'text-gray-400'}`}
            >
              {t('add.am')}
            </button>
            <button
              type="button"
              onClick={() => setDraftPm(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${draftPm ? 'bg-white dark:bg-night-input text-accent shadow-sm' : 'text-gray-400'}`}
            >
              {t('add.pm')}
            </button>
          </div>
        </div>

        <div className="px-4 py-4 shrink-0">
          <button onClick={confirm} className="btn-primary flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}