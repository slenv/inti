import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { COLORS } from '@/types/database'
import IconPicker from '@/components/IconPicker'
import ColorPicker from '@/components/ColorPicker'

export interface PickerItem {
  id: string
  name: string
  icon?: React.ReactNode
  sub?: string
}

export interface PickerGroup {
  key: string
  label: React.ReactNode
  items: PickerItem[]
}

export interface PickerCreateOptions {
  icon?: string | null
  color?: string
}

interface Props {
  open: boolean
  title: string
  searchPlaceholder: string
  addLabel?: string
  newNamePlaceholder?: string
  emptyText: string
  items?: PickerItem[]
  groups?: PickerGroup[]
  onSelect: (id: string) => void
  onCreate?: (name: string, opts?: PickerCreateOptions) => Promise<PickerItem | null>
  onClose: () => void
}

export default function ItemPicker({ open, title, searchPlaceholder, addLabel, newNamePlaceholder, emptyText, items, groups, onSelect, onCreate, onClose }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [createIcon, setCreateIcon] = useState<string | null>(null)
  const [createColor, setCreateColor] = useState(COLORS[0])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setCreating(false); setNewName(''); setError(false); setCreateIcon(null); setCreateColor(COLORS[0])
    }
  }, [open])

  useEffect(() => {
    if (!creating) return
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [creating])

  const filtered = useMemo(() => {
    const list = items ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((i) => i.name.toLowerCase().includes(q))
  }, [query, items])

  const grouped = useMemo(() => {
    if (!groups) return []
    const q = query.trim().toLowerCase()
    return groups
      .map((g: PickerGroup) => ({
        ...g,
        items: q ? g.items.filter((i) => i.name.toLowerCase().includes(q)) : g.items,
      }))
      .filter((g) => g.items.length > 0)
  }, [query, groups])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || busy || !onCreate) return
    setBusy(true); setError(false)
    const created = await onCreate(newName.trim(), { icon: createIcon, color: createColor })
    setBusy(false)
    if (created) {
      onSelect(created.id)
      onClose()
    } else {
      setError(true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full lg:max-w-md max-h-[88dvh] flex flex-col rounded-t-3xl lg:rounded-3xl bg-white dark:bg-[#1A1D27] shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-white/10">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm bg-white dark:bg-night-input focus:border-accent outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {creating ? (
            <div className="px-2 py-1 space-y-4">
              <IconPicker value={createIcon} color={createColor} onChange={setCreateIcon} />
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  {t('common.color')}
                </label>
                <ColorPicker value={createColor} onChange={setCreateColor} />
              </div>
            </div>
          ) : groups ? (
            <>
              {grouped.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">{emptyText}</p>
              )}
              {grouped.map((g) => (
                <div key={g.key} className="pt-3 first:pt-0">
                  <div className="px-3 pb-1">{g.label}</div>
                  <div className="space-y-0.5">
                    {g.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { onSelect(item.id); onClose() }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        {item.icon}
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{item.name}</span>
                          {item.sub && <span className="block text-xs text-gray-400 truncate">{item.sub}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">{emptyText}</p>
              )}
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onSelect(item.id); onClose() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  {item.icon}
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{item.name}</span>
                    {item.sub && <span className="block text-xs text-gray-400 truncate">{item.sub}</span>}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-6 border-t border-gray-100 dark:border-white/10">
          {creating ? (
            <form onSubmit={submit} className="flex gap-2">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={newNamePlaceholder}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm bg-white dark:bg-night-input focus:border-accent outline-none"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.create')}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="p-2.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <>
              {error && onCreate && (
                <p className="text-xs text-expense mb-2 text-center">{t('add.pickerCreateError')}</p>
              )}
              {onCreate && (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full py-3 rounded-xl border border-dashed border-accent/60 text-sm font-semibold text-accent flex items-center justify-center gap-2 transition-colors hover:bg-accent/5"
                >
                  <Plus className="w-4 h-4" /> {addLabel}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}