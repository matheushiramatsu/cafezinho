import { describe, expect, it } from 'vitest'
import { runDraw } from '../domain/draw'
import { reducer, createState, referenceAssignments, type Action, type AppState } from '../domain/state'
import { emptyData } from '../domain/storage'
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

describe('cadastros', () => {
  it('rejeita duplicados e valida quantidade no reducer', () => {
    const state = baseState()
    const next = apply(
      state,
      { type: 'addParticipant', id: 'x', name: '  ANA ' },
      { type: 'addItem', id: 'y', name: 'pao', quantity: 1 },
      { type: 'addItem', id: 'z', name: 'Bolo', quantity: 0 },
    )
    expect(next.participants).toHaveLength(3)
    expect(next.items).toHaveLength(2)
  })

  it('excluir item limpa referências nas regras dos participantes', () => {
    const state = apply(
      baseState(),
      { type: 'togglePreferred', participantId: 'p1', itemId: 'i1' },
      { type: 'toggleRestrictedItem', participantId: 'p2', itemId: 'i1' },
      { type: 'removeItem', id: 'i1' },
    )
    expect(state.participants[0].preferredItemIds).toEqual([])
    expect(state.participants[1].cannotBringItemIds).toEqual([])
  })

  it('restrição vence preferência: adicionar restrição remove preferência e bloqueia nova', () => {
    let state = apply(baseState(), { type: 'togglePreferred', participantId: 'p1', itemId: 'i1' })
    expect(state.participants[0].preferredItemIds).toEqual(['i1'])
    state = apply(state, { type: 'toggleRestrictedItem', participantId: 'p1', itemId: 'i1' })
    expect(state.participants[0].preferredItemIds).toEqual([])
    state = apply(state, { type: 'togglePreferred', participantId: 'p1', itemId: 'i1' })
    expect(state.participants[0].preferredItemIds).toEqual([])

    // por categoria
    state = apply(
      baseState(),
      { type: 'togglePreferred', participantId: 'p2', itemId: 'i2' },
      { type: 'toggleRestrictedCategory', participantId: 'p2', category: 'bebidas' },
    )
    expect(state.participants[1].preferredItemIds).toEqual([])
  })
})

describe('invalidação do resultado atual', () => {
  const edits: Array<[string, Action]> = [
    ['adicionar participante', { type: 'addParticipant', id: 'n', name: 'Novo' }],
    ['renomear participante', { type: 'renameParticipant', id: 'p1', name: 'Ana Maria' }],
    ['remover participante', { type: 'removeParticipant', id: 'p3' }],
    ['adicionar item', { type: 'addItem', id: 'n', name: 'Bolo', quantity: 1 }],
    ['editar item', { type: 'updateItem', id: 'i2', name: 'Suco', quantity: 1, category: 'Frutas' }],
    ['remover item', { type: 'removeItem', id: 'i2' }],
    ['alterar preferência', { type: 'togglePreferred', participantId: 'p1', itemId: 'i2' }],
    ['alterar restrição de item', { type: 'toggleRestrictedItem', participantId: 'p1', itemId: 'i2' }],
    ['alterar restrição de categoria', { type: 'toggleRestrictedCategory', participantId: 'p1', category: 'Bebidas' }],
    ['alterar data', { type: 'setDate', date: '2026-10-21' }],
  ]

  it.each(edits)('%s invalida o resultado, mas preserva o histórico', (_label, action) => {
    const drawn = draw(baseState(), 'h1')
    expect(drawn.result).not.toBeNull()
    const next = reducer(drawn, action)
    expect(next.result).toBeNull()
    expect(next.invalidated).toBe(true)
    expect(next.history).toHaveLength(1)
    expect(next.history[0]).toEqual(drawn.history[0])
  })

  it('definir a mesma data não invalida', () => {
    const drawn = draw(baseState(), 'h1')
    expect(reducer(drawn, { type: 'setDate', date: '2026-10-14' }).result).not.toBeNull()
  })

  it('limpar resultado preserva cadastros e histórico', () => {
    const drawn = draw(baseState(), 'h1')
    const cleared = reducer(drawn, { type: 'clearResult' })
    expect(cleared.result).toBeNull()
    expect(cleared.invalidated).toBe(false)
    expect(cleared.participants).toEqual(drawn.participants)
    expect(cleared.items).toEqual(drawn.items)
    expect(cleared.coffeeDate).toBe(drawn.coffeeDate)
    expect(cleared.history).toEqual(drawn.history)
  })

  it('novo sorteio limpa o aviso de invalidação', () => {
    const drawn = draw(baseState(), 'h1')
    const edited = reducer(drawn, { type: 'addParticipant', id: 'n', name: 'Novo' })
    expect(edited.invalidated).toBe(true)
    expect(draw(edited, 'h2').invalidated).toBe(false)
  })
})

