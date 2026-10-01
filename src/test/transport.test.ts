import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpTransport, SharedServiceError, SharedStore } from '../domain/shared'
import { emptyData } from '../domain/storage'

afterEach(() => { vi.unstubAllGlobals() })

describe('diagnóstico da conexão', () => {
  it('API ausente ou hospedagem estática produz um diagnóstico específico', async () => {
    for (const response of [new Response('NOT_FOUND', { status: 404 }), new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } })]) {
      vi.stubGlobal('fetch', async () => response)
      const store = new SharedStore()
      await store.refresh()
      expect(store.getSnapshot().ready).toBe(false)
      expect(store.getSnapshot().problem).toContain('não está disponível neste endereço')
      expect(store.hasUnsavedChanges()).toBe(false)
    }
  })

  it('identifica a falta do banco e recupera quando ele passa a estar configurado', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ code: 'database_not_configured' }, { status: 503 }))
    const store = new SharedStore()
    await store.refresh()
    expect(store.getSnapshot().problem).toContain('ainda não foi configurado')
    vi.stubGlobal('fetch', async () => Response.json({ revision: 0, data: emptyData() }))
    await store.retry()
    expect(store.getSnapshot().status).toBe('saved')
    expect(store.getSnapshot().problem).toBeNull()
  })

  it('uma resposta JSON inesperada não é tratada como dados válidos', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ revision: 0, data: {} }))
    await expect(httpTransport.read()).rejects.toBeInstanceOf(SharedServiceError)
  })
})
