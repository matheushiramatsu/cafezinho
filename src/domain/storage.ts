import type { AppData, Assignment, CoffeeItem, DrawSnapshot, Participant } from './types'
import { isValidDateString } from './date'
import {
  MAX_HISTORY,
  MAX_ITEMS,
  MAX_NAME_LENGTH,
  MAX_PARTICIPANTS,
  MAX_QUANTITY,
} from './limits'
import { cleanCategory } from './registry'
import { normalizeParticipants, uniq } from './rules'
import { collapseSpaces, normalizeKey } from './text'

export const STORAGE_KEY = 'cafe-da-firma:v1'
export const BACKUP_KEY = 'cafe-da-firma:v1:backup'
export const THEME_KEY = 'cafe-da-firma:theme'
export const STORAGE_VERSION = 1

export type ThemePreference = 'system' | 'light' | 'dark'

export function emptyData(): AppData {
  return { participants: [], items: [], coffeeDate: '', history: [] }
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = collapseSpaces(value)
  return name && name.length <= MAX_NAME_LENGTH ? name : null
}

class Counter {
  dropped = 0
}

function sanitizeParticipants(value: unknown, counter: Counter): Participant[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const names = new Set<string>()
  const result: Participant[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      counter.dropped += 1
      continue
    }
    const name = cleanName(entry.name)
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null
    if (!name || !id || ids.has(id) || names.has(normalizeKey(name))) {
      counter.dropped += 1
      continue
    }
    if (result.length >= MAX_PARTICIPANTS) {
      counter.dropped += 1
      continue
    }
    ids.add(id)
    names.add(normalizeKey(name))
    result.push({
      id,
      name,
      cannotBringItemIds: uniq(stringArray(entry.cannotBringItemIds)),
      cannotBringCategories: stringArray(entry.cannotBringCategories),
      preferredItemIds: uniq(stringArray(entry.preferredItemIds)),
    })
  }
  return result
}

function sanitizeItems(value: unknown, counter: Counter): CoffeeItem[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const names = new Set<string>()
  const result: CoffeeItem[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      counter.dropped += 1
      continue
    }
    const name = cleanName(entry.name)
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null
    const quantity = entry.quantity
    if (
      !name ||
      !id ||
      ids.has(id) ||
      names.has(normalizeKey(name)) ||
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY ||
      result.length >= MAX_ITEMS
    ) {
      counter.dropped += 1
      continue
    }
    ids.add(id)
    names.add(normalizeKey(name))
    const item: CoffeeItem = { id, name, quantity }
    const category = typeof entry.category === 'string' ? cleanCategory(entry.category) : undefined
    if (category) item.category = category
    result.push(item)
  }
  return result
}

function sanitizeSnapshot(value: unknown): DrawSnapshot | null {
  if (!isRecord(value)) return null
  const counter = new Counter()
  const id = typeof value.id === 'string' && value.id ? value.id : null
  const coffeeDate = typeof value.coffeeDate === 'string' ? value.coffeeDate : ''
  const createdAt =
    typeof value.createdAt === 'string' && !Number.isNaN(new Date(value.createdAt).getTime())
      ? value.createdAt
      : null
  if (!id || !isValidDateString(coffeeDate) || !createdAt) return null
  const items = sanitizeItems(value.items, counter)
  const participants = normalizeParticipants(
    sanitizeParticipants(value.participants, counter),
    items,
  )
  if (counter.dropped > 0 || !Array.isArray(value.assignments)) return null
  const participantIds = new Set(participants.map((p) => p.id))
  const itemIds = new Set(items.map((i) => i.id))
  const seen = new Set<string>()
  const assignments: Assignment[] = []
  for (const entry of value.assignments) {
    if (!isRecord(entry)) return null
    const { participantId, itemId } = entry
    if (
      typeof participantId !== 'string' ||
      typeof itemId !== 'string' ||
      !participantIds.has(participantId) ||
      !itemIds.has(itemId)
    ) {
      return null
    }
    const key = `${participantId}\u0000${itemId}`
    if (seen.has(key)) return null
    seen.add(key)
    assignments.push({ participantId, itemId })
  }
  return { id, coffeeDate, createdAt, participants, items, assignments }
}

export interface SanitizeResult {
  data: AppData
  dropped: number
}

/** Valida e saneia um payload desconhecido vindo do localStorage. */
export function sanitizeData(raw: unknown): SanitizeResult {
  if (!isRecord(raw)) return { data: emptyData(), dropped: 0 }
  const counter = new Counter()
  const items = sanitizeItems(raw.items, counter)
  const participants = normalizeParticipants(
    sanitizeParticipants(raw.participants, counter),
    items,
  )
  const coffeeDate =
    typeof raw.coffeeDate === 'string' && isValidDateString(raw.coffeeDate) ? raw.coffeeDate : ''
  const history: DrawSnapshot[] = []
  const historyIds = new Set<string>()
  if (Array.isArray(raw.history)) {
    for (const entry of raw.history) {
      const snapshot = sanitizeSnapshot(entry)
      if (!snapshot || historyIds.has(snapshot.id) || history.length >= MAX_HISTORY) {
        counter.dropped += 1
        continue
      }
      historyIds.add(snapshot.id)
      history.push(snapshot)
    }
  }
  return { data: { participants, items, coffeeDate, history }, dropped: counter.dropped }
}

export function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface LoadResult {
  data: AppData
  /** Aviso para mostrar ao usuário (dados descartados, payload corrompido...). */
  notice: string | null
}

export function loadData(storage: Storage | null = getStorage()): LoadResult {
  if (!storage) return { data: emptyData(), notice: null }
  let text: string | null
  try {
    text = storage.getItem(STORAGE_KEY)
  } catch {
    return { data: emptyData(), notice: null }
  }
  if (text === null) return { data: emptyData(), notice: null }

  const keepBackup = () => {
    try {
      storage.setItem(BACKUP_KEY, text)
    } catch {
      /* sem espaço: segue sem backup */
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    keepBackup()
    return {
      data: emptyData(),
      notice:
        'Os dados salvos neste navegador estavam ilegíveis e foram ignorados. Uma cópia do conteúdo original foi guardada à parte.',
    }
  }
  if (!isRecord(parsed)) {
    keepBackup()
    return {
      data: emptyData(),
      notice:
        'Os dados salvos neste navegador tinham formato inesperado e foram ignorados. Uma cópia do conteúdo original foi guardada à parte.',
    }
  }
  if (typeof parsed.version === 'number' && parsed.version > STORAGE_VERSION) {
    keepBackup()
    return {
      data: emptyData(),
      notice:
        'Os dados salvos vêm de uma versão mais nova do app e não puderam ser lidos. Uma cópia foi guardada à parte.',
    }
  }
  const { data, dropped } = sanitizeData(parsed)
  return {
    data,
    notice:
      dropped > 0
        ? `${dropped} ${dropped === 1 ? 'registro inválido foi descartado' : 'registros inválidos foram descartados'} ao carregar os dados salvos.`
        : null,
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

export function saveData(data: AppData, storage: Storage | null = getStorage()): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...data }))
    return { ok: true }
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return { ok: false, reason: quota ? 'quota' : 'unavailable' }
  }
}

export function loadTheme(storage: Storage | null = getStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(
  theme: ThemePreference,
  storage: Storage | null = getStorage(),
): boolean {
  try {
    if (!storage) return false
    if (theme === 'system') storage.removeItem(THEME_KEY)
    else storage.setItem(THEME_KEY, theme)
    return true
  } catch {
    return false
  }
}
