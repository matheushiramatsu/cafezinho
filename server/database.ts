import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { emptyData } from '../src/domain/storage'
import type { StoredData } from '../src/domain/types'

export interface SharedDocument {
  revision: number
  data: StoredData
}

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path, { timeout: 5000 })
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS shared_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL
    ) STRICT;
  `)
  db.prepare('INSERT OR IGNORE INTO shared_data VALUES (1, 0, ?)').run(JSON.stringify(emptyData()))
  const read = db.prepare('SELECT revision, payload FROM shared_data WHERE id = 1')
  const write = db.prepare('UPDATE shared_data SET revision = revision + 1, payload = ? WHERE id = 1 AND revision = ?')

  return {
    read(): SharedDocument {
      const row = read.get()!
      return { revision: Number(row.revision), data: JSON.parse(String(row.payload)) as StoredData }
    },
    // A comparação e a gravação acontecem no mesmo comando SQL, inclusive entre processos.
    save(revision: number, data: StoredData): SharedDocument | null {
      const result = write.run(JSON.stringify(data), revision)
      return result.changes === 1 ? { revision: revision + 1, data } : null
    },
    close() { db.close() },
  }
}

export type SharedDatabase = ReturnType<typeof openDatabase>
