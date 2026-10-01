import { describe, expect, it } from 'vitest'
import { ConflictError, SharedStore, type SharedDocument, type SharedTransport } from '../domain/shared'
import { emptyData } from '../domain/storage'

function fakeServer() {
  let document: SharedDocument = { revision: 0, data: emptyData() }
  const transport: SharedTransport = {
    read: async () => structuredClone(document),
    write: async (input) => {
      if (input.revision !== document.revision) throw new ConflictError()
      document = { revision: document.revision + 1, data: structuredClone(input.data) }
      return structuredClone(document)
    },
  }
  return { transport, read: () => document }
}

async function settled(store: SharedStore) {
  await expect.poll(() => store.getSnapshot().status).not.toBe('saving')
}

describe('dados compartilhados', () => {
  it('duas pessoas leem os mesmos cadastros e recebem atualizações', async () => {
    const server = fakeServer()
    const alice = new SharedStore(server.transport)
    const bob = new SharedStore(server.transport)
    await Promise.all([alice.refresh(), bob.refresh()])
    alice.dispatch({ type: 'addParticipant', id: 'alice', name: 'Alice' })
    await settled(alice)
    await bob.refresh()
    expect(bob.getSnapshot().state.participants[0].name).toBe('Alice')
    expect(server.read().revision).toBe(1)
  })

  it('preserva o rascunho e bloqueia sobrescrita quando duas pessoas editam a mesma versão', async () => {
    const server = fakeServer()
    const alice = new SharedStore(server.transport)
    const bob = new SharedStore(server.transport)
    await Promise.all([alice.refresh(), bob.refresh()])
    alice.dispatch({ type: 'addParticipant', id: 'alice', name: 'Alice' })
    await settled(alice)
    bob.dispatch({ type: 'addParticipant', id: 'bob', name: 'Bob' })
    await settled(bob)
    expect(bob.getSnapshot().status).toBe('conflict')
    expect(bob.getSnapshot().state.participants[0].name).toBe('Bob')
    expect(server.read().data.participants[0].name).toBe('Alice')
    await bob.reloadShared()
    expect(bob.getSnapshot().state.participants[0].name).toBe('Alice')
    expect(bob.hasUnsavedChanges()).toBe(false)
  })

  it('serializa edições rápidas sem perder alterações feitas durante o salvamento', async () => {
    const server = fakeServer()
    const store = new SharedStore(server.transport)
    await store.refresh()
    store.dispatch({ type: 'addParticipant', id: '1', name: 'Ana' })
    store.dispatch({ type: 'addParticipant', id: '2', name: 'Bia' })
    store.dispatch({ type: 'setDate', date: '2026-10-14' })
    await settled(store)
    expect(server.read().data.participants).toHaveLength(2)
    expect(server.read().data.coffeeDate).toBe('2026-10-14')
    expect(store.hasUnsavedChanges()).toBe(false)
  })

  it('falha na carga inicial não grava um estado vazio no servidor', async () => {
    let writes = 0
    const store = new SharedStore({
      read: async () => { throw new Error('offline') },
      write: async (document) => { writes++; return document },
    })
    await store.refresh()
    store.dispatch({ type: 'clearHistory' })
    expect(store.getSnapshot().ready).toBe(false)
    expect(store.getSnapshot().status).toBe('offline')
    expect(writes).toBe(0)
  })

  it('mantém alterações offline e recupera uma gravação cuja resposta se perdeu', async () => {
    const server = fakeServer()
    let loseResponse = true
    const store = new SharedStore({
      read: server.transport.read,
      write: async (document) => {
        const saved = await server.transport.write(document)
        if (loseResponse) { loseResponse = false; throw new Error('response lost') }
        return saved
      },
    })
    await store.refresh()
    store.dispatch({ type: 'setDate', date: '2026-10-14' })
    await settled(store)
    expect(store.getSnapshot().status).toBe('offline')
    expect(store.hasUnsavedChanges()).toBe(true)
    await store.retry()
    expect(store.getSnapshot().status).toBe('saved')
    expect(server.read().revision).toBe(1)
  })

  it('uma leitura lenta não sobrescreve uma edição local', async () => {
    const server = fakeServer()
    let resolveRead: ((value: SharedDocument) => void) | undefined
    let slow = false
    const store = new SharedStore({
      read: () => slow ? new Promise((resolve) => { resolveRead = resolve }) : server.transport.read(),
      write: server.transport.write,
    })
    await store.refresh()
    slow = true
    const refresh = store.refresh()
    store.dispatch({ type: 'setDate', date: '2026-10-14' })
    await settled(store)
    resolveRead!({ revision: 0, data: emptyData() })
    await refresh
    expect(store.getSnapshot().state.coffeeDate).toBe('2026-10-14')
    expect(store.getSnapshot().revision).toBe(1)
  })

  it('importação local nunca substitui dados já compartilhados', async () => {
    const server = fakeServer()
    const store = new SharedStore(server.transport)
    await store.refresh()
    store.importLocal({ ...emptyData(), coffeeDate: '2026-10-14' })
    await settled(store)
    store.importLocal(emptyData())
    expect(server.read().data.coffeeDate).toBe('2026-10-14')
  })
})
