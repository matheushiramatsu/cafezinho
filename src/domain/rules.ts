import type { CoffeeItem, Participant } from './types'
import { collapseSpaces, normalizeKey } from './text.js'

export type RestrictionReason = 'item' | 'category'

export function restrictionReason(
  participant: Participant,
  item: CoffeeItem,
): RestrictionReason | null {
  if (participant.cannotBringItemIds.includes(item.id)) return 'item'
  if (item.category) {
    const key = normalizeKey(item.category)
    if (participant.cannotBringCategories.some((c) => normalizeKey(c) === key)) {
      return 'category'
    }
  }
  return null
}

export function isRestricted(participant: Participant, item: CoffeeItem): boolean {
  return restrictionReason(participant, item) !== null
}

/** Preferência efetiva: restrição sempre vence preferência. */
export function effectivelyPrefers(participant: Participant, item: CoffeeItem): boolean {
  return participant.preferredItemIds.includes(item.id) && !isRestricted(participant, item)
}

export function uniq<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/** Categorias distintas (por chave normalizada), preservando a primeira grafia. */
export function distinctCategories(values: Array<string | undefined>): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    if (!value) continue
    const clean = collapseSpaces(value)
    if (!clean) continue
    const key = normalizeKey(clean)
    if (!seen.has(key)) seen.set(key, clean)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * Garante coerência dos cadastros: remove referências a itens que não existem,
 * duplicatas e preferências que conflitam com restrições (restrição vence).
 */
export function normalizeParticipants(
  participants: Participant[],
  items: CoffeeItem[],
): Participant[] {
  const itemIds = new Set(items.map((item) => item.id))
  return participants.map((participant) => {
    const cannotBringItemIds = uniq(participant.cannotBringItemIds).filter((id) =>
      itemIds.has(id),
    )
    const cannotBringCategories = distinctCategories(participant.cannotBringCategories)
    const base: Participant = {
      ...participant,
      cannotBringItemIds,
      cannotBringCategories,
      preferredItemIds: [],
    }
    const preferredItemIds = uniq(participant.preferredItemIds).filter((id) => {
      const item = items.find((candidate) => candidate.id === id)
      return item !== undefined && !isRestricted(base, item)
    })
    return { ...base, preferredItemIds }
  })
}
