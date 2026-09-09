import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAppStore } from '@/store/useAppStore'
import { supabase } from '@/lib/supabase'
import { I18nProvider } from '@/lib/i18n'
import { ensureUserData } from '@/lib/userSetup'
import { applyAccent } from '@/lib/accent'
import { initStatusBar } from '@/lib/statusBar'
import TopProgress, { startProgress, finishProgress } from '@/components/TopProgress'
import Layout from '@/components/Layout'
import BootScreen from '@/components/BootScreen'
import { sessionScroll } from '@/lib/sessionState'

function ScrollRestorer() {
  const { pathname } = useLocation()
  const prevRef = useRef(pathname)

  useEffect(() => {
    if (prevRef.current !== pathname) {
      sessionScroll.save(prevRef.current)
      prevRef.current = pathname
    }
    sessionScroll.restore(pathname)
  }, [pathname])

  return null
}

const Login = lazy(() => import('@/pages/Login'))
const Landing = lazy(() => import('@/pages/Landing'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Transactions = lazy(() => import('@/pages/Transactions'))
const AddTransaction = lazy(() => import('@/pages/AddTransaction'))
const Accounts = lazy(() => import('@/pages/Accounts'))
const Categories = lazy(() => import('@/pages/Categories'))
const Spaces = lazy(() => import('@/pages/Spaces'))
const Profile = lazy(() => import('@/pages/Profile'))
const Password = lazy(() => import('@/pages/Password'))
const Install = lazy(() => import('@/pages/Install'))
const AccountDetail = lazy(() => import('@/pages/AccountDetail'))
const TypeDetail = lazy(() => import('@/pages/TypeDetail'))
const CategoryDetail = lazy(() => import('@/pages/CategoryDetail'))

function RouteFallback() {
  useEffect(() => {
    startProgress()
    return () => finishProgress()
  }, [])
  return <BootScreen />
}

function userDisplayName(s: { user?: any } | undefined | null): string | undefined {
  const meta = s?.user?.user_metadata
  if (meta?.name) return meta.name
  const email = s?.user?.email
  if (email) return email.split('@')[0]
  return undefined
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const { setProfile, setSpaces, setActiveSpaceId } = useAppStore()
  const location = useLocation()

  useEffect(() => {
    let active = true
    startProgress()

    async function refreshUserData(userId: string, displayName?: string) {
      try {
        const { profile, spaces } = await ensureUserData(userId, displayName)
        if (!active) return
        if (profile) setProfile(profile)
        if (spaces) setSpaces(spaces as any)
      } catch {
        // non-fatal: pages load their own data
      } finally {
        if (active) finishProgress()
      }
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return
      if (s?.user) {
        setHasSession(true)
        setChecked(true)
        refreshUserData(s.user.id, userDisplayName(s))
      } else {
        finishProgress()
        setChecked(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      if (s?.user) {
        setHasSession(true)
        refreshUserData(s.user.id, userDisplayName(s))
      } else {
        setProfile(null)
        setSpaces([])
        setActiveSpaceId(null)
        finishProgress()
        setHasSession(false)
        setChecked(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (!checked) return <BootScreen />
  if (!hasSession) {
    if (location.pathname === '/') return <Landing />
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    let active = true
    startProgress()
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return
      setHasSession(!!s)
      finishProgress()
      setChecked(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (!checked) return <BootScreen />
  if (hasSession) return <Navigate to="/" replace />
  return <>{children}</>
}

function AccentTheme() {
  const profile = useAppStore((s) => s.profile)
  useEffect(() => {
    applyAccent(profile?.color)
  }, [profile?.color])
  useEffect(() => initStatusBar(), [])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    import('@capacitor/app').then(({ App }) => {
      let lastBack = 0
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back()
        else if (Date.now() - lastBack < 2000) App.exitApp()
        else lastBack = Date.now()
      })
    })
  }, [])
  return null
}

export default function App() {
  return (
    <I18nProvider>
      <AccentTheme />
      <TopProgress />
      <BrowserRouter>
        <ScrollRestorer />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/install" element={<Install />} />
            <Route path="/onboarding" element={<AuthGate><Onboarding /></AuthGate>} />
            <Route element={<AuthGate><Layout /></AuthGate>}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="add" element={<AddTransaction />} />
              <Route path="spaces" element={<Spaces />} />
              <Route path="profile" element={<Profile />} />
              <Route path="password" element={<Password />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="account-detail" element={<AccountDetail />} />
              <Route path="type-detail" element={<TypeDetail />} />
              <Route path="category-detail" element={<CategoryDetail />} />
              <Route path="categories" element={<Categories />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  )
}