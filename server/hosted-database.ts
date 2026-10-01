import { createClient, type Client } from '@libsql/client/web'
import { emptyData } from '../src/domain/storage.js'
import type { StoredData } from '../src/domain/types'
import type { SharedDocument } from './database'

export class DatabaseConfigurationError extends Error {}

export function createHostedDatabase(client: Client) {
  let initialized: Promise<unknown> | undefined
  function initialize() {
    initialized ??= client.batch([
      `CREATE TABLE IF NOT EXISTS shared_data (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        payload TEXT NOT NULL
      ) STRICT`,
      { sql: 'INSERT OR IGNORE INTO shared_data VALUES (1, 0, ?)', args: [JSON.stringify(emptyData())] },
    ], 'write').catch((error: unknown) => { initialized = undefined; throw error })
    return initialized
  }
  return {
    async read(): Promise<SharedDocument> {
      await initialize()
      const result = await client.execute('SELECT revision, payload FROM shared_data WHERE id = 1')
      const row = result.rows[0]
      return { revision: Number(row.revision), data: JSON.parse(String(row.payload)) as StoredData }
    },
    async save(revision: number, data: StoredData): Promise<SharedDocument | null> {
      await initialize()
      const result = await client.execute({
        sql: 'UPDATE shared_data SET revision = revision + 1, payload = ? WHERE id = 1 AND revision = ? RETURNING revision',
        args: [JSON.stringify(data), revision],
      })
      return result.rows.length === 1 ? { revision: Number(result.rows[0].revision), data } : null
    },
    close() { client.close() },
  }
}

export type HostedDatabase = ReturnType<typeof createHostedDatabase>
let database: HostedDatabase | undefined

export function getHostedDatabase(): HostedDatabase {
  if (database) return database
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken || !/^(libsql|https):\/\//.test(url)) {
    throw new DatabaseConfigurationError('Banco compartilhado não configurado.')
  }
  database = createHostedDatabase(createClient({ url, authToken }))
  return database
}
