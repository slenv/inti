import { useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/i18n'

export default function Password() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < 6) {
      setError(t('profile.passwordShort'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('profile.passwordMismatch'))
      return
    }
    setChangingPassword(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setChangingPassword(false)
    if (err) {
      setError(err.message)
      return
    }
    setPassword('')
    setConfirmPassword('')
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        <h1 className="text-lg font-bold text-gray-800">{t('profile.password')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-5 space-y-4 border border-gray-50">
        {error && <p className="text-xs text-expense">{error}</p>}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('profile.newPassword')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('profile.confirmPassword')}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent outline-none"
          />
        </div>
        <button type="submit" disabled={changingPassword} className="btn-primary">
          {changingPassword ? t('common.saving') : done ? <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> {t('profile.passwordChanged')}</span> : t('common.save')}
        </button>
      </form>
    </div>
  )
}