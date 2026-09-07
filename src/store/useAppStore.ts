import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Profile, Space } from '@/types/database'
import type { Period } from '@/lib/period'

interface AppState {
  profile: Profile | null
  spaces: Space[]
  activeSpaceId: string | null
  period: Period
  setProfile: (profile: Profile | null) => void
  setSpaces: (spaces: Space[]) => void
  setActiveSpaceId: (id: string | null) => void
  setPeriod: (period: Period) => void
  getActiveSpace: () => Space | undefined
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: null,
      spaces: [],
      activeSpaceId: null,
      period: 'all',
      setProfile: (profile) => set({ profile }),
      setSpaces: (spaces) => {
        const state = get()
        const currentStillExists = state.activeSpaceId && spaces.some((s) => s.id === state.activeSpaceId)
        if (currentStillExists) {
          set({ spaces })
        } else {
          set({ spaces, activeSpaceId: spaces[0]?.id ?? null })
        }
      },
      setActiveSpaceId: (id) => set({ activeSpaceId: id }),
      setPeriod: (period) => set({ period }),
      getActiveSpace: () => {
        const state = get()
        return state.spaces.find((s) => s.id === state.activeSpaceId)
      },
    }),
    {
      name: 'inti-app-v1',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        profile: s.profile,
        spaces: s.spaces,
        activeSpaceId: s.activeSpaceId,
        period: s.period,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AppState>),
        period: (persisted as Partial<AppState>)?.period ?? 'all',
      }),
    }
  )
)