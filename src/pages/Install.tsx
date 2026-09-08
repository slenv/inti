import { useEffect, useState } from 'react'
import { Download, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { usePageMeta } from '@/lib/seo'
import { checkForUpdate } from '@/lib/update'
import Logo from '@/components/Logo'

export default function Install() {
  const { t } = useTranslation()
  usePageMeta(`${t('app.name')} – ${t('install.title')}`)
  const [url, setUrl] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    checkForUpdate().then((info) => {
      if (!active) return
      setVersion(info.latestVersion)
      setUrl(info.downloadUrl)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="flex justify-center">
          <Logo className="w-20 h-20" />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          {t('install.success')}
          {version && <span className="font-bold">v{version}</span>}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('install.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('install.subtitle')}</p>
        </div>

        <div className="space-y-2">
          <a
            href={url ?? '#'}
            className="block w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-accent/25 hover:bg-accent-hover transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('install.download')}
          </a>
          <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t('install.instructions')}
          </p>
        </div>
      </div>
    </div>
  )
}