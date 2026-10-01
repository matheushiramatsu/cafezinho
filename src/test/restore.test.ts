import { describe, expect, it } from 'vitest'
import { runDraw } from '../domain/draw'
import {
  createState,
  reducer,
  referenceAssignments,
  type Action,
  type AppState,
} from '../domain/state'
import { STORAGE_KEY, emptyData, loadData, sanitizeData, saveData } from '../domain/storage'
import type { StoredData } from '../domain/types'
import { seeded } from './helpers'

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state)
}

function baseState(): AppState {
  return apply(
    createState(emptyData()),
    { type: 'addParticipant', id: 'p1', name: 'Ana' },
    { type: 'addParticipant', id: 'p2', name: 'Bia' },
    { type: 'addParticipant', id: 'p3', name: 'Caio' },
    { type: 'addParticipant', id: 'p4', name: 'Dani' },
    { type: 'addItem', id: 'i1', name: 'Pão', quantity: 2, category: 'Salgados' },
    { type: 'addItem', id: 'i2', name: 'Suco', quantity: 1, category: 'Bebidas' },
    { type: 'setDate', date: '2026-10-14' },
  )
}

function draw(state: AppState, id: string, seed = 1): AppState {
  const outcome = runDraw({
    participants: state.participants,
    items: state.items,
    coffeeDate: state.coffeeDate,
    previous: referenceAssignments(state),
    id,
    now: new Date('2026-10-01T12:00:00Z'),
    rng: seeded(seed),
  })
  if (!outcome.ok) throw new Error(outcome.error.message)
  return reducer(state, { type: 'drawSucceeded', snapshot: outcome.snapshot })
}

const key = (a: { participantId: string; itemId: string }) => `${a.participantId}/${a.itemId}`

/** Storage em memória. */
function fakeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage
}

/** Persiste como o app faz e recarrega: o que sai do storage alimenta createState. */
function reload(state: AppState): AppState {
  const storage = fakeStorage()
  const stored: StoredData = {
    participants: state.participants,
    items: state.items,
    coffeeDate: state.coffeeDate,
    history: state.history,
    currentResultId: state.result?.id ?? null,
  }
  expect(saveData(stored, storage)).toEqual({ ok: true })
  return createState(loadData(storage).data)
}

describe('referência ao sortear novamente (regressão: snapshot antigo aberto)', () => {
  function withTwoDraws(): AppState {
    return draw(draw(baseState(), 'h1', 11), 'h2', 22)
  }

  it('abrir snapshot antigo não muda a referência: continua sendo history[0]', () => {
    const state = withTwoDraws()
    expect(state.history.map((h) => h.id)).toEqual(['h2', 'h1'])
    const opened = reducer(state, { type: 'showFromHistory', id: 'h1' })
    expect(opened.result?.id).toBe('h1')
    expect(referenceAssignments(opened)).toEqual(state.history[0].assignments)
    expect(referenceAssignments(opened)).not.toEqual(opened.result!.assignments)
  })

  it('sortear novamente com snapshot antigo aberto evita os pares do último sorteio', () => {
    const state = withTwoDraws()
    const lastPairs = new Set(state.history[0].assignments.map(key))
    for (let seed = 1; seed <= 15; seed += 1) {
      const opened = reducer(state, { type: 'showFromHistory', id: 'h1' })
      const redrawn = draw(opened, `r${seed}`, seed)
      // 4 pessoas e 3 unidades: sempre existe arranjo sem repetir nenhum par.
      expect(redrawn.result!.assignments.filter((a) => lastPairs.has(key(a)))).toEqual([])
      expect(redrawn.history[0].id).toBe(`r${seed}`)
    }
  })

  it('sem resultado atual, a referência também é o último sorteio', () => {
    const cleared = reducer(withTwoDraws(), { type: 'clearResult' })
    expect(referenceAssignments(cleared)).toEqual(cleared.history[0].assignments)
  })

  it('sem histórico, não há referência', () => {
    expect(referenceAssignments(baseState())).toEqual([])
  })
})

