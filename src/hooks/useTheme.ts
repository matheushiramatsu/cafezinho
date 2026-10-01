import { useCallback, useEffect, useState } from 'react'
import { loadTheme, saveTheme, type ThemePreference } from '../domain/storage'

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

/** Preferência de tema: sistema por padrão, com escolha manual persistida. */
export function useTheme(): [ThemePreference, (theme: ThemePreference) => void] {
  const [theme, setThemeState] = useState<ThemePreference>(() => loadTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    saveTheme(next)
  }, [])

  return [theme, setTheme]
}
