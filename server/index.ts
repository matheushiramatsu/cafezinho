import { resolve } from 'node:path'
import { createApp } from './app'
import { openDatabase } from './database'

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser uma porta válida.')
const databasePath = resolve(process.env.DATABASE_PATH ?? 'data/cafezinho.sqlite')
const db = openDatabase(databasePath)
const app = createApp(db, resolve('dist'))
app.listen(port, host, () => console.log(`Cafezinho disponível em http://${host}:${port} (SQLite: ${databasePath})`))
app.on('error', (error) => { console.error(error); db.close(); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => app.close(() => { db.close(); process.exit(0) }))
}
