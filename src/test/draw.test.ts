import { describe, expect, it } from 'vitest'
import { assignItems, computeStats, validateAssignments } from '../domain/draw'
import type { Assignment, Participant } from '../domain/types'
import { item, person, seeded } from './helpers'

function loads(participants: Participant[], assignments: Assignment[]): number[] {
  return participants.map((p) => assignments.filter((a) => a.participantId === p.id).length)
}

function ok(outcome: ReturnType<typeof assignItems>) {
  if (!outcome.ok) throw new Error(`esperava sucesso: ${outcome.error.message}`)
  return outcome
}

describe('restrições', () => {
  it('respeita restrição por item', () => {
    const participants = [person('a', { cannotBringItemIds: ['pao'] }), person('b'), person('c')]
    const items = [item('pao', 2)]
    for (let seed = 1; seed <= 30; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      expect(assignments.some((a) => a.participantId === 'a')).toBe(false)
      expect(assignments).toHaveLength(2)
    }
  })

  it('respeita restrição por categoria, ignorando caixa e acento', () => {
    const participants = [
      person('a', { cannotBringCategories: ['BEBÍDAS'] }),
      person('b'),
      person('c'),
    ]
    const items = [item('suco', 2, 'bebidas'), item('bolo', 1, 'doces')]
    for (let seed = 1; seed <= 30; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      expect(assignments.find((a) => a.participantId === 'a' && a.itemId === 'suco')).toBeUndefined()
      expect(validateAssignments(participants, items, assignments)).toBeNull()
    }
  })
})

