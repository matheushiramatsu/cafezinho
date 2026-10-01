import { useEffect, useState, useSyncExternalStore } from 'react'
import { SharedStore } from '../domain/shared'

export function useSharedState() {
  const [store] = useState(() => new SharedStore())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    void store.refresh()
    const timer = window.setInterval(() => { void store.refresh() }, 3000)
    const refresh = () => { void store.retry() }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!store.hasUnsavedChanges()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [store])
  return { ...snapshot, dispatch: store.dispatch, store }
}
