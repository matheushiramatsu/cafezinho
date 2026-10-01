import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import type { SharedDatabase } from './database'
import { validateWrite } from './validation'

const MAX_BODY = 10 * 1024 * 1024
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readBody(req: IncomingMessage) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('body-too-large')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function createApp(db: SharedDatabase, staticDirectory: string) {
  const root = resolve(staticDirectory)
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname === '/api/health' && req.method === 'GET') {
        db.read()
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/api/data') {
        if (req.method === 'GET') return json(res, 200, db.read())
        if (req.method !== 'PUT') return json(res, 405, { error: 'Método não permitido.' })
        // O navegador só pode gravar pela própria aplicação; não habilitamos CORS.
        if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Origem não permitida.' })
        if (!req.headers['content-type']?.startsWith('application/json')) {
          return json(res, 415, { error: 'Envie application/json.' })
        }
        let body: unknown
        try {
          body = await readBody(req)
        } catch (error) {
          return json(res, error instanceof Error && error.message === 'body-too-large' ? 413 : 400, { error: 'Conteúdo inválido ou muito grande.' })
        }
        const input = validateWrite(body)
        if (!input) return json(res, 400, { error: 'Dados inválidos.' })
        const saved = db.save(input.revision, input.data)
        if (!saved) return json(res, 409, { error: 'Outra pessoa alterou os dados. Carregue a versão atual antes de editar.' })
        return json(res, 200, saved)
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Endpoint não encontrado.' })
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' })
      const pathname = decodeURIComponent(url.pathname)
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      const pathFromRoot = relative(root, file)
      if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || pathFromRoot.includes(':') || pathname.includes('\\')) {
        return json(res, 403, { error: 'Caminho não permitido.' })
      }
      try {
        if (!(await stat(file)).isFile()) return json(res, 404, { error: 'Arquivo não encontrado.' })
        const contents = await readFile(file)
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        })
        res.end(req.method === 'HEAD' ? undefined : contents)
      } catch {
        json(res, 404, { error: 'Interface não encontrada. Execute npm run build.' })
      }
    } catch (error) {
      console.error('Erro na requisição:', error)
      if (!res.headersSent) json(res, 500, { error: 'Não foi possível acessar os dados.' })
      else res.end()
    }
  })
}
