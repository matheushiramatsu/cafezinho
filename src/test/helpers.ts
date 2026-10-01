import type { CoffeeItem, Participant } from '../domain/types'

/** PRNG determinístico (mulberry32) para testes reproduzíveis. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function person(id: string, extra: Partial<Participant> = {}): Participant {
  return {
    id,
    name: id.toUpperCase(),
    cannotBringItemIds: [],
    cannotBringCategories: [],
    preferredItemIds: [],
    ...extra,
  }
}

export function item(id: string, quantity = 1, category?: string): CoffeeItem {
  const result: CoffeeItem = { id, name: id.toUpperCase(), quantity }
  if (category) result.category = category
  return result
}

let counter = 0
export function nextId(): string {
  counter += 1
  return `gen-${counter}`
}
