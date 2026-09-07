import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, ChevronRight, FileText, Tag, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation } from '@/lib/i18n'
import { formatTime12 } from '@/lib/time'
import type { Account, AccountType, Category, Space } from '@/types/database'
import { COLORS } from '@/types/database'
import ItemPicker, { type PickerGroup, type PickerItem } from '@/components/ItemPicker'
import UserBubble from '@/components/UserBubble'
import DateTimePicker from '@/components/DateTimePicker'
import PhotoAddButton from '@/components/PhotoAddButton'
import PhotoLightbox from '@/components/PhotoLightbox'
import SwipeableRow from '@/components/SwipeableRow'
import { IconTile } from '@/components/IconPicker'
import { ACCOUNT_TYPE_ICONS, DEFAULT_COLOR } from '@/lib/icons'
import { getUserOwners, type SpaceOwnerSummary } from '@/lib/shared'
import { Users } from 'lucide-react'

type TxType = 'expense' | 'income' | 'transfer'
type Picker = 'space' | 'category' | 'fromAccount' | 'toAccount' | null

const MAX_PHOTOS = 5

const TYPE_KEYS: Record<AccountType, string> = {
  cash: 'accounts.type.cash',
  bank: 'accounts.type.bank',
  digital_wallet: 'accounts.type.digital',
  savings: 'accounts.type.savings',
  other: 'accounts.type.other',
}

const pad = (n: number) => String(n).padStart(2, '0')

