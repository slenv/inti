import { supabase } from '@/lib/supabase'

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export interface ShareScope {
  scope: string[]
  allowedAccounts: string[]
  sharedBy: Record<string, string>
}

export async function getShareScope(spaceId: string): Promise<ShareScope> {
  const [spaceSharesRes, accountSharesRes] = await Promise.all([
    supabase.from('space_shares').select('shared_space_id').eq('space_id', spaceId),
    supabase
      .from('account_shares')
      .select('account_id, created_by')
      .eq('space_id', spaceId),
  ])
  const sharedBy: Record<string, string> = {}
  for (const r of accountSharesRes.data ?? []) {
    if (r.created_by) sharedBy[r.account_id] = r.created_by
  }
  return {
    scope: [spaceId, ...(spaceSharesRes.data?.map((r) => r.shared_space_id) ?? [])],
    allowedAccounts: (accountSharesRes.data?.map((r) => r.account_id) ?? []),
    sharedBy,
  }
}

export async function getMyAccountIds(
  userId: string | undefined | null,
): Promise<string[]> {
  if (!userId) return []
  const { data } = await supabase.from('accounts').select('id').eq('user_id', userId)
  return (data ?? []).map((a) => a.id) as string[]
}

export function spaceScopeFilter(opts: {
  scopeIds: string[]
  myAccountIds: string[]
  hasOtherMembers: boolean
}): string | null {
  const myIds = opts.myAccountIds.filter(Boolean)
  if (!opts.hasOtherMembers && myIds.length > 0) {
    return `space_id.in.(${opts.scopeIds.join(',')}),account_id.in.(${myIds.join(',')}),to_account_id.in.(${myIds.join(',')})`
  }
  return null
}

export function filterOwnScope(scope: string[], memberSpaceIds: string[]): string[] {
  const memberSet = new Set(memberSpaceIds)
  return scope.filter((id) => memberSet.has(id))
}

export async function getUserOwners(
  userIds?: string[],
): Promise<Map<string, SpaceOwnerSummary>> {
  const map = new Map<string, SpaceOwnerSummary>()
  let query = supabase.from('profiles').select('id, name, color, avatar_url')
  if (userIds && userIds.length > 0) query = query.in('id', userIds)
  const { data } = await query
  for (const p of data ?? []) {
    map.set(p.id, {
      key: p.id,
      name: p.name,
      color: p.color,
      avatar_url: p.avatar_url,
      spaceId: p.id,
    })
  }
  return map
}

export interface SpaceOwnerSummary {
  key: string
  name: string
  color: string
  avatar_url: string | null
  spaceId: string
}

export async function getSpaceOwners(
  spaceIds: string[],
): Promise<Map<string, SpaceOwnerSummary>> {
  const map = new Map<string, SpaceOwnerSummary>()
  if (spaceIds.length === 0) return map
  const { data: spaces } = await supabase
    .from('spaces')
    .select('id, name, created_by')
    .in('id', spaceIds)
  if (!spaces) return map
  const createdByIds = [
    ...new Set((spaces as any[]).map((s) => s.created_by).filter(Boolean)),
  ]
  const profilesMap = new Map<string, { name: string; color: string; avatar_url: string | null }>()
  if (createdByIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, name, color, avatar_url')
      .in('id', createdByIds)
    for (const p of profs ?? []) {
      profilesMap.set(p.id, { name: p.name, color: p.color, avatar_url: p.avatar_url })
    }
  }
  for (const s of spaces as any[]) {
    const owner = profilesMap.get(s.created_by)
    map.set(s.id, {
      key: s.created_by ?? s.id,
      name: owner?.name ?? s.name ?? '—',
      color: owner?.color ?? '#9CA3AF',
      avatar_url: owner?.avatar_url ?? null,
      spaceId: s.id,
    })
  }
  return map
}

export interface OwnerGroup<T> {
  owner: SpaceOwnerSummary
  items: T[]
}

export function groupByUser<T extends { user_id: string }>(
  items: T[],
  ownerMap: Map<string, SpaceOwnerSummary>,
  firstKey?: string,
): OwnerGroup<T>[] {
  const groups: OwnerGroup<T>[] = []
  const pushed = new Set<string>()
  const groupIndex = new Map<string, number>()
  const push = (owner: SpaceOwnerSummary) => {
    if (!pushed.has(owner.key)) {
      pushed.add(owner.key)
      groupIndex.set(owner.key, groups.length)
      groups.push({ owner, items: [] })
    }
  }
  if (firstKey) {
    const owner = ownerMap.get(firstKey)
    if (owner) push(owner)
  }
  for (const it of items) {
    const owner = ownerMap.get(it.user_id) ?? {
      key: it.user_id,
      name: '—',
      color: '#9CA3AF',
      avatar_url: null,
      spaceId: it.user_id,
    }
    push(owner)
    groups[groupIndex.get(owner.key)!].items.push(it)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function groupByOwner<T extends { space_id: string }>(
  items: T[],
  scope: string[],
  ownerMap: Map<string, SpaceOwnerSummary>,
): OwnerGroup<T>[] {
  const groups: OwnerGroup<T>[] = []
  const pushed = new Set<string>()
  const groupIndex = new Map<string, number>()
  const push = (owner: SpaceOwnerSummary) => {
    if (!pushed.has(owner.key)) {
      pushed.add(owner.key)
      groupIndex.set(owner.key, groups.length)
      groups.push({ owner, items: [] })
    }
  }
  for (const spaceId of scope) {
    const o = ownerMap.get(spaceId)
    if (o) push(o)
  }
  for (const it of items) {
    const owner = ownerMap.get(it.space_id) ?? {
      key: it.space_id,
      name: '—',
      color: '#9CA3AF',
      avatar_url: null,
      spaceId: it.space_id,
    }
    push(owner)
    groups[groupIndex.get(owner.key)!].items.push(it)
  }
  return groups
}