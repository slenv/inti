import { useState } from 'react'
import { ArrowLeft, LogOut, Wallet, Tag, ChevronRight, User, Check, Languages, Camera, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation, type Locale } from '@/lib/i18n'
import { COLORS } from '@/types/database'
import ColorPicker from '@/components/ColorPicker'

const LANGUAGE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
}

export default function Profile() {
  const { t, locale, setLocale } = useTranslation()
  const navigate = useNavigate()
  const { profile, setProfile } = useAppStore()
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color ?? COLORS[0])
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setPhotoError(null)
    setUploading(true)
    try {
      const preview = URL.createObjectURL(file)
      setAvatarUrl(preview)
      const ext = file.name.split('.').pop() || 'png'
      const path = `${profile.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
      if (updateError) throw updateError
      setAvatarUrl(publicUrl)
      setProfile({ ...profile, avatar_url: publicUrl })
    } catch (err: any) {
      setPhotoError(err.message || t('profile.photoError'))
      setAvatarUrl(profile.avatar_url ?? '')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.from('profiles').update({ name, color }).eq('id', profile.id)
    if (!error) {
      setProfile({ ...profile, name, color })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const menuItems = [
    { icon: Wallet, label: t('profile.accounts'), path: '/accounts' },
    { icon: Tag, label: t('profile.categories'), path: '/categories' },
    { icon: Lock, label: t('profile.password'), path: '/password' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors"><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
        <h1 className="text-lg font-bold text-gray-800">{t('profile.title')}</h1>
      </div>

      <div className="flex flex-col items-center">
        <label className="relative cursor-pointer group">
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover shadow-lg border-2 border-white" />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg transition-colors duration-300" style={{ backgroundColor: color }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-0 -right-0 w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center shadow-md group-hover:bg-accent-hover transition-colors">
            {uploading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-4 h-4" />}
          </div>
        </label>
        {photoError && <p className="text-xs text-expense mt-2">{photoError}</p>}
        <p className="text-xs text-gray-400 mt-2">{t('profile.changePhoto')}</p>
      </div>

      {profile && (
      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm p-5 space-y-4 border border-gray-50">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('profile.name')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent" />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">{t('profile.color')}</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className="flex items-center gap-1.5">
          <Languages className="w-4 h-4 text-gray-400" />
          <label className="text-xs text-gray-400 flex-1">{t('profile.language')}</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="text-sm border border-gray-200 rounded-xl px-3 py-2">
            {(['es', 'en'] as Locale[]).map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
          </select>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t('common.saving') : saved ? <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> {t('profile.saved')}</span> : t('common.save')}
        </button>
      </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50 border border-gray-50">
        {menuItems.map((item) => (
          <button key={item.path} onClick={() => navigate(item.path)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 active:bg-accent/5 transition-colors">
            <item.icon className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-gray-700">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
          </button>
        ))}
      </div>

      <button onClick={handleSignOut} className="btn-danger flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" /> {t('profile.logout')}
      </button>
    </div>
  )
}
