import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Users, Copy, Check, Settings, Link as LinkIcon, X, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation } from '@/lib/i18n'
import { copyToClipboard } from '@/lib/clipboard'
import { CURRENCIES, CURRENCY_MAP } from '@/types/database'
import type { Account, AccountType, Space, SpaceMember } from '@/types/database'
import { IconTile } from '@/components/IconPicker'
import EmptyState from '@/components/EmptyState'

const TYPE_KEYS: Record<AccountType, string> = {
  cash: 'accounts.type.cash',
  bank: 'accounts.type.bank',
  digital_wallet: 'accounts.type.digital',
  savings: 'accounts.type.savings',
  other: 'accounts.type.other',
}

interface SpaceWithMembers extends Space {
  space_members: (SpaceMember & { profiles: { name: string; color: string; avatar_url: string | null } })[]
}

interface ShareRow {
  shared_space_id: string
  name: string
  created_by: string | null
  profile: { name: string; color: string; avatar_url: string | null } | null
}

interface OtherAccountShare {
  account_id: string
  created_by: string | null
  account: Pick<Account, 'id' | 'name' | 'type' | 'icon' | 'color'> | null
  profile: { name: string; color: string; avatar_url: string | null } | null
}

export default function Spaces() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, spaces, setSpaces, activeSpaceId, setActiveSpaceId } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showSettings, setShowSettings] = useState<string | null>(null)
  const [spaceDetails, setSpaceDetails] = useState<Record<string, SpaceWithMembers>>({})
  const [spaceShares, setSpaceShares] = useState<Record<string, ShareRow[]>>({})
  const [ownSpaces, setOwnSpaces] = useState<Space[]>([])
  const [sharedSpaceIds, setSharedSpaceIds] = useState<Set<string>>(() => new Set())
  const [personalSpaceId, setPersonalSpaceId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [ownAccounts, setOwnAccounts] = useState<Pick<Account, 'id' | 'name' | 'type' | 'icon' | 'color'>[]>([])
  const [spaceAccountShares, setSpaceAccountShares] = useState<Record<string, Set<string>>>({})
  const [accountSharesAll, setAccountSharesAll] = useState<Record<string, OtherAccountShare[]>>({})
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState('PEN')
  const [inviteCode, setInviteCode] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingJoin, setPendingJoin] = useState<Space | null>(null)
  const [pendingMode, setPendingMode] = useState<'join' | 'create'>('join')
  const [selectedShares, setSelectedShares] = useState<Set<string>>(() => new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(() => new Set())
  const [shareBusy, setShareBusy] = useState(false)

  const shareableOwnSpaces = (excludeId?: string) =>
    ownSpaces.filter((s) => s.id !== excludeId && !sharedSpaceIds.has(s.id))

  useEffect(() => {
    if (!profile) return
    supabase
      .from('space_members')
      .select('space_id, spaces(*)')
      .eq('user_id', profile.id)
      .eq('role', 'owner')
      .then(async ({ data }) => {
        const owned = (data ?? []).map((m) => (m as any).spaces).filter(Boolean)
        setOwnSpaces(owned)
        if (owned.length === 0) {
          setSharedSpaceIds(new Set())
          return
        }
        const { data: members } = await supabase
          .from('space_members')
          .select('space_id')
          .in('space_id', owned.map((s) => s.id))
        const counts: Record<string, number> = {}
        for (const m of (members ?? []) as { space_id: string }[]) {
          counts[m.space_id] = (counts[m.space_id] ?? 0) + 1
        }
        const multi = Object.keys(counts).filter((id) => counts[id] > 1)
        const multiSet = new Set(multi)
        setSharedSpaceIds(multiSet)
        const personal = owned
          .filter((s) => !multiSet.has(s.id))
          .sort((a, b) => ((a.created_at ?? '') as string).localeCompare((b.created_at ?? '') as string))[0]
        setPersonalSpaceId(personal?.id ?? null)
        setRenamingId(null)
      })
    supabase
      .from('accounts')
      .select('id, name, type, icon, color')
      .eq('user_id', profile.id)
      .order('created_at')
      .then(({ data }) => setOwnAccounts((data ?? []) as Pick<Account, 'id' | 'name' | 'type' | 'icon' | 'color'>[]))
  }, [profile])

  useEffect(() => {
    spaces.forEach(async (s) => {
      const uid = profile?.id
      const [membersRes, sharesRes, accountSharesRes, accountSharesAllRes] = await Promise.all([
        supabase
          .from('space_members')
          .select('*, profiles(name, color, avatar_url)')
          .eq('space_id', s.id),
        supabase
          .from('space_shares')
          .select('shared_space_id, created_by, shared:spaces!space_shares_shared_space_id_fkey(name), profiles(name, color, avatar_url)')
          .eq('space_id', s.id),
        uid
          ? supabase
              .from('account_shares')
              .select('account_id')
              .eq('space_id', s.id)
              .eq('created_by', uid)
          : Promise.resolve({ data: null as any }),
        supabase
          .from('account_shares')
          .select('account_id, created_by, account:accounts!account_shares_account_id_fkey(id, name, type, icon, color), profiles(name, color, avatar_url)')
          .eq('space_id', s.id),
      ])
      if (membersRes.data)
        setSpaceDetails((prev) => ({ ...prev, [s.id]: { ...s, space_members: membersRes.data as any } }))
      if (sharesRes.data)
        setSpaceShares((prev) => ({
          ...prev,
          [s.id]: sharesRes.data.map((sh: any) => ({
            shared_space_id: sh.shared_space_id,
            name: sh.shared?.name ?? '—',
            created_by: sh.created_by,
            profile: sh.profiles ?? null,
          })),
        }))
      if (accountSharesRes?.data)
        setSpaceAccountShares((prev) => ({
          ...prev,
          [s.id]: new Set((accountSharesRes.data as any[]).map((r) => r.account_id)),
        }))
      if (accountSharesAllRes?.data)
        setAccountSharesAll((prev) => ({
          ...prev,
          [s.id]: (accountSharesAllRes.data as any[]) as OtherAccountShare[],
        }))
    })
  }, [spaces, profile?.id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setLoading(true)

    const { data: space, error } = await supabase
      .rpc('create_space', { p_name: newName, p_currency: newCurrency })
      .returns<Space>()
      .single()

    if (space) {
      setPendingJoin(space)
      setPendingMode('create')
      setSelectedShares(new Set())
      setSelectedAccounts(new Set())
      setNewName('')
      setShowCreate(false)
    }

    setLoading(false)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setLoading(true)

    const { data, error } = await supabase
      .rpc('join_space', { p_code: inviteCode.toUpperCase().trim() })
      .single()
    const space = data as Space | null

    if (error || !space) {
      alert(t('spaces.invalidCode'))
      setLoading(false)
      return
    }

    setLoading(false)
    setInviteCode('')

    const joinedSpaceId = space.id
    if (spaces.some((s) => s.id === joinedSpaceId)) {
      setShowJoin(false)
      return
    }

    setPendingJoin(space)
    setSelectedShares(new Set())
    setSelectedAccounts(new Set())
  }

  async function handleConfirmJoin(share: boolean) {
    if (!pendingJoin || !profile) return
    setLoading(true)

    if (share && selectedShares.size > 0) {
      // Regla: un usuario solo puede compartir UN espacio a la vez.
      await supabase
        .from('space_shares')
        .delete()
        .eq('created_by', profile.id)
      const rows = [...selectedShares].map((sid) => ({
        space_id: pendingJoin.id,
        shared_space_id: sid,
        created_by: profile.id,
      }))
      const { error } = await supabase.from('space_shares').insert(rows)
      if (error) {
        console.error('[spaces] share', error)
        alert(t('spaces.shareError'))
        setLoading(false)
        return
      }
      await refreshAllShares()
    }

    if (share && selectedAccounts.size > 0) {
      const rows = [...selectedAccounts].map((aid) => ({
        account_id: aid,
        space_id: pendingJoin.id,
        created_by: profile.id,
      }))
      const { error } = await supabase.from('account_shares').insert(rows)
      if (error) {
        console.error('[spaces] share accounts', error)
        alert(t('spaces.shareError'))
        setLoading(false)
        return
      }
    }

    setSpaces([...spaces, pendingJoin])
    setPendingJoin(null)
    setPendingMode('join')
    setShowJoin(false)
    setSelectedShares(new Set())
    setSelectedAccounts(new Set())
    setLoading(false)
  }

  function toggleShare(id: string) {
    setSelectedShares((prev) => {
      if (prev.has(id)) return new Set()
      return new Set([id])
    })
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function closePending() {
    if (pendingMode === 'create' && pendingJoin && !spaces.some((s) => s.id === pendingJoin.id)) {
      setSpaces([...spaces, pendingJoin])
    }
    setPendingJoin(null)
    setPendingMode('join')
    setShowJoin(false)
    setShowCreate(false)
    setSelectedShares(new Set())
    setSelectedAccounts(new Set())
  }

  async function handleToggleShare(spaceId: string, sharedSpaceId: string, currentlyShared: boolean) {
    if (shareBusy || !profile) return
    setShareBusy(true)
    if (currentlyShared) {
      const { error } = await supabase
        .from('space_shares')
        .delete()
        .eq('space_id', spaceId)
        .eq('shared_space_id', sharedSpaceId)
      if (error) {
        console.error('[spaces] removeShare', error)
        alert(t('spaces.shareError'))
        setShareBusy(false)
        return
      }
    } else {
      // Regla: un usuario solo puede compartir UN espacio a la vez.
      // Primero se quitan sus shares previos y luego se inserta el nuevo.
      await supabase
        .from('space_shares')
        .delete()
        .eq('created_by', profile.id)
      const { error } = await supabase
        .from('space_shares')
        .insert({ space_id: spaceId, shared_space_id: sharedSpaceId, created_by: profile.id })
      if (error) {
        console.error('[spaces] addShare', error)
        alert(t('spaces.shareError'))
        setShareBusy(false)
        return
      }
    }
    await refreshAllShares()
    setShareBusy(false)
  }

  async function refreshAllShares() {
    if (!profile) return
    const { data } = await supabase
      .from('space_shares')
      .select('space_id, shared_space_id, created_by, shared:spaces!space_shares_shared_space_id_fkey(name), profiles(name, color, avatar_url)')
      .eq('created_by', profile.id)
    const bySpace: Record<string, ShareRow[]> = {}
    for (const sh of (data ?? []) as any[]) {
      const row: ShareRow = {
        shared_space_id: sh.shared_space_id,
        name: sh.shared?.name ?? '—',
        created_by: sh.created_by,
        profile: sh.profiles ?? null,
      }
      if (!bySpace[sh.space_id]) bySpace[sh.space_id] = []
      bySpace[sh.space_id].push(row)
    }
    setSpaceShares((prev) => {
      const next: Record<string, ShareRow[]> = {}
      for (const [spaceId, rows] of Object.entries(prev)) {
        const mine = bySpace[spaceId] ?? []
        const others = rows.filter((r) => r.created_by !== profile.id)
        next[spaceId] = [...others, ...mine]
      }
      return next
    })
  }

  async function handleToggleAccountShare(spaceId: string, accountId: string, currentlyShared: boolean) {
    if (shareBusy || !profile) return
    setShareBusy(true)
    if (currentlyShared) {
      const { error } = await supabase
        .from('account_shares')
        .delete()
        .eq('account_id', accountId)
        .eq('space_id', spaceId)
      if (error) {
        console.error('[spaces] removeAccountShare', error)
        alert(t('spaces.shareError'))
        setShareBusy(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('account_shares')
        .insert({ account_id: accountId, space_id: spaceId, created_by: profile.id })
      if (error) {
        console.error('[spaces] addAccountShare', error)
        alert(t('spaces.shareError'))
        setShareBusy(false)
        return
      }
    }
    await refreshAccountShares(spaceId)
    setShareBusy(false)
  }

  async function refreshAccountShares(spaceId: string) {
    if (!profile) return
    const { data } = await supabase
      .from('account_shares')
      .select('account_id')
      .eq('space_id', spaceId)
      .eq('created_by', profile.id)
    setSpaceAccountShares((prev) => ({
      ...prev,
      [spaceId]: new Set((data ?? []).map((r: any) => r.account_id)),
    }))
  }

  async function handleDeleteSpace(spaceId: string) {
    if (!confirm(t('spaces.deleteConfirm'))) return
    const { error } = await supabase.from('spaces').delete().eq('id', spaceId)
    if (error) {
      console.error('[spaces] delete', error)
      alert(t('spaces.deleteError'))
      return
    }
    const next = spaces.filter((s) => s.id !== spaceId)
    setSpaces(next)
    if (activeSpaceId === spaceId) setActiveSpaceId(next[0]?.id ?? null)
    setShowSettings(null)
  }

  async function handleLeaveSpace(spaceId: string) {
    if (!profile) return
    if (!confirm(t('spaces.leaveConfirm'))) return
    await supabase
      .from('space_shares')
      .delete()
      .eq('space_id', spaceId)
      .eq('created_by', profile.id)
    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', profile.id)
    if (error) {
      console.error('[spaces] leave', error)
      alert(t('spaces.leaveError'))
      return
    }
    const next = spaces.filter((s) => s.id !== spaceId)
    setSpaces(next)
    if (activeSpaceId === spaceId) setActiveSpaceId(next[0]?.id ?? null)
    setShowSettings(null)
  }

  function copyInviteCode(id: string, code: string) {
    void copyToClipboard(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleUpdateCurrency(spaceId: string, newCurrency: string) {
    await supabase.from('spaces').update({ currency: newCurrency }).eq('id', spaceId)
    setSpaces(spaces.map((s) => s.id === spaceId ? { ...s, currency: newCurrency } : s))
    setShowSettings(null)
  }

  async function handleRenameSpace(spaceId: string) {
    const newName = renameName.trim()
    if (!newName || renaming) return
    setRenaming(true)
    const { error } = await supabase.from('spaces').update({ name: newName }).eq('id', spaceId)
    setRenaming(false)
    if (error) {
      console.error('[spaces] rename', error)
      alert(t('spaces.shareError'))
      return
    }
    setSpaces(spaces.map((s) => s.id === spaceId ? { ...s, name: newName } : s))
    setOwnSpaces(ownSpaces.map((s) => s.id === spaceId ? { ...s, name: newName } : s))
    if (spaceDetails[spaceId]) {
      setSpaceDetails((prev) => ({ ...prev, [spaceId]: { ...prev[spaceId], name: newName } }))
    }
    setRenamingId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        <h1 className="text-lg font-bold text-gray-800">{t('spaces.title')}</h1>
      </div>

      <div className="flex gap-2">
        <button onClick={() => { setShowCreate(!showCreate); setShowJoin(false); setPendingJoin(null) }} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"><Plus className="w-4 h-4" /> {t('spaces.create')}</button>
        <button onClick={() => { setShowJoin(!showJoin); setShowCreate(false); setPendingJoin(null) }} className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3"><LinkIcon className="w-4 h-4" /> {t('spaces.join')}</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-sm p-5 space-y-3 border border-gray-50">
          <input type="text" placeholder={t('spaces.spaceName')} value={newName} onChange={(e) => setNewName(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent" />
          <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c} - {t(CURRENCY_MAP[c]?.nameKey as any)}</option>)}
          </select>
          <button type="submit" disabled={loading} className="btn-primary">{loading ? t('common.creating') : t('spaces.create')}</button>
        </form>
      )}

      {showJoin && (
        <form onSubmit={handleJoin} className="bg-white rounded-2xl shadow-sm p-5 space-y-3 border border-gray-50">
          <input type="text" placeholder={t('onboarding.inviteCode')} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required maxLength={8} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm uppercase tracking-wider font-mono text-center text-lg" />
          <button type="submit" disabled={loading} className="btn-primary">{loading ? t('spaces.joining') : t('spaces.join')}</button>
        </form>
      )}

      {pendingJoin && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3 border border-gray-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-700">
                {pendingMode === 'create' ? t('spaces.createShareTitle') : t('spaces.shareTitle')}
              </h3>
              <p className="text-xs text-gray-400 mt-1">{t('spaces.shareDesc')}</p>
            </div>
            <button onClick={closePending} className="p-1 text-gray-300 hover:text-gray-500 transition-colors" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {shareableOwnSpaces(pendingJoin.id).length === 0 ? (
            <p className="text-sm text-gray-400">{t('spaces.noOwnToShare')}</p>
          ) : (
            <div className="space-y-1.5">
              {shareableOwnSpaces(pendingJoin.id)
                .map((s) => {
                  const checked = selectedShares.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleShare(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${checked ? 'border-accent' : 'border-gray-300'}`}>
                        {checked && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-700 truncate">{s.name}</span>
                        <span className="block text-xs text-gray-400">{s.currency}</span>
                      </span>
                    </button>
                  )
                })}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 dark:border-white/10">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {t('spaces.yourAccounts')}
            </p>
            <p className="text-[11px] text-gray-300 dark:text-gray-500 mb-1.5">
              {t('spaces.yourAccountsDesc')}
            </p>
            {ownAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">{t('spaces.noAccountsToShare')}</p>
            ) : (
              <div className="space-y-1.5">
                {ownAccounts.map((a) => {
                  const checked = selectedAccounts.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <IconTile icon={a.icon} color={a.color} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-700 truncate">{a.name}</span>
                        <span className="block text-xs text-gray-400">{t(TYPE_KEYS[a.type] as any)}</span>
                      </span>
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent border-accent text-white' : 'border-gray-300'}`}>
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => handleConfirmJoin(false)} disabled={loading} className="btn-secondary flex-1 py-2.5">
              {pendingMode === 'create' ? t('spaces.createOnly') : t('spaces.joinOnly')}
            </button>
            <button onClick={() => handleConfirmJoin(true)} disabled={loading} className="btn-primary flex-1 py-2.5">
              {loading ? (pendingMode === 'create' ? t('common.creating') : t('spaces.joining')) : pendingMode === 'create' ? t('spaces.confirmCreate') : t('spaces.confirmShare')}
            </button>
          </div>
        </div>
      )}

      {spaces.length === 0 ? (
        <EmptyState icon={Users} title={t('spaces.empty')} description={t('spaces.emptyDesc')} />
      ) : (
        <div className="space-y-3">
          {spaces.map((space) => {
            const details = spaceDetails[space.id]
            const isActive = space.id === activeSpaceId
            const isOwner = details?.space_members?.some((m) => m.user_id === profile?.id && m.role === 'owner')
            const isPersonal = space.id === personalSpaceId
            const shares = spaceShares[space.id] ?? []
            const mySharedIds = new Set(
              shares.filter((sh) => sh.created_by === profile?.id).map((sh) => sh.shared_space_id),
            )
            const mySharedAccountIds = spaceAccountShares[space.id] ?? new Set()
            const myShareableSpaces = shareableOwnSpaces(space.id)
            const otherShares = shares.filter((sh) => sh.created_by !== profile?.id)
            const otherAccountShares = (accountSharesAll[space.id] ?? []).filter((a) => a.created_by !== profile?.id)
            const contributors = new Map<string, { profile: ShareRow['profile']; spaceName: string; accounts: Pick<Account, 'id' | 'name' | 'type' | 'icon' | 'color'>[] }>()
            for (const sh of otherShares) {
              if (!sh.created_by) continue
              const c = contributors.get(sh.created_by) ?? { profile: sh.profile, spaceName: '', accounts: [] }
              if (!c.spaceName) c.spaceName = sh.name
              contributors.set(sh.created_by, c)
            }
            for (const a of otherAccountShares) {
              if (!a.created_by || !a.account) continue
              const c = contributors.get(a.created_by) ?? { profile: a.profile, spaceName: '', accounts: [] }
              c.accounts.push(a.account)
              contributors.set(a.created_by, c)
            }

            return (
              <div key={space.id} onClick={() => setActiveSpaceId(space.id)} className={`bg-white rounded-2xl shadow-sm p-4 border-2 transition-all cursor-pointer ${isActive ? 'border-accent' : 'border-transparent hover:border-gray-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-700">{space.name}</h3>
                    <p className="text-xs text-gray-400">{space.currency}</p>
                  </div>
                  {isPersonal ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (renamingId === space.id) { setRenamingId(null) } else { setRenameName(space.name); setRenamingId(space.id) } }}
                      className="p-2 text-gray-300 hover:text-accent transition-colors"
                      title={t('spaces.rename')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  ) : isOwner ? (
                    <button onClick={(e) => { e.stopPropagation(); setShowSettings(showSettings === space.id ? null : space.id) }} className="p-2 text-gray-300 hover:text-accent transition-colors"><Settings className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setShowSettings(showSettings === space.id ? null : space.id) }} className="p-2 text-gray-300 hover:text-expense transition-colors"><Settings className="w-4 h-4" /></button>
                  )}
                </div>

                {renamingId === space.id && (
                  <div onClick={(e) => e.stopPropagation()} className="border-t border-gray-100 dark:border-white/10 pt-3 mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        maxLength={60}
                        autoFocus
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-accent"
                        placeholder={space.name}
                      />
                      <button
                        onClick={() => handleRenameSpace(space.id)}
                        disabled={renaming || !renameName.trim()}
                        className="p-2 rounded-xl bg-accent text-white disabled:opacity-50"
                        title={t('common.save')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="p-2 rounded-xl text-gray-400 hover:bg-gray-100"
                        title={t('common.cancel')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {!isPersonal && showSettings === space.id && (
                  <div className="border-t border-gray-100 dark:border-white/10 pt-3 mb-3 space-y-2">
                    <p className="text-xs text-gray-400">{t('spaces.changeCurrency')}</p>
                    <select value={space.currency} onChange={(e) => { e.stopPropagation(); handleUpdateCurrency(space.id, e.target.value) }} onClick={(e) => e.stopPropagation()} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c} - {t(CURRENCY_MAP[c]?.nameKey as any)}</option>)}
                    </select>
                    <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                      <div className="mb-1.5">
                        <p className="text-xs text-gray-400">{t('spaces.sharedSpaces')}</p>
                        <p className="text-[11px] text-gray-300 dark:text-gray-500">{t('spaces.sharedSpacesDesc')}</p>
                      </div>

                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-2 mb-1">{t('spaces.yourSpaces')}</p>
                      <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        {myShareableSpaces.length === 0 && (
                          <p className="text-xs text-gray-300 dark:text-gray-500">{t('spaces.noOwnToShare')}</p>
                        )}
                        {myShareableSpaces.map((s) => {
                          const checked = mySharedIds.has(s.id)
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={shareBusy}
                              onClick={() => handleToggleShare(space.id, s.id, checked)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'} ${shareBusy ? 'opacity-60' : ''}`}
                            >
<span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${checked ? 'border-accent' : 'border-gray-300'}`}>
                                {checked && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-gray-700 truncate">{s.name}</span>
                                <span className="block text-xs text-gray-400">{s.currency}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-1">{t('spaces.yourAccounts')}</p>
                      <p className="text-[11px] text-gray-300 dark:text-gray-500 mb-1.5">{t('spaces.yourAccountsDesc')}</p>
                      <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        {ownAccounts.length === 0 && (
                          <p className="text-xs text-gray-300 dark:text-gray-500">{t('spaces.noAccountsToShare')}</p>
                        )}
                        {ownAccounts.map((a) => {
                          const checked = mySharedAccountIds.has(a.id)
                          return (
                            <button
                              key={a.id}
                              type="button"
                              disabled={shareBusy}
                              onClick={() => handleToggleAccountShare(space.id, a.id, checked)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${checked ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'} ${shareBusy ? 'opacity-60' : ''}`}
                            >
                              <IconTile icon={a.icon} color={a.color} size="sm" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-medium text-gray-700 truncate">{a.name}</span>
                                <span className="block text-xs text-gray-400">{t(TYPE_KEYS[a.type] as any)}</span>
                              </span>
                              <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent border-accent text-white' : 'border-gray-300'}`}>
                                {checked && <Check className="w-3.5 h-3.5" />}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {contributors.size > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('spaces.sharedByOthers')}</p>
                          {[...contributors.entries()].map(([cuid, c]) => (
                            <div key={cuid} className="space-y-1">
                              <div className="flex items-center gap-2">
                                {c.profile?.avatar_url ? (
                                  <img src={c.profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                ) : (
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold shrink-0" style={{ backgroundColor: c.profile?.color ?? '#9CA3AF' }}>
                                    {(c.profile?.name ?? '?').charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm text-gray-600 truncate">{c.spaceName || c.profile?.name || '—'}</span>
                                  <span className="block text-[11px] text-gray-400 truncate">{c.profile?.name ?? '—'}</span>
                                </span>
                              </div>
                              {c.accounts.length > 0 && (
                                <div className="ml-7 space-y-1.5">
                                  {c.accounts.map((a) => (
                                    <div key={a.id} className="flex items-center gap-2">
                                      <IconTile icon={a.icon} color={a.color} size="sm" />
                                      <span className="flex-1 min-w-0">
                                        <span className="block text-xs text-gray-600 truncate">{a.name}</span>
                                        <span className="block text-[11px] text-gray-400 truncate">{t(TYPE_KEYS[a.type] as any)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="pt-1 flex gap-2">
                      {isOwner ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSpace(space.id) }}
                          className="flex-1 py-2 rounded-xl bg-expense-light dark:bg-expense/20 text-expense text-sm font-semibold hover:bg-expense/20 transition-colors"
                        >
                          {t('spaces.deleteSpace')}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleLeaveSpace(space.id) }}
                          className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:bg-gray-200 transition-colors"
                        >
                          {t('spaces.leaveSpace')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!isPersonal && (
                  <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-gray-400">{t('spaces.invite')}</span>
                    <code className="text-sm font-mono font-semibold text-gray-600 flex-1">{space.invite_code}</code>
                    <button onClick={(e) => { e.stopPropagation(); copyInviteCode(space.id, space.invite_code) }} className="p-1 text-gray-300 hover:text-accent transition-colors">
                      {copiedId === space.id ? <Check className="w-4 h-4 text-income" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {details?.space_members && (
                  <div className="flex items-center gap-1">
{details.space_members.map((m) => (
                      m.profiles.avatar_url ? (
                        <img key={m.user_id} src={m.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" title={m.profiles.name} />
                      ) : (
                        <div key={m.user_id} className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: m.profiles.color }} title={m.profiles.name}>
                          {m.profiles.name.charAt(0).toUpperCase()}
                        </div>
                      )
                    ))}
                    <span className="text-xs text-gray-400 ml-1">{details.space_members.length} {details.space_members.length !== 1 ? t('spaces.members') : t('spaces.member')}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
