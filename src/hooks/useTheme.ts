import { useCallback, useEffect, useState } from 'react'
import { loadTheme, saveTheme, type ThemePreference } from '../domain/storage'

type ManualTheme = Exclude<ThemePreference, 'system'>

/** Usa o tema salvo ou resolve a preferência inicial para claro ou escuro. */
export function useTheme(): [ManualTheme, (theme: ManualTheme) => void] {
  const [theme, setThemeState] = useState<ManualTheme>(() => {
    const saved = loadTheme()
    if (saved !== 'system') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setTheme = useCallback((next: ManualTheme) => {
    setThemeState(next)
    saveTheme(next)
  }, [])

  return [theme, setTheme]
}
