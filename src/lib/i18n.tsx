import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import es from '@/locales/es'
import en from '@/locales/en'

type Translations = { [K in keyof typeof es]: string }
type TranslationKey = keyof typeof es

export type Locale = 'es' | 'en'
const LOCALES: Locale[] = ['es', 'en']

const dictionaries: Record<Locale, Translations> = { es, en }

function detectLocale(): Locale {
  const stored = localStorage.getItem('inti-locale') as Locale | null
  if (stored && LOCALES.includes(stored)) return stored
  const browserLang = navigator.language.slice(0, 2)
  if (browserLang === 'en') return 'en'
  return 'es'
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  availableLocales: Locale[]
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem('inti-locale', newLocale)
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let value = dictionaries[locale]?.[key] ?? dictionaries['es']?.[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v))
        }
      }
      return value
    },
    [locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider')
  return ctx
}

export type { TranslationKey }
