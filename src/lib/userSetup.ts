import { supabase } from '@/lib/supabase'

export interface UserData {
  profile: any
  spaces: any[]
}

let inFlight: Promise<UserData> | null = null

export function ensureUserData(userId: string, displayName?: string): Promise<UserData> {
  if (!inFlight) {
    inFlight = doEnsureUserData(userId, displayName).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function doEnsureUserData(userId: string, displayName?: string): Promise<UserData> {
  let profile: any = null
  let spaces: any[] = []

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (existingProfile) {
    profile = existingProfile
  } else {
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        name: displayName || userId.slice(0, 8),
        color: '#8B72D4',
      })
      .select()
      .single()
    if (profileError) console.error('[userSetup] profile', profileError)
    profile = newProfile
  }

  const { data: memberships } = await supabase
    .from('space_members')
    .select('space_id, spaces(*)')
    .eq('user_id', userId)

  spaces = (memberships ?? []).map((m) => m.spaces).filter(Boolean)

  if (spaces.length === 0) {
    const { data: space, error: rpcError } = await supabase
      .rpc('create_space', { p_name: 'Personal', p_currency: 'PEN' })
      .select()
      .single()

    if (rpcError || !space) {
      console.error('[userSetup] rpc', rpcError)
      const { data: fallback, error: fbError } = await supabase
        .from('spaces')
        .insert({
          name: 'Personal',
          invite_code: 'int-' + Date.now().toString(36).padStart(8, '0').toUpperCase(),
          currency: 'PEN',
          created_by: userId,
        })
        .select()
        .single()
      if (fbError) {
        console.error('[userSetup] space', fbError)
      } else if (fallback) {
        const { error: memberError } = await supabase
          .from('space_members')
          .insert({ space_id: fallback.id, user_id: userId, role: 'owner' })
        if (memberError) console.error('[userSetup] member', memberError)
        spaces = [fallback]
      }
    } else {
      spaces = [space]
    }
  }

  return { profile, spaces }
}