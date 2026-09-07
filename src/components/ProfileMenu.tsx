import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, User, Moon, Sun, Download, LogOut } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation } from '@/lib/i18n'
import { useTheme, setTheme } from '@/lib/theme'
import { checkForUpdate, installPageUrl, type UpdateInfo } from '@/lib/update'

function Avatar({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const profile = useAppStore((s) => s.profile)
  if (!profile) return null
  const cls = size === 'lg' ? 'w-12 h-12 text-base' : 'w-8 h-8 text-xs'
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${cls} rounded-full object-cover`} />
  }
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ backgroundColor: profile.color }}
    >
      {(profile.name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

export default function ProfileMenu({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const profile = useAppStore((s) => s.profile)
  const theme = useTheme()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isNative = Capacitor.isNativePlatform()
  const apkUrl = supabase.storage.from('apk').getPublicUrl('inti.apk').data.publicUrl
  const [open, setOpen] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    const check = () => {
      checkForUpdate().then((info) => {
        if (!cancelled) setUpdate(info)
      })
    }
    check()
    return () => {
      cancelled = true
    }
  }, [isNative])

  useEffect(() => {
    if (isNative && open && !update?.available) {
      checkForUpdate().then((info) => {
        setUpdate((prev) => prev?.available ? prev : info)
      })
    }
  }, [isNative, open, update?.available])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!profile) return null

  const isDark = theme === 'dark'

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const signOut = () => {
    useAppStore.setState({ profile: null, spaces: [], activeSpaceId: null })
    void supabase.auth.signOut({ scope: 'local' })
    navigate('/login')
  }

  const handleInstall = () => {
    setOpen(false)
    const url = update?.downloadUrl || apkUrl
    if (!url) return
    if (isNative) {
      // En el APK abrimos la página pública que da el "éxito" y descarga el APK.
      window.location.href = installPageUrl()
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = 'inti.apk'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 ${
          variant === 'sidebar' ? '' : 'focus-ring'
        }`}
      >
        <span className="relative">
          <Avatar />
          {update?.available && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#FF4D4D] border-2 border-white dark:border-[#0F1117] shadow-sm" />
          )}
        </span>
        {variant === 'sidebar' && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[110px]">
            {profile.name}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={[
            'absolute z-50 w-64 overflow-hidden rounded-2xl bg-white dark:bg-[#1A1D27] shadow-xl border border-gray-100 dark:border-white/10',
            variant === 'sidebar'
              ? 'bottom-full left-0 mb-2'
              : 'right-0 top-11',
          ].join(' ')}
        >
            <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-white/10">
              <Avatar size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{profile.name}</p>
              </div>
            </div>

            <div className="p-2 space-y-0.5">
              <button
                onClick={() => go('/profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors text-left"
              >
                <User className="w-[18px] h-[18px]" />
                {t('profile.title')}
              </button>

              <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors text-left"
              >
                {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
                {isDark ? t('theme.light') : t('theme.dark')}
              </button>

              {update?.available ? (
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-accent dark:text-accent hover:bg-accent/5 transition-colors text-left relative"
                >
                  <Download className="w-[18px] h-[18px]" />
                  {t('profile.upgrade')}
                  <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 rounded-full px-2 py-0.5">
                    {update.latestVersion}
                  </span>
                </button>
              ) : !isNative ? (
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors text-left"
                >
                  <Download className="w-[18px] h-[18px]" />
                  {t('profile.installApp')}
                </button>
              ) : null}

              <button
                onClick={signOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-expense hover:bg-expense/10 transition-colors text-left"
              >
                <LogOut className="w-[18px] h-[18px]" />
                {t('profile.logout')}
              </button>
            </div>
          </div>
      )}
    </div>
  )
}