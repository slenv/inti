import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { supabase } from '@/lib/supabase'

export const SITE_URL = import.meta.env.VITE_SITE_URL ?? ''

export function installPageUrl(): string {
  const base = Capacitor.isNativePlatform() ? SITE_URL : window.location.origin
  return `${base}/install`
}

export interface UpdateInfo {
  available: boolean
  installedVersion: string
  latestVersion: string
  downloadUrl: string
}

export interface LatestInfo {
  latestVersion: string
  build: string
  downloadUrl: string
}

interface InstalledInfo {
  version: string
  build: string
}

function normalize(v: string): string {
  return v.replace(/-.*$/, '')
}

function compare(a: string, b: string): number {
  const pa = normalize(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = normalize(b).split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

async function getInstalledInfo(): Promise<InstalledInfo | null> {
  try {
    if (!Capacitor.isNativePlatform()) return null
    const info = await App.getInfo()
    if (!info) return null
    return {
      version: info.version ?? '0.0.0',
      build: String(info.build ?? '0'),
    }
  } catch {
    // Sin info del plugin: no podemos afirmar que haya una actualización.
    return null
  }
}

async function getLatestInfo(): Promise<LatestInfo | null> {
  try {
    const { data } = supabase
      .storage
      .from('apk')
      .getPublicUrl('version.json')
    if (!data?.publicUrl) return null
    // Cache-bust por si el CDN sirve una copia vieja.
    const sep = data.publicUrl.includes('?') ? '&' : '?'
    const res = await fetch(`${data.publicUrl}${sep}t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    const latestVersion = String(json?.version ?? '').trim()
    const build = String(json?.build ?? '0').trim()
    if (!latestVersion) return null
    const downloadPath = String(json?.path ?? 'inti.apk')
    const dl = supabase.storage.from('apk').getPublicUrl(downloadPath).data.publicUrl
    if (!dl) return null
    return { latestVersion, build, downloadUrl: dl }
  } catch {
    return null
  }
}

function isNewer(latest: LatestInfo, installed: InstalledInfo): boolean {
  const lb = parseInt(latest.build, 10) || 0
  const ib = parseInt(installed.build, 10) || 0
  if (lb !== ib) return lb > ib
  return compare(latest.latestVersion, installed.version) > 0
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const installed = await getInstalledInfo()
  const latest = await getLatestInfo()
  if (!installed || !latest) {
    return {
      available: false,
      installedVersion: installed?.version ?? '',
      latestVersion: latest?.latestVersion ?? '',
      downloadUrl: latest?.downloadUrl ?? '',
    }
  }
  return {
    available: isNewer(latest, installed),
    installedVersion: installed.version,
    latestVersion: latest.latestVersion,
    downloadUrl: latest.downloadUrl,
  }
}