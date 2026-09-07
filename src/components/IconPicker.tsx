import { ICON_KEYS, ICON_MAP, getIcon, isImageIcon, resolveIconSrc } from '@/lib/icons'
import { useTranslation } from '@/lib/i18n'
import { ImagePlus } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

function removeStoredIcon(url: string) {
  const marker = '/icons/'
  const idx = url.indexOf(marker)
  if (idx >= 0) supabase.storage.from('icons').remove([url.slice(idx + 1)])
}

export default function IconPicker({
  value,
  color = '#8B72D4',
  onChange,
}: {
  value: string | null
  color?: string
  onChange: (key: string | null) => void
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const isImage = isImageIcon(value)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `icons/${uid()}.${ext}`
    const { error } = await supabase.storage.from('icons').upload(path, file, { upsert: true })
    if (error) {
      setUploadError(t('common.uploadError'))
      return
    }
    const { data } = supabase.storage.from('icons').getPublicUrl(path)
    if (value && isImageIcon(value)) removeStoredIcon(value)
    onChange(data.publicUrl)
  }

  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">
        {t('common.icon')}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ICON_KEYS.map((k) => {
          const Icon = ICON_MAP[k]
          const active = value === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => { if (value && isImageIcon(value)) removeStoredIcon(value); onChange(k) }}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-shadow ${
                active
                  ? 'ring-2 ring-accent bg-accent/10'
                  : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              <Icon
                className="w-4 h-4"
                style={active && value ? { color } : undefined}
              />
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="upload image"
          className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center transition-shadow ${isImage ? 'ring-2 ring-accent' : 'bg-gray-100 dark:bg-white/5 text-accent border border-dashed border-accent/40'}`}
        >
          {isImage ? (
            <img src={resolveIconSrc(value!)} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </button>
      </div>
      {uploadError && (
        <p className="text-xs text-expense mt-1">{uploadError}</p>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  )
}

export function IconTile({
  icon,
  color,
  size = 'md',
}: {
  icon: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const c = color || '#8B72D4'
  const box = size === 'lg' ? 'w-12 h-12 rounded-2xl' : size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl'
  if (isImageIcon(icon)) {
    return (
      <span className={`${box} overflow-hidden shrink-0 bg-gray-100 dark:bg-white/10`}>
        <img src={resolveIconSrc(icon)} alt="" className="w-full h-full object-cover" />
      </span>
    )
  }
  const IconCmp = getIcon(icon)
  const ic = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <span
      className={`${box} flex items-center justify-center shrink-0`}
      style={{ backgroundColor: c + '20' }}
    >
      <IconCmp className={ic} style={{ color: c }} />
    </span>
  )
}