describe('snapshots do histórico', () => {
  it('são independentes: editar cadastros nunca muda o snapshot salvo', () => {
    const drawn = draw(baseState(), 'h1')
    const before = JSON.parse(JSON.stringify(drawn.history[0]))
    const edited = apply(
      drawn,
      { type: 'renameParticipant', id: 'p1', name: 'Ana Maria' },
      { type: 'updateItem', id: 'i1', name: 'Pão francês', quantity: 3, category: 'Padaria' },
      { type: 'toggleRestrictedItem', participantId: 'p2', itemId: 'i2' },
      { type: 'togglePreferred', participantId: 'p3', itemId: 'i1' },
      { type: 'removeParticipant', id: 'p3' },
      { type: 'removeItem', id: 'i2' },
      { type: 'setDate', date: '2027-01-01' },
    )
    expect(edited.history[0]).toEqual(before)
    expect(edited.history[0].participants.map((p) => p.name)).toEqual(['Ana', 'Bia', 'Caio'])
    expect(edited.history[0].coffeeDate).toBe('2026-10-14')
  })

  it('não compartilham referências com o estado nem com o resultado atual', () => {
    const drawn = draw(baseState(), 'h1')
    const [entry] = drawn.history
    expect(entry).not.toBe(drawn.result)
    expect(entry.participants).not.toBe(drawn.participants)
    expect(entry.participants[0]).not.toBe(drawn.participants[0])
    expect(entry.participants[0].preferredItemIds).not.toBe(drawn.participants[0].preferredItemIds)
    expect(entry.items[0]).not.toBe(drawn.items[0])
    expect(entry.assignments).not.toBe(drawn.result?.assignments)
    expect(entry.assignments[0]).not.toBe(drawn.result?.assignments[0])
  })

  it('mutar o resultado atual não altera o histórico', () => {
    const drawn = draw(baseState(), 'h1')
    drawn.result!.assignments.pop()
    drawn.result!.participants[0].name = 'MUTADO'
    expect(drawn.history[0].assignments.length).toBeGreaterThan(0)
    expect(drawn.history[0].participants[0].name).toBe('Ana')
  })

  it('ver do histórico entrega cópia; mutá-la não afeta o histórico', () => {
    const drawn = draw(baseState(), 'h1')
    const shown = reducer(drawn, { type: 'showFromHistory', id: 'h1' })
    shown.result!.items[0].name = 'MUTADO'
    expect(shown.history[0].items[0].name).toBe('Pão')
  })

  it('cada sorteio entra no histórico, preservando os anteriores, mais recente primeiro', () => {
    let state = draw(baseState(), 'h1', 1)
    state = draw(state, 'h2', 2)
    expect(state.history.map((h) => h.id)).toEqual(['h2', 'h1'])
  })

  it.each(['removeHistory', 'clearHistory'])('ignora a antiga ação de exclusão %s', (type) => {
    const state = draw(draw(baseState(), 'h1'), 'h2', 2)
    const legacyAction = { type, id: 'h2' } as unknown as Action
    expect(reducer(state, legacyAction)).toBe(state)
  })

  it('sorteio impossível não altera resultado nem histórico', () => {
    const state = draw(baseState(), 'h1')
    const impossible = apply(state, { type: 'addItem', id: 'big', name: 'Muito', quantity: 9 })
    const outcome = runDraw({
      participants: impossible.participants,
      items: impossible.items,
      coffeeDate: impossible.coffeeDate,
      id: 'h2',
      now: new Date(),
    })
    expect(outcome.ok).toBe(false)
    expect(impossible.history).toHaveLength(1)
  })
})

describe('referência para sortear novamente', () => {
  it('usa o resultado atual; sem ele, o histórico mais recente', () => {
    const empty = baseState()
    expect(referenceAssignments(empty)).toEqual([])
    const drawn = draw(empty, 'h1')
    expect(referenceAssignments(drawn)).toEqual(drawn.result!.assignments)
    const edited = reducer(drawn, { type: 'setDate', date: '2026-11-01' })
    expect(edited.result).toBeNull()
    expect(referenceAssignments(edited)).toEqual(drawn.history[0].assignments)
  })

  it('sortear de novo evita repetir pares quando possível', () => {
    // Com 4 pessoas e 3 unidades, sempre existe um arranjo sem pares repetidos.
    let state = draw(reducer(baseState(), { type: 'addParticipant', id: 'p4', name: 'Dani' }), 'h1', 5)
    const first = state.result!.assignments
    state = draw(state, 'h2', 6)
    const second = state.result!.assignments
    const key = (a: { participantId: string; itemId: string }) => `${a.participantId}/${a.itemId}`
    const repeats = second.filter((a) => first.some((b) => key(a) === key(b))).length
    expect(repeats).toBe(0)
  })
})

describe('data', () => {
  it('é obrigatória e validada', () => {
    const state = baseState()
    const base = {
      participants: state.participants,
      items: state.items,
      id: 'x',
      now: new Date(),
    }
    expect(runDraw({ ...base, coffeeDate: '' }).ok).toBe(false)
    expect(runDraw({ ...base, coffeeDate: '2026-02-30' }).ok).toBe(false)
    expect(runDraw({ ...base, coffeeDate: '14/10/2026' }).ok).toBe(false)
    expect(runDraw({ ...base, coffeeDate: '2026-10-14' }).ok).toBe(true)
  })
})