describe('quantidade e unicidade', () => {
  it('quantity 3 vai para 3 pessoas distintas', () => {
    const participants = ['a', 'b', 'c', 'd', 'e'].map((id) => person(id))
    const items = [item('cafe', 3)]
    for (let seed = 1; seed <= 30; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      const people = assignments.filter((a) => a.itemId === 'cafe').map((a) => a.participantId)
      expect(people).toHaveLength(3)
      expect(new Set(people).size).toBe(3)
    }
  })

  it('nunca repete o mesmo item para a mesma pessoa', () => {
    const participants = ['a', 'b', 'c'].map((id) => person(id))
    const items = [item('x', 3), item('y', 3), item('z', 2)]
    const { assignments } = ok(assignItems({ participants, items, rng: seeded(7) }))
    const keys = assignments.map((a) => `${a.participantId}/${a.itemId}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(assignments).toHaveLength(8)
  })
})

describe('casos impossíveis', () => {
  it('item com quantity maior que o total de participantes', () => {
    const outcome = assignItems({
      participants: [person('a'), person('b')],
      items: [item('x', 3)],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.code).toBe('impossible')
    expect(outcome.error.message).toContain('"X" precisa de 3 pessoas diferentes')
    expect(outcome.error.message).toContain('só podem levar 2')
  })

  it('item com quantity maior que os elegíveis após restrições', () => {
    const outcome = assignItems({
      participants: [
        person('a', { cannotBringItemIds: ['x'] }),
        person('b', { cannotBringCategories: ['salgados'] }),
        person('c'),
      ],
      items: [item('x', 2, 'salgados')],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.message).toContain('só pode levar 1 (C)')
    expect(outcome.error.message).toContain('A (restrição ao item)')
    expect(outcome.error.message).toContain('B (restrição à categoria "salgados")')
  })

  it('ninguém elegível', () => {
    const outcome = assignItems({
      participants: [person('a', { cannotBringItemIds: ['x'] })],
      items: [item('x', 1)],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.message).toContain('ninguém pode levar')
  })

  it('combinado: vários itens, um grupo compartilhando o mesmo pool', () => {
    const participants = [
      person('a'),
      person('b'),
      person('c', { cannotBringCategories: ['bebidas'] }),
      person('d', { cannotBringCategories: ['bebidas'] }),
    ]
    const items = [item('suco', 3, 'bebidas'), item('agua', 3, 'bebidas'), item('pao', 5)]
    const outcome = assignItems({ participants, items })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.message).toContain('3 itens não têm pessoas elegíveis suficientes')
    const text = outcome.error.details.join('\n')
    expect(text).toContain('Só podem levar A e B')
    expect(text).toContain('"SUCO" (3 pessoas)')
    expect(text).toContain('"AGUA" (3 pessoas)')
    expect(text).toContain('"PAO" precisa de 5 pessoas diferentes')
  })

  it('combinado: itens com pools distintos aparecem todos no diagnóstico', () => {
    const participants = [person('a', { cannotBringItemIds: ['x'] }), person('b')]
    const items = [item('x', 2), item('y', 3)]
    const outcome = assignItems({ participants, items })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    const text = [outcome.error.message, ...outcome.error.details].join('\n')
    expect(text).toContain('"X"')
    expect(text).toContain('"Y"')
  })

  it('não publica resultado parcial: erro não traz atribuições', () => {
    const outcome = assignItems({ participants: [person('a')], items: [item('x', 2)] })
    expect(outcome).not.toHaveProperty('assignments')
  })

  it('exige participantes e itens', () => {
    expect(assignItems({ participants: [], items: [item('x')] }).ok).toBe(false)
    expect(assignItems({ participants: [person('a')], items: [] }).ok).toBe(false)
  })

  it('rejeita quantity inválida', () => {
    const outcome = assignItems({
      participants: [person('a')],
      items: [{ id: 'x', name: 'X', quantity: 0 }],
    })
    expect(outcome.ok).toBe(false)
  })
})

describe('equilíbrio global', () => {
  it('cargas diferem no máximo em 1 quando todos podem tudo', () => {
    const participants = ['a', 'b', 'c', 'd'].map((id) => person(id))
    const items = [item('x', 3), item('y', 2), item('z', 2)]
    for (let seed = 1; seed <= 40; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      const l = loads(participants, assignments)
      expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(1)
    }
  })

  it('compensa restrições: quem tem menos opções não é sobrecarregado', () => {
    // a só pode levar x; b e c cobrem os outros 5 itens (carga ótima 1, 3, 2 ou 1, 2, 3).
    const participants = [
      person('a', { cannotBringItemIds: ['y', 'z'] }),
      person('b'),
      person('c'),
    ]
    const items = [item('x', 2), item('y', 2), item('z', 2)]
    for (let seed = 1; seed <= 20; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      const l = loads(participants, assignments)
      expect(l[0]).toBe(1)
      expect(Math.abs(l[1] - l[2])).toBe(1)
    }
  })

  it('equilíbrio vence preferência', () => {
    // a prefere x e y, mas levar os dois deixaria b sem nada.
    const participants = [person('a', { preferredItemIds: ['x', 'y'] }), person('b')]
    const items = [item('x', 1), item('y', 1)]
    for (let seed = 1; seed <= 20; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      expect(loads(participants, assignments)).toEqual([1, 1])
    }
  })

  it('lista média fica balanceada e fecha o total', () => {
    const participants = Array.from({ length: 12 }, (_, i) => person(`p${i}`))
    const items = Array.from({ length: 8 }, (_, i) => item(`i${i}`, 1 + (i % 4)))
    const total = items.reduce((s, i) => s + i.quantity, 0)
    const { assignments } = ok(assignItems({ participants, items, rng: seeded(3) }))
    expect(assignments).toHaveLength(total)
    const l = loads(participants, assignments)
    expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(1)
  })
})

describe('preferências', () => {
  it('atende todas as preferências compatíveis com o equilíbrio', () => {
    const participants = [
      person('a', { preferredItemIds: ['x'] }),
      person('b', { preferredItemIds: ['y'] }),
      person('c', { preferredItemIds: ['z'] }),
    ]
    const items = [item('x'), item('y'), item('z')]
    for (let seed = 1; seed <= 30; seed += 1) {
      const outcome = ok(assignItems({ participants, items, rng: seeded(seed) }))
      expect(outcome.stats.preferenceHits).toBe(3)
    }
  })

  it('maximiza preferências globalmente, não por ordem de chegada', () => {
    // Guloso daria x para a (primeira da fila) e deixaria b sem sua única preferência.
    const participants = [
      person('a', { preferredItemIds: ['x', 'y'] }),
      person('b', { preferredItemIds: ['x'] }),
    ]
    const items = [item('x'), item('y')]
    for (let seed = 1; seed <= 30; seed += 1) {
      const outcome = ok(assignItems({ participants, items, rng: seeded(seed) }))
      expect(outcome.stats.preferenceHits).toBe(2)
      expect(outcome.assignments).toContainEqual({ participantId: 'b', itemId: 'x' })
    }
  })

  it('restrição vence preferência', () => {
    const participants = [
      person('a', { preferredItemIds: ['x'], cannotBringItemIds: ['x'] }),
      person('b'),
    ]
    const items = [item('x')]
    const { assignments } = ok(assignItems({ participants, items, rng: seeded(1) }))
    expect(assignments).toEqual([{ participantId: 'b', itemId: 'x' }])
  })
})

describe('repetição do sorteio anterior', () => {
  it('evita repetir pares quando há alternativa equivalente', () => {
    const participants = ['a', 'b', 'c'].map((id) => person(id))
    const items = [item('x'), item('y'), item('z')]
    const previous: Assignment[] = [
      { participantId: 'a', itemId: 'x' },
      { participantId: 'b', itemId: 'y' },
      { participantId: 'c', itemId: 'z' },
    ]
    for (let seed = 1; seed <= 40; seed += 1) {
      const outcome = ok(assignItems({ participants, items, previous, rng: seeded(seed) }))
      expect(outcome.stats.repeats).toBe(0)
    }
  })

  it('preferência vence repetição', () => {
    const participants = [person('a', { preferredItemIds: ['x'] }), person('b')]
    const items = [item('x'), item('y')]
    const previous: Assignment[] = [{ participantId: 'a', itemId: 'x' }]
    for (let seed = 1; seed <= 20; seed += 1) {
      const outcome = ok(assignItems({ participants, items, previous, rng: seeded(seed) }))
      expect(outcome.assignments).toContainEqual({ participantId: 'a', itemId: 'x' })
      expect(outcome.stats.repeats).toBe(1)
    }
  })

  it('equilíbrio vence repetição', () => {
    // a não pode levar y; para manter 1 item cada, repetir os pares anteriores é inevitável.
    const participants = [person('a', { cannotBringItemIds: ['y'] }), person('b')]
    const items = [item('x'), item('y')]
    const previous: Assignment[] = [
      { participantId: 'a', itemId: 'x' },
      { participantId: 'b', itemId: 'y' },
    ]
    const outcome = ok(assignItems({ participants, items, previous, rng: seeded(2) }))
    expect(outcome.stats.repeats).toBe(2)
    expect(loads(participants, outcome.assignments)).toEqual([1, 1])
  })

  it('aleatoriedade desempata: sementes diferentes geram resultados diferentes', () => {
    const participants = ['a', 'b', 'c', 'd'].map((id) => person(id))
    const items = [item('x'), item('y'), item('z'), item('w')]
    const results = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const { assignments } = ok(assignItems({ participants, items, rng: seeded(seed) }))
      results.add(assignments.map((a) => `${a.participantId}${a.itemId}`).join())
    }
    expect(results.size).toBeGreaterThan(5)
  })
})

describe('desempenho', () => {
  it('lista razoável (60 pessoas, 25 itens) resolve rápido e validamente', () => {
    const participants = Array.from({ length: 60 }, (_, i) =>
      person(`p${i}`, {
        cannotBringCategories: i % 7 === 0 ? ['c1'] : [],
        preferredItemIds: [`i${i % 25}`],
      }),
    )
    const items = Array.from({ length: 25 }, (_, i) => item(`i${i}`, 1 + (i % 5), `c${i % 3}`))
    const total = items.reduce((s, i) => s + i.quantity, 0)
    const start = performance.now()
    const outcome = ok(assignItems({ participants, items, rng: seeded(9) }))
    const elapsed = performance.now() - start
    expect(validateAssignments(participants, items, outcome.assignments)).toBeNull()
    expect(computeStats(participants, items, outcome.assignments).totalAssignments).toBe(total)
    expect(elapsed).toBeLessThan(3000)
  })
})
