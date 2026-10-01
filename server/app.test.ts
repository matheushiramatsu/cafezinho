import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyData } from '../src/domain/storage'
import { runDraw } from '../src/domain/draw'
import { createApp } from './app'
import { openDatabase } from './database'

describe('API SQLite', () => {
  let directory: string
  let db: ReturnType<typeof openDatabase>
  let app: ReturnType<typeof createApp>
  let base: string
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cafezinho-test-'))
    db = openDatabase(join(directory, 'test.sqlite'))
    const publicDirectory = join(directory, 'public')
    mkdirSync(publicDirectory)
    writeFileSync(join(publicDirectory, 'index.html'), '<h1>Cafezinho</h1>')
    app = createApp(db, publicDirectory)
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => app.close((error) => error ? reject(error) : resolve()))
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const write = (body: unknown) => fetch(`${base}/api/data`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  it('persiste os dados entre conexões e serve a interface sem expor o banco', async () => {
    expect(await (await fetch(`${base}/api/data`)).json()).toEqual({ revision: 0, data: emptyData() })
    const data = { ...emptyData(), coffeeDate: '2026-10-14' }
    expect((await write({ revision: 0, data })).status).toBe(200)
    const anotherConnection = openDatabase(join(directory, 'test.sqlite'))
    try { expect(anotherConnection.read()).toEqual({ revision: 1, data }) }
    finally { anotherConnection.close() }
    expect(await (await fetch(base)).text()).toContain('Cafezinho')
    expect((await fetch(`${base}/test.sqlite`)).status).toBe(404)
  })

  it('apenas uma de duas gravações simultâneas na mesma versão é aceita', async () => {
    const responses = await Promise.all([
      write({ revision: 0, data: { ...emptyData(), coffeeDate: '2026-10-14' } }),
      write({ revision: 0, data: { ...emptyData(), coffeeDate: '2026-10-15' } }),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect(db.read().revision).toBe(1)
  })

  it('salva regras, resultado e histórico de um sorteio completo e recupera após reabrir o banco', async () => {
    const data = {
      ...emptyData(), coffeeDate: '2026-10-14',
      participants: [{ id: 'ana', name: 'Ana', cannotBringItemIds: [], cannotBringCategories: [], preferredItemIds: ['pao'] }],
      items: [{ id: 'pao', name: 'Pão', quantity: 1, category: 'Comida' }],
    }
    const draw = runDraw({ ...data, previous: [], id: 'draw-1', now: new Date('2026-10-01T12:00:00Z') })
    if (!draw.ok) throw new Error(draw.error.message)
    const complete = { ...data, history: [draw.snapshot], currentResultId: draw.snapshot.id }
    expect((await write({ revision: 0, data: complete })).status).toBe(200)
    expect(await (await fetch(`${base}/api/data`)).json()).toEqual({ revision: 1, data: complete })
    db.close()
    db = openDatabase(join(directory, 'test.sqlite'))
    expect(db.read()).toEqual({ revision: 1, data: complete })
  })

  it('rejeita payloads incompletos, datas inválidas, nomes duplicados e resultados inexistentes', async () => {
    const person = { id: '1', name: 'Ana', cannotBringItemIds: [], cannotBringCategories: [], preferredItemIds: [] }
    for (const body of [
      { revision: 0, data: {} },
      { revision: -1, data: emptyData() },
      { revision: 0, data: { ...emptyData(), coffeeDate: '2026-02-30' } },
      { revision: 0, data: { ...emptyData(), participants: [person, { ...person, id: '2' }] } },
      { revision: 0, data: { ...emptyData(), currentResultId: 'missing' } },
    ]) expect((await write(body)).status).toBe(400)
    expect(db.read().revision).toBe(0)
  })

  it('rejeita JSON quebrado, conteúdo incorreto e gravação de outro site', async () => {
    expect((await fetch(`${base}/api/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400)
    expect((await fetch(`${base}/api/data`, { method: 'PUT', body: '{}' })).status).toBe(415)
    expect((await fetch(`${base}/api/data`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' })).status).toBe(403)
    expect((await fetch(`${base}/api/missing`)).status).toBe(404)
    expect((await fetch(`${base}/..%5Cpackage.json`)).status).toBe(403)
  })

  it('limita o tamanho das gravações sem modificar o banco', async () => {
    const response = await fetch(`${base}/api/data`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify('x'.repeat(10 * 1024 * 1024)),
    })
    expect(response.status).toBe(413)
    expect(db.read().revision).toBe(0)
  })
})
