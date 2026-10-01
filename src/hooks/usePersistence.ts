import { useEffect, useSyncExternalStore } from 'react'
import type { StoredData } from '../domain/types'
import { saveData } from '../domain/storage'

export type PersistenceProblem = 'quota' | 'unavailable' | null

// Estado do último salvamento vive fora do React para ser lido via
// useSyncExternalStore (sem setState dentro de efeito).
let problem: PersistenceProblem = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function report(next: PersistenceProblem) {
  if (next === problem) return
  problem = next
  listeners.forEach((listener) => listener())
}

/** Salva os dados persistentes a cada mudança e expõe falhas de gravação. */
export function usePersistence({
  participants,
  items,
  coffeeDate,
  history,
  currentResultId,
}: StoredData) {
  useEffect(() => {
    const outcome = saveData({ participants, items, coffeeDate, history, currentResultId })
    report(outcome.ok ? null : outcome.reason)
  }, [participants, items, coffeeDate, history, currentResultId])

  return useSyncExternalStore(
    subscribe,
    () => problem,
    () => null,
  )
}
