import type { AppData, Assignment, CoffeeItem, DrawSnapshot, Participant } from './types'
import { cloneSnapshot } from './draw'
import { MAX_HISTORY } from './limits'
import {
  cleanCategory,
  emptyParticipant,
  parseQuantity,
  validateItemName,
  validateParticipantName,
} from './registry'
import { isRestricted, normalizeParticipants } from './rules'
import { collapseSpaces, normalizeKey } from './text'

export interface AppState extends AppData {
  /** Resultado atual (não persistido; derivado de cadastros que podem mudar). */
  result: DrawSnapshot | null
  /** Verdadeiro quando um resultado visível foi descartado por uma edição. */
  invalidated: boolean
}

export function createState(data: AppData): AppState {
  return { ...data, result: null, invalidated: false }
}

export type Action =
  | { type: 'addParticipant'; id: string; name: string }
  | { type: 'importParticipants'; participants: Participant[] }
  | { type: 'renameParticipant'; id: string; name: string }
  | { type: 'removeParticipant'; id: string }
  | { type: 'togglePreferred'; participantId: string; itemId: string }
  | { type: 'toggleRestrictedItem'; participantId: string; itemId: string }
  | { type: 'toggleRestrictedCategory'; participantId: string; category: string }
  | { type: 'addItem'; id: string; name: string; quantity: number; category?: string }
  | { type: 'updateItem'; id: string; name: string; quantity: number; category?: string }
  | { type: 'removeItem'; id: string }
  | { type: 'setDate'; date: string }
  | { type: 'drawSucceeded'; snapshot: DrawSnapshot }
  | { type: 'showFromHistory'; id: string }
  | { type: 'clearResult' }
  | { type: 'removeHistory'; id: string }
  | { type: 'clearHistory' }

/** Alteração de cadastro/data: invalida o resultado atual. */
function edited(state: AppState, patch: Partial<AppData>): AppState {
  const next = { ...state, ...patch }
  const items = next.items
  return {
    ...next,
    participants: normalizeParticipants(next.participants, items),
    result: null,
    invalidated: state.result !== null || state.invalidated,
  }
}

function mapParticipant(
  state: AppState,
  id: string,
  update: (participant: Participant) => Participant,
): AppState {
  if (!state.participants.some((p) => p.id === id)) return state
  return edited(state, {
    participants: state.participants.map((p) => (p.id === id ? update(p) : p)),
  })
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'addParticipant': {
      if (validateParticipantName(action.name, state.participants)) return state
      const participant = emptyParticipant(action.id, collapseSpaces(action.name))
      return edited(state, { participants: [...state.participants, participant] })
    }
    case 'importParticipants': {
      if (action.participants.length === 0) return state
      return edited(state, { participants: [...state.participants, ...action.participants] })
    }
    case 'renameParticipant': {
      if (validateParticipantName(action.name, state.participants, action.id)) return state
      return mapParticipant(state, action.id, (p) => ({ ...p, name: collapseSpaces(action.name) }))
    }
    case 'removeParticipant': {
      if (!state.participants.some((p) => p.id === action.id)) return state
      return edited(state, {
        participants: state.participants.filter((p) => p.id !== action.id),
      })
    }
    case 'togglePreferred': {
      const item = state.items.find((i) => i.id === action.itemId)
      if (!item) return state
      return mapParticipant(state, action.participantId, (p) => {
        // Restrição vence: não é possível preferir o que não pode levar.
        if (isRestricted(p, item)) return p
        return { ...p, preferredItemIds: toggle(p.preferredItemIds, action.itemId) }
      })
    }
    case 'toggleRestrictedItem': {
      if (!state.items.some((i) => i.id === action.itemId)) return state
      return mapParticipant(state, action.participantId, (p) => ({
        ...p,
        cannotBringItemIds: toggle(p.cannotBringItemIds, action.itemId),
      }))
    }
    case 'toggleRestrictedCategory': {
      const key = normalizeKey(action.category)
      return mapParticipant(state, action.participantId, (p) => {
        const has = p.cannotBringCategories.some((c) => normalizeKey(c) === key)
        return {
          ...p,
          cannotBringCategories: has
            ? p.cannotBringCategories.filter((c) => normalizeKey(c) !== key)
            : [...p.cannotBringCategories, collapseSpaces(action.category)],
        }
      })
    }
    case 'addItem': {
      const quantity = parseQuantity(action.quantity)
      if (validateItemName(action.name, state.items) || !quantity.ok) return state
      const item: CoffeeItem = {
        id: action.id,
        name: collapseSpaces(action.name),
        quantity: quantity.value,
      }
      const category = cleanCategory(action.category)
      if (category) item.category = category
      return edited(state, { items: [...state.items, item] })
    }
    case 'updateItem': {
      const quantity = parseQuantity(action.quantity)
      if (
        !state.items.some((i) => i.id === action.id) ||
        validateItemName(action.name, state.items, action.id) ||
        !quantity.ok
      ) {
        return state
      }
      const category = cleanCategory(action.category)
      const updated: CoffeeItem = {
        id: action.id,
        name: collapseSpaces(action.name),
        quantity: quantity.value,
      }
      if (category) updated.category = category
      return edited(state, {
        items: state.items.map((i) => (i.id === action.id ? updated : i)),
      })
    }
    case 'removeItem': {
      if (!state.items.some((i) => i.id === action.id)) return state
      return edited(state, { items: state.items.filter((i) => i.id !== action.id) })
    }
    case 'setDate': {
      if (action.date === state.coffeeDate) return state
      return edited(state, { coffeeDate: action.date })
    }
    case 'drawSucceeded': {
      const stored = cloneSnapshot(action.snapshot)
      const history = [stored, ...state.history.filter((h) => h.id !== stored.id)].slice(
        0,
        MAX_HISTORY,
      )
      return { ...state, history, result: cloneSnapshot(action.snapshot), invalidated: false }
    }
    case 'showFromHistory': {
      const entry = state.history.find((h) => h.id === action.id)
      if (!entry) return state
      return { ...state, result: cloneSnapshot(entry), invalidated: false }
    }
    case 'clearResult':
      return { ...state, result: null, invalidated: false }
    case 'removeHistory':
      return { ...state, history: state.history.filter((h) => h.id !== action.id) }
    case 'clearHistory':
      return { ...state, history: [] }
    default:
      return state
  }
}

/** Sorteio de referência: o resultado atual, ou o mais recente do histórico. */
export function referenceAssignments(state: AppState): Assignment[] {
  const reference = state.result ?? state.history[0]
  return reference ? reference.assignments : []
}
