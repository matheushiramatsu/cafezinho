import { createClient } from '@libsql/client'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dataFunction from '../api/data'
import healthFunction from '../api/health'
import { emptyData } from '../src/domain/storage'
import { createHostedHandler } from './hosted-api'
import { createHostedDatabase, getHostedDatabase, type HostedDatabase } from './hosted-database'

describe('funções da Vercel e adaptador libSQL', () => {
  let client: ReturnType<typeof createClient>
  let db: HostedDatabase
  beforeEach(() => {
    client = createClient({ url: ':memory:' })
    db = createHostedDatabase(client)
  })
  afterEach(() => {
    db.close()
    vi.unstubAllEnvs()
  })
  const request = (body: unknown) => new Request('https://example.test/api/data', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  it('carrega um banco vazio e preserva o conteúdo ao recriar o adaptador', async () => {
    const handler = createHostedHandler('data', () => db)
    expect(await (await handler(new Request('https://example.test/api/data'))).json()).toEqual({ revision: 0, data: emptyData() })
    const data = { ...emptyData(), coffeeDate: '2026-10-14' }
    expect(await (await handler(request({ revision: 0, data }))).json()).toEqual({ revision: 1, data })
    db = createHostedDatabase(client)
    expect(await db.read()).toEqual({ revision: 1, data })
    const health = createHostedHandler('health', () => db)
    expect(await (await health(new Request('https://example.test/api/health'))).json()).toEqual({ ok: true })
  })

  it('duas instâncias do adaptador não sobrescrevem dados na mesma revisão', async () => {
    const other = createHostedDatabase(client)
      await Promise.all([db.read(), other.read()])
      const results = await Promise.all([
        db.save(0, { ...emptyData(), coffeeDate: '2026-10-14' }),
        other.save(0, { ...emptyData(), coffeeDate: '2026-10-15' }),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect((await db.read()).revision).toBe(1)
  })

  it('preserva o SQLite libSQL entre processos independentes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cafezinho-libsql-process-'))
    const url = pathToFileURL(join(directory, 'shared.sqlite')).href
    const setup = `import { createClient } from '@libsql/client';
      import { createHostedDatabase } from './server/hosted-database.ts';
      import { emptyData } from './src/domain/storage.ts';
      import assert from 'node:assert/strict';
      const db = createHostedDatabase(createClient({ url: process.argv[1] }));`
    try {
      // O driver nativo libSQL mantém handles até encerrar o processo no Windows.
      // Processos isolados também reproduzem duas inicializações independentes da função.
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `${setup}
        assert.equal((await db.read()).revision, 0);
        await db.save(0, { ...emptyData(), coffeeDate: '2026-10-14' }); db.close();`, url])
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `${setup}
        const saved = await db.read(); assert.equal(saved.revision, 1);
        assert.equal(saved.data.coffeeDate, '2026-10-14'); db.close();`, url])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('a rota retorna conflito e rejeita dados inválidos', async () => {
    const handler = createHostedHandler('data', () => db)
    expect((await handler(request({ revision: 0, data: emptyData() }))).status).toBe(200)
    expect((await handler(request({ revision: 0, data: emptyData() }))).status).toBe(409)
    expect((await handler(request({ revision: 1, data: {} }))).status).toBe(400)
    expect((await db.read()).revision).toBe(1)
  })

  it('rejeita JSON inválido, payload grande e gravação de outro site', async () => {
    const handler = createHostedHandler('data', () => db)
    expect((await handler(new Request('https://example.test/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status).toBe(400)
    expect((await handler(request('x'.repeat(4 * 1024 * 1024)))).status).toBe(413)
    expect((await handler(new Request('https://example.test/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' }))).status).toBe(403)
  })

  it('sem configuração as duas funções retornam 503 com diagnóstico e não criam banco temporário', async () => {
    vi.stubEnv('TURSO_DATABASE_URL', '')
    vi.stubEnv('TURSO_AUTH_TOKEN', '')
    expect(() => getHostedDatabase()).toThrow('Banco compartilhado não configurado.')
    for (const endpoint of [dataFunction, healthFunction]) {
      const response = await endpoint.fetch(new Request('https://example.test/api/data'))
      expect(response.status).toBe(503)
      expect((await response.json()).code).toBe('database_not_configured')
    }
  })
})