interface PhotoDraft {
  id: string
  file: File
  preview: string
}

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export default function AddTransaction() {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const { profile, activeSpaceId, getActiveSpace, spaces } = useAppStore()
  const [spaceId, setSpaceId] = useState<string>(activeSpaceId ?? '')
  const [txType, setTxType] = useState<TxType>('expense')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [owners, setOwners] = useState<Map<string, SpaceOwnerSummary>>(new Map())
  const [categories, setCategories] = useState<Category[]>([])
  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })
  const [time, setTime] = useState(() => `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`)
  const [showDate, setShowDate] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoViewer, setPhotoViewer] = useState<number | null>(null)

  const space = getActiveSpace()

  const [personalSpaces, setPersonalSpaces] = useState<Space[]>([])

  const selectedSpace = spaces.find((s) => s.id === spaceId)

  const chosenSpace = personalSpaces.find((s) => s.id === spaceId)

  useEffect(() => {
    if (!profile) return
    const ids = spaces.map((s) => s.id)
    if (ids.length === 0) {
      setPersonalSpaces([])
      return
    }
    supabase
      .from('space_members')
      .select('space_id')
      .in('space_id', ids)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        for (const row of data ?? []) counts[row.space_id] = (counts[row.space_id] ?? 0) + 1
        setPersonalSpaces(spaces.filter((s) => counts[s.id] === 1))
      })
  }, [spaces, profile?.id])

  useEffect(() => {
    if (activeSpaceId && personalSpaces.some((s) => s.id === activeSpaceId)) {
      setSpaceId(activeSpaceId)
    } else if (personalSpaces.length > 0 && !personalSpaces.some((s) => s.id === spaceId)) {
      setSpaceId(personalSpaces[0].id)
    }
  }, [personalSpaces, activeSpaceId])

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const cat = sp.get('category')
    const acc = sp.get('account')
    const tp = sp.get('type')
    if (tp === 'income' || tp === 'expense') setTxType(tp)
    if (cat) setCategoryId(cat)
    if (acc) setAccountId(acc)
  }, [])

  useEffect(() => {
    if (!activeSpaceId || !profile) return
    Promise.all([
      supabase.from('accounts').select('*').eq('user_id', profile.id),
      supabase.from('categories').select('*').eq('user_id', profile.id),
      supabase.from('accounts').select('*'),
      getUserOwners(),
    ]).then(([acc, cat, allAcc, ownersMap]) => {
      setAccounts(acc.data ?? [])
      setCategories(cat.data ?? [])
      setAllAccounts(allAcc.data ?? [])
      setOwners(ownersMap)
    })
  }, [activeSpaceId, profile?.id])

  const filteredCategories = categories.filter((c) => c.type === txType)

  function clearPicker() {
    setPicker(null)
  }

  const categoryItems: PickerItem[] = filteredCategories.map((c) => ({
    id: c.id,
    name: c.name,
    sub: c.type === 'expense' ? t('add.expense') : t('add.income'),
    icon: c.icon ? (
      <IconTile icon={c.icon} color={c.color ?? DEFAULT_COLOR} size="sm" />
    ) : (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (c.color ?? DEFAULT_COLOR) + '20' }}>
        <Tag className="w-4 h-4" style={{ color: c.color ?? DEFAULT_COLOR }} />
      </span>
    ),
  }))

  const spaceItems: PickerItem[] = personalSpaces.map((s) => ({
    id: s.id,
    name: s.name,
    sub: s.currency,
    icon: (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-accent/10">
        <Users className="w-4 h-4 text-accent" />
      </span>
    ),
  }))

  const toAccountItem = (a: Account): PickerItem => {
    const Icon = ACCOUNT_TYPE_ICONS[a.type]
    return {
      id: a.id,
      name: a.name,
      sub: t(TYPE_KEYS[a.type] as any),
      icon: a.icon ? (
        <IconTile icon={a.icon} color={a.color ?? DEFAULT_COLOR} />
      ) : (
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (a.color ?? DEFAULT_COLOR) + '20' }}>
          <Icon className="w-4 h-4" style={{ color: a.color ?? DEFAULT_COLOR }} />
        </span>
      ),
    }
  }

  const fromAccountItems = accounts.filter((a) => a.id !== toAccountId).map(toAccountItem)
  const toAccountGroups: PickerGroup[] = [
    {
      key: 'me',
      label: (
        <span className="text-[13px] font-semibold text-gray-500 truncate">
          {t('add.myAccounts')}
        </span>
      ),
      items: accounts.filter((a) => a.id !== accountId).map(toAccountItem),
    },
    ...[...owners.entries()]
      .filter(([uid]) => uid !== profile?.id)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .flatMap(([uid, owner]) => {
        const items = allAccounts.filter((a) => a.user_id === uid && a.id !== accountId)
        if (items.length === 0) return []
        return [{
          key: uid,
          label: (
            <div className="flex items-center gap-2">
              <UserBubble user={owner} size={20} />
              <span className="text-[13px] font-semibold text-gray-500 truncate">{owner.name}</span>
            </div>
          ),
          items: items.map(toAccountItem),
        }]
      }),
  ]

  async function createCategory(name: string, opts?: { icon?: string | null; color?: string }): Promise<PickerItem | null> {
    if (!activeSpaceId) return null
    const trimmed = name.trim()
    if (!trimmed) return null
    const { data, error } = await supabase.from('categories').insert({
      user_id: profile?.id,
      name: trimmed,
      type: txType as any,
      icon: opts?.icon ?? null,
      color: opts?.color ?? COLORS[0],
    }).select().single()
    if (error || !data) return null
    setCategories((prev) => [...prev, data as Category])
    return { id: data.id, name: data.name }
  }

  async function createAccount(name: string, opts?: { icon?: string | null; color?: string }): Promise<PickerItem | null> {
    if (!activeSpaceId) return null
    const trimmed = name.trim()
    if (!trimmed) return null
    const { data, error } = await supabase.from('accounts').insert({
      user_id: profile?.id,
      name: trimmed,
      type: 'cash',
      icon: opts?.icon ?? null,
      color: opts?.color ?? COLORS[0],
    }).select().single()
    if (error || !data) return null
    setAccounts((prev) => [...prev, data as Account])
    return { id: data.id, name: data.name }
  }

  function addPhotos(files: File[]) {
    const free = MAX_PHOTOS - photos.length
    if (free <= 0) return
    const picked = files.slice(0, free)
    setPhotos((prev) => [
      ...prev,
      ...picked.map((file) => ({ id: uid(), file, preview: URL.createObjectURL(file) })),
    ])
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((p) => p.id !== id)
    })
  }

  function handlePickerSelect(id: string) {
    if (picker === 'space') setSpaceId(id)
    else if (picker === 'category') setCategoryId(id)
    else if (picker === 'fromAccount') setAccountId(id)
    else if (picker === 'toAccount') setToAccountId(id)
    setPicker(null)
  }

  async function uploadPhoto(file: File, index: number, spaceId: string, userId: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${spaceId}/${userId}/${Date.now()}-${index}.${ext}`
    const { error: upErr } = await supabase.storage.from('transaction-photos').upload(path, file, { upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('transaction-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const targetSpaceId = personalSpaces.some((s) => s.id === spaceId)
      ? spaceId
      : personalSpaces[0]?.id ?? ''
    if (!targetSpaceId || !profile) return
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) {
      setError(t('add.amountError'))
      return
    }
    if (txType === 'transfer') {
      if (!accountId || !toAccountId) {
        setError(t('add.transferAccountsError'))
        return
      }
      if (accountId === toAccountId) {
        setError(t('add.transferSameAccount'))
        return
      }
    } else if (!accountId) {
      setError(t('add.accountError'))
      return
    }
    setSaving(true)
    setError(null)
    const uploaded: string[] = []
    try {
      for (let i = 0; i < photos.length; i++) {
        uploaded.push(await uploadPhoto(photos[i].file, i, targetSpaceId, profile.id))
      }
      const payload: Record<string, unknown> = {
        space_id: targetSpaceId,
        user_id: profile.id,
        amount: parsed,
        type: txType,
        description: description.trim() || null,
        date: new Date(`${date}T${time}:00`).toISOString(),
        photo_urls: uploaded,
      }
      if (txType === 'transfer') {
        payload.account_id = accountId
        payload.to_account_id = toAccountId
        payload.category_id = null
      } else {
        payload.account_id = accountId
        payload.category_id = categoryId || null
        payload.to_account_id = null
      }
      const { error: insErr } = await supabase.from('transactions').insert(payload)
      if (insErr) throw insErr
      navigate('/transactions')
    } catch (err: any) {
      if (uploaded.length > 0) {
        const paths = uploaded.map((url) => url.split('/transaction-photos/')[1]).filter(Boolean)
        supabase.storage.from('transaction-photos').remove(paths)
      }
      setError(err?.message || t('add.photoUploadError'))
    } finally {
      setSaving(false)
    }
  }

  if (!activeSpaceId || !profile) return null

  const selectedCategory = filteredCategories.find((c) => c.id === categoryId)
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedToAccount = allAccounts.find((a) => a.id === toAccountId)

  const categoryTile = (c?: Category | null) =>
    c?.icon ? (
      <IconTile icon={c.icon} color={c.color ?? DEFAULT_COLOR} />
    ) : (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (c?.color ?? DEFAULT_COLOR) + '20' }}>
        <Tag className="w-4 h-4" style={{ color: c?.color ?? DEFAULT_COLOR }} />
      </span>
    )

  const accountTile = (a?: Account | null) =>
    a?.icon ? (
      <IconTile icon={a.icon} color={a.color ?? DEFAULT_COLOR} />
    ) : (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (a?.color ?? DEFAULT_COLOR) + '20' }}>
        {(() => { const Icon = ACCOUNT_TYPE_ICONS[a?.type ?? 'cash']; return <Icon className="w-4 h-4" style={{ color: a?.color ?? DEFAULT_COLOR }} /> })()}
      </span>
    )

  const spaceTile = () => (
    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-accent/10">
      <Users className="w-4 h-4 text-accent" />
    </span>
  )

  function PickerRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
    return (
      <button type="button" onClick={onPress} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input transition-colors hover:border-accent">
        {icon}
        <span className="flex-1 text-left min-w-0">
          <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
          <span className={`block text-sm truncate ${value ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-400'}`}>
            {value || '—'}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-500 shrink-0" />
      </button>
    )
  }

  const typeOptions: { key: TxType; label: string; activeClass: string }[] = [
    { key: 'expense', label: t('add.expense'), activeClass: 'bg-expense text-white shadow-sm' },
    { key: 'income', label: t('add.income'), activeClass: 'bg-income text-white shadow-sm' },
    { key: 'transfer', label: t('add.transfer'), activeClass: 'bg-accent text-white shadow-sm' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors dark:hover:bg-white/10">
          <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t('add.title')}</h1>
      </div>

      <div className="grid grid-cols-3 bg-gray-100 dark:bg-white/10 rounded-xl p-1 gap-1">
        {typeOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              setTxType(opt.key)
              setError(null)
              if (opt.key === 'transfer') setCategoryId('')
              else setToAccountId('')
            }}
            className={`py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
              txType === opt.key ? opt.activeClass : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-night-card rounded-2xl shadow-sm p-5 space-y-4">
        {error && (
          <div className="bg-expense-light border border-expense/20 text-expense text-sm rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        {personalSpaces.length > 1 && (
          <PickerRow
            icon={spaceTile()}
            label={t('add.space')}
            value={chosenSpace?.name ?? ''}
            onPress={() => setPicker('space')}
          />
        )}

        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('add.amount')} ({selectedSpace?.currency ?? space?.currency})</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-3xl font-bold text-gray-800 dark:text-gray-100 text-center py-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input focus:border-accent outline-none"
          />
        </div>

        <button type="button" onClick={() => setShowDate(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input transition-colors hover:border-accent">
          <Calendar className="w-[18px] h-[18px] text-gray-400 shrink-0" />
          <span className="flex-1 text-left">
            <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t('add.date')}</span>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              {date} · {formatTime12(time, locale)}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-500 shrink-0" />
        </button>

        {txType === 'transfer' ? (
          <>
            <PickerRow
              icon={accountTile(selectedAccount)}
              label={t('add.fromAccount')}
              value={selectedAccount?.name ?? ''}
              onPress={() => setPicker('fromAccount')}
            />
            <PickerRow
              icon={accountTile(selectedToAccount)}
              label={t('add.toAccount')}
              value={selectedToAccount?.name ?? ''}
              onPress={() => setPicker('toAccount')}
            />
          </>
        ) : (
          <>
            <PickerRow
              icon={categoryTile(selectedCategory)}
              label={t('add.category')}
              value={selectedCategory?.name ?? ''}
              onPress={() => setPicker('category')}
            />
            <PickerRow
              icon={accountTile(selectedAccount)}
              label={t('add.account')}
              value={selectedAccount?.name ?? ''}
              onPress={() => setPicker('fromAccount')}
            />
          </>
        )}

        <div className="relative">
          <FileText className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <textarea
            name="description"
            placeholder={t('add.description')}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input text-sm focus:border-accent outline-none resize-none"
          />
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2 flex items-center justify-between">
            <span>{t('add.photos')}</span>
            <span className="text-[11px]">{photos.length}/{MAX_PHOTOS}</span>
          </p>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 mb-2.5">
              {photos.map((p) => (
                <SwipeableRow key={p.id} className="rounded-2xl" plain onDelete={() => removePhoto(p.id)}>
                  <div
                    className="relative aspect-square rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100 dark:ring-white/10 cursor-pointer"
                    onClick={() => setPhotoViewer(photos.findIndex((x) => x.id === p.id))}
                  >
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      aria-label="remove photo"
                      className="show-on-hover absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/80 backdrop-blur-sm"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          )}
          <PhotoAddButton
            onAdd={addPhotos}
            disabled={photos.length >= MAX_PHOTOS || saving}
            label={t('add.addPhotos')}
          />
          <p className="text-[11px] text-gray-400 mt-1.5">{t('add.photosHint')}</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={txType === 'expense' ? 'btn-danger' : txType === 'income' ? 'bg-income hover:bg-green-700 text-white w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 shadow-md shadow-income/25 active:scale-[0.98]' : 'bg-accent hover:bg-accent-hover text-white w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 shadow-md shadow-accent/25 active:scale-[0.98]'}
        >
          {saving ? t('common.saving') : t('add.save')}
        </button>
      </form>

      <ItemPicker
        open={picker === 'space'}
        title={t('add.space')}
        searchPlaceholder={t('add.space')}
        emptyText={t('add.noSpaces')}
        items={spaceItems}
        onSelect={handlePickerSelect}
        onClose={clearPicker}
      />
      <ItemPicker
        open={picker === 'category'}
        title={t('add.category')}
        searchPlaceholder={t('common.search')}
        addLabel={t('add.newCategory')}
        newNamePlaceholder={t('add.newCategoryName')}
        emptyText={t('categories.emptyDesc')}
        items={categoryItems}
        onSelect={handlePickerSelect}
        onCreate={createCategory}
        onClose={clearPicker}
      />
      <ItemPicker
        open={picker === 'fromAccount'}
        title={t('add.account')}
        searchPlaceholder={t('common.search')}
        addLabel={t('add.newAccount')}
        newNamePlaceholder={t('add.newAccountName')}
        emptyText={t('accounts.emptyDesc')}
        items={fromAccountItems}
        onSelect={handlePickerSelect}
        onCreate={createAccount}
        onClose={clearPicker}
      />
      <ItemPicker
        open={picker === 'toAccount'}
        title={t('add.toAccountTitle')}
        searchPlaceholder={t('common.search')}
        addLabel={t('add.newAccount')}
        newNamePlaceholder={t('add.newAccountName')}
        emptyText={t('accounts.emptyDesc')}
        groups={toAccountGroups}
        onSelect={handlePickerSelect}
        onCreate={createAccount}
        onClose={clearPicker}
      />
      <DateTimePicker
        open={showDate}
        setOpen={setShowDate}
        date={date}
        time={time}
        onConfirm={(d, tm) => { setDate(d); setTime(tm) }}
      />

      <PhotoLightbox
        photos={photos.map((p) => p.preview)}
        open={photoViewer !== null && photos.length > 0}
        initialIndex={photoViewer ?? 0}
        onClose={() => setPhotoViewer(null)}
      />
    </div>
  )
}