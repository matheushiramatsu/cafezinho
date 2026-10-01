import { describe, expect, it } from 'vitest'
import { runDraw } from '../domain/draw'
import { formatDateLong, formatDateShort, isValidDateString, todayLocal } from '../domain/date'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  THEME_KEY,
  loadData,
  loadTheme,
  sanitizeData,
  saveData,
  saveTheme,
} from '../domain/storage'
import { byItem, byPerson, formatShareText } from '../domain/view'
import { item, person, seeded } from './helpers'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  failWith: Error | null = null
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    if (this.failWith) throw this.failWith
    this.map.set(key, value)
  }
}

function sampleData() {
  const participants = [person('a', { name: 'Ana', preferredItemIds: ['x'] }), person('b', { name: 'Bia' })]
  const items = [item('x', 1, 'Doces'), item('y', 2)]
  const outcome = runDraw({
    participants,
    items,
    coffeeDate: '2026-10-14',
    id: 'h1',
    now: new Date('2026-10-01T15:00:00Z'),
    rng: seeded(1),
  })
  if (!outcome.ok) throw new Error('falha')
  return {
    participants,
    items,
    coffeeDate: '2026-10-14',
    history: [outcome.snapshot],
    currentResultId: 'h1' as string | null,
  }
}

describe('persistência', () => {
  it('faz round-trip de participantes, itens, data e histórico', () => {
    const storage = new MemoryStorage()
    const data = sampleData()
    expect(saveData(data, storage)).toEqual({ ok: true })
    const loaded = loadData(storage)
    expect(loaded.notice).toBeNull()
    expect(loaded.data).toEqual(data)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(1)
  })

  it('JSON corrompido: começa vazio, avisa e guarda backup do original', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, '{"version":1, quebrado')
    const loaded = loadData(storage)
    expect(loaded.data.participants).toEqual([])
    expect(loaded.notice).toMatch(/ilegíveis/)
    expect(storage.getItem(BACKUP_KEY)).toBe('{"version":1, quebrado')
  })

  it('formato inesperado (array/null/versão futura) é ignorado com aviso', () => {
    for (const payload of ['[]', 'null', '"texto"', '42', '{"version":99,"participants":[]}']) {
      const storage = new MemoryStorage()
      storage.setItem(STORAGE_KEY, payload)
      const loaded = loadData(storage)
      expect(loaded.data.participants).toEqual([])
      expect(loaded.notice).not.toBeNull()
    }
  })

  it('sanitiza registros inválidos, referências quebradas e conflitos', () => {
    const { data, dropped } = sanitizeData({
      version: 1,
      participants: [
        { id: 'a', name: '  Ana  ', preferredItemIds: ['x', 'ghost'], cannotBringItemIds: ['y', 'ghost'] },
        { id: 'a', name: 'Repetido id' },
        { id: 'b', name: 'ana' },
        { id: 'c', name: '' },
        { id: 7, name: 'Número' },
        'lixo',
        { id: 'd', name: 'Dani', preferredItemIds: ['y'], cannotBringItemIds: ['y'] },
      ],
      items: [
        { id: 'x', name: 'Pão', quantity: 2, category: '  Salgados ' },
        { id: 'y', name: 'Suco', quantity: 1 },
        { id: 'z', name: 'Zero', quantity: 0 },
        { id: 'w', name: 'Fracionado', quantity: 1.5 },
        { id: 'v', name: 'Texto', quantity: '2' },
        { id: 'x', name: 'Id repetido', quantity: 1 },
        null,
      ],
      coffeeDate: '2026-13-45',
      history: [{ id: 'quebrado' }, 5],
    })
    expect(data.participants.map((p) => p.name)).toEqual(['Ana', 'Dani'])
    expect(data.participants[0].preferredItemIds).toEqual(['x'])
    expect(data.participants[0].cannotBringItemIds).toEqual(['y'])
    expect(data.participants[1].preferredItemIds).toEqual([]) // restrição vence
    expect(data.items.map((i) => i.name)).toEqual(['Pão', 'Suco'])
    expect(data.items[0].category).toBe('Salgados')
    expect(data.coffeeDate).toBe('')
    expect(data.history).toEqual([])
    expect(dropped).toBeGreaterThan(0)
  })

  it('descarta snapshot com atribuição fora dos cadastros do próprio snapshot', () => {
    const data = sampleData()
    const bad = JSON.parse(JSON.stringify(data.history[0]))
    bad.assignments.push({ participantId: 'fantasma', itemId: 'x' })
    const { data: sanitized } = sanitizeData({ ...data, history: [bad, data.history[0]] })
    expect(sanitized.history).toHaveLength(1)
    expect(sanitized.history[0].id).toBe('h1')
  })

  it('quota excedida: devolve erro sem lançar exceção', () => {
    const storage = new MemoryStorage()
    storage.failWith = new DOMException('cheio', 'QuotaExceededError')
    expect(saveData(sampleData(), storage)).toEqual({ ok: false, reason: 'quota' })
    storage.failWith = new Error('bloqueado')
    expect(saveData(sampleData(), storage)).toEqual({ ok: false, reason: 'unavailable' })
    expect(saveData(sampleData(), null)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('sem storage disponível: carrega vazio sem erro', () => {
    expect(loadData(null).data.participants).toEqual([])
  })

  it('tema: persiste claro/escuro e limpa ao voltar para o sistema', () => {
    const storage = new MemoryStorage()
    expect(loadTheme(storage)).toBe('system')
    saveTheme('dark', storage)
    expect(storage.getItem(THEME_KEY)).toBe('dark')
    expect(loadTheme(storage)).toBe('dark')
    saveTheme('system', storage)
    expect(storage.getItem(THEME_KEY)).toBeNull()
    storage.setItem(THEME_KEY, 'azul')
    expect(loadTheme(storage)).toBe('system')
  })
})

describe('datas locais', () => {
  it('valida datas de calendário', () => {
    expect(isValidDateString('2026-10-14')).toBe(true)
    expect(isValidDateString('2024-02-29')).toBe(true)
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2026-1-4')).toBe(false)
    expect(isValidDateString('')).toBe(false)
  })

  it('formata sem deslocar o dia (sem UTC)', () => {
    expect(formatDateShort('2026-10-14')).toBe('14/10/2026')
    expect(formatDateLong('2026-10-14')).toContain('14 de outubro de 2026')
    expect(formatDateLong('2026-01-01')).toContain('1 de janeiro')
  })

  it('todayLocal usa componentes locais', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('visões e texto de compartilhamento', () => {
  it('gera visões por pessoa e por item coerentes', () => {
    const { history } = sampleData()
    const snapshot = history[0]
    const people = byPerson(snapshot)
    const items = byItem(snapshot)
    expect(people.flatMap((p) => p.itemNames)).toHaveLength(snapshot.assignments.length)
    expect(items.find((i) => i.name === 'Y')?.participantNames).toHaveLength(2)
  })

  it('texto copiável traz data, pessoas e itens', () => {
    const text = formatShareText(sampleData().history[0])
    expect(text).toContain('*Café da Firma — ')
    expect(text).toContain('14 de outubro de 2026')
    expect(text).toContain('*Por pessoa*')
    expect(text).toContain('*Por item*')
    expect(text).toMatch(/• Ana: /)
    expect(text).toMatch(/• Y \(2\): /)
  })
})
