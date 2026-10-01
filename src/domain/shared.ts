import { createState, reducer, type Action, type AppState } from './state'
import { emptyData, sanitizeData } from './storage'
import type { StoredData } from './types'

export interface SharedDocument { revision: number; data: StoredData }
export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'conflict'
export interface SharedSnapshot {
  state: AppState
  status: SyncStatus
  ready: boolean
  revision: number
  problem: string | null
}

export function storedData(state: AppState): StoredData {
  return {
    participants: state.participants, items: state.items, coffeeDate: state.coffeeDate,
    history: state.history, currentResultId: state.result?.id ?? null,
  }
}

export class ConflictError extends Error {}
export class SharedServiceError extends Error {}
export interface SharedTransport {
  read(): Promise<SharedDocument>
  write(document: SharedDocument): Promise<SharedDocument>
}

async function readResponse(response: Response): Promise<SharedDocument> {
  if (response.status === 404 || !response.headers.get('content-type')?.includes('application/json')) {
    throw new SharedServiceError('O serviço de dados não está disponível neste endereço. Entre em contato com quem mantém a aplicação.')
  }
  let value: unknown
  try { value = await response.json() }
  catch { throw new SharedServiceError('O serviço de dados retornou uma resposta inválida. Tente novamente mais tarde.') }
  if (!response.ok) {
    if (typeof value === 'object' && value !== null && 'code' in value && value.code === 'database_not_configured') {
      throw new SharedServiceError('O serviço de dados ainda não foi configurado para este endereço. Entre em contato com quem mantém a aplicação.')
    }
    throw new SharedServiceError('O serviço de dados está indisponível. Tente novamente mais tarde.')
  }
  if (typeof value !== 'object' || value === null || !('revision' in value) || !('data' in value)
      || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
      || typeof value.data !== 'object' || value.data === null
      || !('participants' in value.data) || !Array.isArray(value.data.participants)
      || !('items' in value.data) || !Array.isArray(value.data.items)
      || !('history' in value.data) || !Array.isArray(value.data.history)
      || !('coffeeDate' in value.data) || typeof value.data.coffeeDate !== 'string'
      || !('currentResultId' in value.data) || (value.data.currentResultId !== null && typeof value.data.currentResultId !== 'string')) {
    throw new SharedServiceError('O serviço de dados retornou uma resposta inválida. Tente novamente mais tarde.')
  }
  const sanitized = sanitizeData(value.data)
  if (sanitized.dropped > 0) throw new SharedServiceError('O serviço de dados retornou uma resposta inválida. Tente novamente mais tarde.')
  return { revision: Number(value.revision), data: sanitized.data }
}

export const httpTransport: SharedTransport = {
  async read() {
    const response = await fetch('/api/data', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    return readResponse(response)
  },
  async write(document) {
    const response = await fetch('/api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document), signal: AbortSignal.timeout(10000),
    })
    if (response.status === 409) throw new ConflictError()
    return readResponse(response)
  },
}

/** Escritas em série, controle de versão e preservação do rascunho em caso de falha. */
export class SharedStore {
  private snapshot: SharedSnapshot = { state: createState(emptyData()), status: 'loading', ready: false, revision: 0, problem: null }
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
    this.update({ status: 'saving', problem: null })
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
      this.update({ revision: saved.revision, status: this.dirty ? 'saving' : 'saved', problem: null })
    } catch (error) {
      this.update({ status: error instanceof ConflictError ? 'conflict' : 'offline', problem: error instanceof SharedServiceError ? error.message : null })
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
        revision: document.revision, ready: true, status: 'saved', problem: null,
      })
    } catch (error) {
      if (!this.dirty && this.generation === generation) this.update({ status: 'offline', problem: error instanceof SharedServiceError ? error.message : null })
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
      this.update({ state: createState(document.data), revision: document.revision, ready: true, status: 'saved', problem: null })
    } catch {
      this.update({ status: 'conflict' })
    } finally { this.reading = false }
  }
}
