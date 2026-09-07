import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'inti-theme'
let current: Theme = 'light'
const listeners = new Set<() => void>()

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function initTheme() {
  try {
    const stored = localStorage.getItem(KEY)
    current = stored === 'dark' || stored === 'light' ? stored : systemTheme()
  } catch {
    current = systemTheme()
  }
  apply(current)
}

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getThemeSnapshot(): Theme {
  return current
}

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // ignore
  }
  apply(theme)
  emit()
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot)
}