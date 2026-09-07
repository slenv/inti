import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Link as LinkIcon, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation } from '@/lib/i18n'

export default function Onboarding() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'choose' | 'join'>('choose')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { profile } = useAppStore()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: space, error: spaceError } = await supabase
        .from('spaces')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase().trim())
        .single()

      if (spaceError || !space) {
        throw new Error(t('onboarding.invalidCode'))
      }

      const { error: memberError } = await supabase
        .from('space_members')
        .insert({ space_id: space.id, user_id: profile?.id, role: 'member' })

      if (memberError) throw new Error(t('onboarding.alreadyMember'))

      navigate('/')
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePersonal() {
    setLoading(true)
    try {
      const { data: spaces } = await supabase
        .from('space_members')
        .select('spaces(*)')
        .eq('user_id', profile?.id)

      if (spaces && spaces.length > 0) {
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-accent-light/40 via-surface to-mint-light/40 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center mx-auto mb-4 shadow-lg shadow-accent/30">
            <Sun className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{t('onboarding.welcome')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('onboarding.howStart')}</p>
        </div>

        {mode === 'choose' ? (
          <div className="space-y-3">
            <button
              onClick={handlePersonal}
              disabled={loading}
              className="w-full bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-all duration-150 border border-gray-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Sun className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700">{t('onboarding.personal')}</h3>
                  <p className="text-sm text-gray-400">{t('onboarding.personalDesc')}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full bg-white rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-all duration-150 border border-gray-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-mint/10 flex items-center justify-center">
                  <UserPlus className="w-6 h-6 text-mint" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700">{t('onboarding.joinShared')}</h3>
                  <p className="text-sm text-gray-400">{t('onboarding.joinSharedDesc')}</p>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="bg-white rounded-2xl shadow-md p-6 space-y-4">
            {error && (
              <div className="bg-expense-light text-expense text-sm rounded-xl px-4 py-2.5">{error}</div>
            )}

            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('onboarding.inviteCode')}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                maxLength={8}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent transition-colors uppercase tracking-wider font-mono text-center text-lg"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? t('onboarding.joining') : t('onboarding.join')}
            </button>

            <button
              type="button"
              onClick={() => { setMode('choose'); setError(null) }}
              className="w-full text-sm text-gray-400 hover:text-gray-600"
            >
              {t('common.back')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