describe('restauração do resultado atual após recarregar', () => {
  it('volta quando cadastros e data não mudaram', () => {
    const drawn = draw(baseState(), 'h1')
    const restored = reload(drawn)
    expect(restored.result).toEqual(drawn.result)
    expect(restored.result).not.toBe(restored.history[0])
    expect(restored.invalidated).toBe(false)
  })

  it('restaura o snapshot aberto do histórico, não o mais recente', () => {
    const state = reducer(draw(draw(baseState(), 'h1', 1), 'h2', 2), {
      type: 'showFromHistory',
      id: 'h1',
    })
    expect(reload(state).result?.id).toBe('h1')
  })

  it('Limpar resultado persiste: continua vazio após recarregar, histórico intacto', () => {
    const restored = reload(reducer(draw(baseState(), 'h1'), { type: 'clearResult' }))
    expect(restored.result).toBeNull()
    expect(restored.history).toHaveLength(1)
  })

  it('edição invalida e a invalidação persiste após recarregar', () => {
    const edits: Action[] = [
      { type: 'addParticipant', id: 'n', name: 'Novo' },
      { type: 'renameParticipant', id: 'p1', name: 'Ana Maria' },
      { type: 'addItem', id: 'n', name: 'Bolo', quantity: 1 },
      { type: 'updateItem', id: 'i2', name: 'Suco', quantity: 1, category: 'Frutas' },
      { type: 'togglePreferred', participantId: 'p1', itemId: 'i2' },
      { type: 'toggleRestrictedItem', participantId: 'p1', itemId: 'i2' },
      { type: 'setDate', date: '2026-11-01' },
    ]
    for (const edit of edits) {
      const edited = reducer(draw(baseState(), 'h1'), edit)
      expect(edited.result).toBeNull()
      const restored = reload(edited)
      expect(restored.result).toBeNull()
      expect(restored.history).toHaveLength(1)
    }
  })

  it('não restaura se cadastros ou data divergem do snapshot (dados adulterados)', () => {
    const drawn = draw(baseState(), 'h1')
    const stored: StoredData = {
      participants: drawn.participants,
      items: drawn.items,
      coffeeDate: '2026-12-25',
      history: drawn.history,
      currentResultId: 'h1',
    }
    expect(createState(stored).result).toBeNull()
    const renamed = {
      ...stored,
      coffeeDate: drawn.coffeeDate,
      participants: drawn.participants.map((p, i) => (i === 0 ? { ...p, name: 'Outra' } : p)),
    }
    expect(createState(renamed).result).toBeNull()
    const exact = { ...stored, coffeeDate: drawn.coffeeDate }
    expect(createState(exact).result?.id).toBe('h1')
  })

  it('id sem sorteio no histórico não restaura nada', () => {
    const drawn = draw(baseState(), 'h1')
    const stored: StoredData = {
      participants: drawn.participants,
      items: drawn.items,
      coffeeDate: drawn.coffeeDate,
      history: drawn.history,
      currentResultId: 'inexistente',
    }
    expect(createState(stored).result).toBeNull()
  })

  it('excluir do histórico o sorteio exibido remove o resultado; limpar histórico também', () => {
    const drawn = draw(baseState(), 'h1')
    expect(reducer(drawn, { type: 'removeHistory', id: 'h1' }).result).toBeNull()
    expect(reducer(drawn, { type: 'clearHistory' }).result).toBeNull()
    const two = draw(drawn, 'h2', 2)
    expect(reducer(two, { type: 'removeHistory', id: 'h1' }).result?.id).toBe('h2')
  })
})

describe('sanitização do id do resultado atual', () => {
  it('só vale se existir no histórico; payload antigo sem o campo continua carregando', () => {
    const drawn = draw(baseState(), 'h1')
    const data = {
      participants: drawn.participants,
      items: drawn.items,
      coffeeDate: drawn.coffeeDate,
      history: drawn.history,
    }
    expect(sanitizeData({ ...data, currentResultId: 'h1' }).data.currentResultId).toBe('h1')
    expect(sanitizeData({ ...data, currentResultId: 'fantasma' }).data.currentResultId).toBeNull()
    expect(sanitizeData({ ...data, currentResultId: 42 }).data.currentResultId).toBeNull()

    const storage = fakeStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...data }))
    const loaded = loadData(storage)
    expect(loaded.notice).toBeNull()
    expect(loaded.data.currentResultId).toBeNull()
    expect(loaded.data.history).toHaveLength(1)
  })
})
