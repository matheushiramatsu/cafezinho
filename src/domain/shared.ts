import { createState, reducer, type Action, type AppState } from './state'
import { emptyData } from './storage'
import type { StoredData } from './types'

export interface SharedDocument { revision: number; data: StoredData }
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'conflict'
export interface SharedSnapshot {
  state: AppState
  status: SyncStatus
  ready: boolean
  revision: number
}

export function storedData(state: AppState): StoredData {
  return {
    participants: state.participants, items: state.items, coffeeDate: state.coffeeDate,
    history: state.history, currentResultId: state.result?.id ?? null,
  }
}

export class ConflictError extends Error {}
export interface SharedTransport {
  read(): Promise<SharedDocument>
  write(document: SharedDocument): Promise<SharedDocument>
}

export const httpTransport: SharedTransport = {
  async read() {
    const response = await fetch('/api/data', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Não foi possível carregar os dados.')
    return response.json() as Promise<SharedDocument>
  },
  async write(document) {
    const response = await fetch('/api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document), signal: AbortSignal.timeout(10000),
    })
    if (response.status === 409) throw new ConflictError()
    if (!response.ok) throw new Error('Não foi possível salvar os dados.')
    return response.json() as Promise<SharedDocument>
  },
}

/** Escritas em série, controle de versão e preservação do rascunho em caso de falha. */
export class SharedStore {
  private snapshot: SharedSnapshot = { state: createState(emptyData()), status: 'loading', ready: false, revision: 0 }
  private listeners = new Set<() => void>()
  private dirty = false
  private writing = false
  private reading = false
  private generation = 0
  private transport: SharedTransport

  constructor(transport: SharedTransport = httpTransport) { this.transport = transport }
  getSnapshot = () => this.snapshot
  hasUnsavedChanges = () => this.dirty
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<SharedSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  dispatch = (action: Action) => {
    if (!this.snapshot.ready || this.snapshot.status === 'conflict') return
    const state = reducer(this.snapshot.state, action)
    if (state === this.snapshot.state) return
    this.generation++
    this.dirty = true
    this.update({ state, status: 'saving' })
    void this.flush()
  }

  importLocal = (data: StoredData) => {
    if (!this.snapshot.ready || this.snapshot.revision !== 0 || this.dirty) return
    this.generation++
    this.dirty = true
    this.update({ state: createState(data), status: 'saving' })
    void this.flush()
  }

  private async flush() {
    if (this.writing || !this.dirty || this.snapshot.status === 'conflict') return
    this.writing = true
    const generation = this.generation
    const document = { revision: this.snapshot.revision, data: storedData(this.snapshot.state) }
    this.update({ status: 'saving' })
    try {
      let saved: SharedDocument
      try {
        saved = await this.transport.write(document)
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error
        const current = await this.transport.read()
        // A gravação pode ter sido concluída antes de uma resposta se perder na rede.
        if (JSON.stringify(current.data) !== JSON.stringify(document.data)) throw error
        saved = current
      }
      this.dirty = generation !== this.generation
      this.update({ revision: saved.revision, status: this.dirty ? 'saving' : 'saved' })
    } catch (error) {
      this.update({ status: error instanceof ConflictError ? 'conflict' : 'offline' })
    } finally {
      this.writing = false
    }
    if (this.dirty && this.snapshot.status === 'saving') void this.flush()
  }

  refresh = async () => {
    if (this.dirty || this.writing || this.reading || this.snapshot.status === 'conflict') return
    this.reading = true
    const generation = this.generation
    try {
      const document = await this.transport.read()
      // Uma edição local ocorrida durante a leitura não pode ser sobrescrita.
      if (this.dirty || this.writing || this.generation !== generation) return
      const changed = !this.snapshot.ready || document.revision !== this.snapshot.revision
      this.update({
        ...(changed ? { state: createState(document.data) } : {}),
        revision: document.revision, ready: true, status: 'saved',
      })
    } catch {
      if (!this.dirty && this.generation === generation) this.update({ status: 'offline' })
    } finally { this.reading = false }
  }

  retry = () => this.dirty ? this.flush() : this.refresh()

  // A interface deixa explícito que esta ação descarta o rascunho local.
  reloadShared = async () => {
    if (this.writing || this.reading) return
    this.reading = true
    try {
      const document = await this.transport.read()
      this.generation++
      this.dirty = false
      this.update({ state: createState(document.data), revision: document.revision, ready: true, status: 'saved' })
    } catch {
      this.update({ status: 'conflict' })
    } finally { this.reading = false }
  }
}
