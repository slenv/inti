import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { getThemeSnapshot, subscribeTheme } from './theme'

export async function syncStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  const dark = getThemeSnapshot() === 'dark'
  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: dark ? '#12141A' : '#FFFFFF' })
  } catch {
    // ignore
  }
}

export function initStatusBar() {
  void syncStatusBar()
  return subscribeTheme(() => void syncStatusBar())
}