import { describe, expect, it } from 'vitest'
import {
  parseQuantity,
  planImport,
  validateItemName,
  validateParticipantName,
} from '../domain/registry'
import { normalizeParticipants } from '../domain/rules'
import { collapseSpaces, normalizeKey } from '../domain/text'
import { item, nextId, person } from './helpers'

describe('normalização de nomes', () => {
  it('colapsa espaços, ignora caixa e acentos', () => {
    expect(collapseSpaces('  José \t  da   Silva ')).toBe('José da Silva')
    expect(normalizeKey('  JOSÉ   da Silva ')).toBe(normalizeKey('jose da silva'))
    expect(normalizeKey('Ação')).toBe(normalizeKey('acao'))
    expect(normalizeKey('Straße')).toBe(normalizeKey('STRASSE'))
  })
})

describe('importação de participantes', () => {
  it('um nome por linha, ignorando vazias e dando trim', () => {
    const plan = planImport([], '  Ana  \n\n   \nBia\r\nCaio\r', nextId)
    expect(plan.added.map((p) => p.name)).toEqual(['Ana', 'Bia', 'Caio'])
    expect(plan.emptyLines).toBe(3)
    expect(plan.duplicates).toEqual([])
  })

  it('ignora duplicados dentro da própria lista (espaços, caixa, acentos)', () => {
    const plan = planImport([], 'José Silva\njose   silva\n JOSÉ SILVA \nMaria', nextId)
    expect(plan.added.map((p) => p.name)).toEqual(['José Silva', 'Maria'])
    expect(plan.duplicates).toHaveLength(2)
  })

  it('ignora quem já está cadastrado', () => {
    const existing = [person('1', { name: 'Ana Lúcia' })]
    const plan = planImport(existing, 'ana lucia\nBruno\nBRUNO', nextId)
    expect(plan.added.map((p) => p.name)).toEqual(['Bruno'])
    expect(plan.duplicates).toEqual(['ana lucia', 'BRUNO'])
  })

  it('preserva a primeira grafia e cria cadastros com ids únicos e regras vazias', () => {
    const plan = planImport([], 'Zé\nzé', nextId)
    expect(plan.added).toHaveLength(1)
    expect(plan.added[0]).toMatchObject({
      name: 'Zé',
      cannotBringItemIds: [],
      cannotBringCategories: [],
      preferredItemIds: [],
    })
  })

  it('conta nomes longdemais e entrada só com espaços', () => {
    const plan = planImport([], `${'x'.repeat(61)}\n   \n`, nextId)
    expect(plan.added).toEqual([])
    expect(plan.tooLong).toBe(1)
    expect(plan.emptyLines).toBeGreaterThanOrEqual(1)
  })
})

describe('cadastro individual', () => {
  it('rejeita nome vazio e duplicado (sem acento/caixa) em participantes', () => {
    const list = [person('1', { name: 'Ana' })]
    expect(validateParticipantName('   ', list)).toMatch(/Informe/)
    expect(validateParticipantName('  ANA ', list)).toMatch(/já está cadastrado/)
    expect(validateParticipantName('Ana', list, '1')).toBeNull()
    expect(validateParticipantName('Bia', list)).toBeNull()
  })

  it('rejeita item duplicado', () => {
    expect(validateItemName('pao', [{ id: '1', name: 'Pão', quantity: 1 }])).toMatch(
      /já está cadastrado/,
    )
  })

  it('quantidade deve ser inteiro >= 1', () => {
    expect(parseQuantity('3')).toEqual({ ok: true, value: 3 })
    expect(parseQuantity(' 2 ')).toEqual({ ok: true, value: 2 })
    for (const bad of ['0', '-1', '1.5', '', 'abc', '1e2', '100']) {
      expect(parseQuantity(bad).ok).toBe(false)
    }
  })
})

describe('coerência de restrições e preferências', () => {
  it('restrição vence preferência (por item e por categoria)', () => {
    const items = [item('x', 1, 'Doces'), item('y', 1)]
    const [normalized] = normalizeParticipants(
      [
        person('a', {
          preferredItemIds: ['x', 'y'],
          cannotBringCategories: ['doces'],
        }),
      ],
      items,
    )
    expect(normalized.preferredItemIds).toEqual(['y'])

    const [byItem] = normalizeParticipants(
      [person('a', { preferredItemIds: ['y'], cannotBringItemIds: ['y'] })],
      items,
    )
    expect(byItem.preferredItemIds).toEqual([])
  })

  it('remove referências a itens inexistentes e duplicatas', () => {
    const [normalized] = normalizeParticipants(
      [
        person('a', {
          cannotBringItemIds: ['x', 'x', 'ghost'],
          preferredItemIds: ['ghost', 'y', 'y'],
          cannotBringCategories: ['Salgados', 'salgádos'],
        }),
      ],
      [item('x'), item('y')],
    )
    expect(normalized.cannotBringItemIds).toEqual(['x'])
    expect(normalized.preferredItemIds).toEqual(['y'])
    expect(normalized.cannotBringCategories).toEqual(['Salgados'])
  })
})
