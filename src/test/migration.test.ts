import { describe, expect, it } from 'vitest'
import { runDraw } from '../domain/draw'
import {
  LEGACY_STORAGE_KEY,
  LEGACY_THEME_KEY,
  STORAGE_KEY,
  THEME_KEY,
  loadData,
  loadTheme,
  saveData,
  saveTheme,
} from '../domain/storage'
import { item, person, seeded } from './helpers'

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage
  return { storage, store }
}

function sampleData() {
  const participants = [person('a', { name: 'Ana' }), person('b', { name: 'Bia' })]
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

describe('migração das chaves do renome para Cafezinho', () => {
  it('usa o prefixo cafezinho: nas chaves novas', () => {
    expect(STORAGE_KEY).toBe('cafezinho:v1')
    expect(THEME_KEY).toBe('cafezinho:theme')
  })

  it('dados salvos na chave antiga continuam carregando', () => {
    const data = sampleData()
    const { storage } = fakeStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, ...data }),
    })
    const loaded = loadData(storage)
    expect(loaded.notice).toBeNull()
    expect(loaded.data).toEqual(data)
  })

  it('o primeiro salvamento migra: grava a chave nova e remove a antiga', () => {
    const data = sampleData()
    const { storage, store } = fakeStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, ...data }),
    })
    expect(saveData(loadData(storage).data, storage)).toEqual({ ok: true })
    expect(store.has(STORAGE_KEY)).toBe(true)
    expect(store.has(LEGACY_STORAGE_KEY)).toBe(false)
    expect(loadData(storage).data).toEqual(data)
  })

  it('se a gravação falhar, a chave antiga permanece intacta', () => {
    const data = sampleData()
    const legacy = JSON.stringify({ version: 1, ...data })
    const { storage, store } = fakeStorage({ [LEGACY_STORAGE_KEY]: legacy })
    storage.setItem = () => {
      throw new DOMException('cheio', 'QuotaExceededError')
    }
    expect(saveData(data, storage)).toEqual({ ok: false, reason: 'quota' })
    expect(store.get(LEGACY_STORAGE_KEY)).toBe(legacy)
  })

  it('a chave nova tem precedência sobre a antiga', () => {
    const data = sampleData()
    const { storage } = fakeStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, ...data, coffeeDate: '2020-01-01' }),
      [STORAGE_KEY]: JSON.stringify({ version: 1, ...data }),
    })
    expect(loadData(storage).data.coffeeDate).toBe('2026-10-14')
  })

  it('tema antigo é lido e migrado; voltar para Sistema não ressuscita o tema antigo', () => {
    const { storage, store } = fakeStorage({ [LEGACY_THEME_KEY]: 'dark' })
    expect(loadTheme(storage)).toBe('dark')
    saveTheme('light', storage)
    expect(store.get(THEME_KEY)).toBe('light')
    expect(store.has(LEGACY_THEME_KEY)).toBe(false)

    const legacyOnly = fakeStorage({ [LEGACY_THEME_KEY]: 'dark' })
    saveTheme('system', legacyOnly.storage)
    expect(loadTheme(legacyOnly.storage)).toBe('system')
  })
})
