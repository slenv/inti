import { useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export default function SwipeableRow({
  onEdit,
  onDelete,
  children,
  className = '',
  plain = false,
}: {
  onEdit?: () => void
  onDelete: () => void
  children: React.ReactNode
  className?: string
  plain?: boolean
}) {
  const { t } = useTranslation()
  const startX = useRef(0)
  const tracking = useRef(false)
  const [offset, setOffset] = useState(0)
  const open = offset <= -68

  const snap = (value: number) => (value <= -34 ? -72 : 0)

  const width = onEdit ? 152 : 80

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-y-0 right-0 flex transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0, width }}
      >
        {onEdit && (
          <button
            aria-label="edit"
            onClick={() => {
              setOffset(0)
              onEdit()
            }}
            className="w-20 flex items-center justify-center bg-accent text-white flex-col gap-0.5 active:bg-accent-hover"
          >
            <Pencil className="w-5 h-5" />
            <span className="text-[10px] font-semibold">{t('common.edit')}</span>
          </button>
        )}
        <button
          aria-label="delete"
          onClick={() => {
            setOffset(0)
            onDelete()
          }}
          className="w-20 flex items-center justify-center bg-expense text-white flex-col gap-0.5 active:bg-red-700"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-[10px] font-semibold">{t('common.delete')}</span>
        </button>
      </div>
      <div
        className={`relative transition-transform duration-200 ease-out ${plain ? "" : "bg-white dark:bg-[#1A1D27]"}`}
        style={{ transform: open ? `translateX(-${width}px)` : `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX
          tracking.current = true
        }}
        onTouchMove={(e) => {
          if (!tracking.current) return
          const dx = e.touches[0].clientX - startX.current
          const next = dx < 0 ? Math.max(dx, -width) : startX.current ? Math.min(dx, 0) : 0
          setOffset(next)
        }}
        onTouchEnd={() => {
          tracking.current = false
          setOffset((o) => snap(o))
        }}
        onTouchCancel={() => {
          tracking.current = false
          setOffset((o) => snap(o))
        }}
        onClick={() => {
          if (open) setOffset(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}