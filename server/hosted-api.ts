import { DatabaseConfigurationError, getHostedDatabase, type HostedDatabase } from './hosted-database.js'
import { validateWrite } from './validation.js'

const MAX_BODY = 4 * 1024 * 1024
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('Conteúdo vazio.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY) { await reader.cancel(); throw new RangeError('Conteúdo muito grande.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** A mesma revisão SQL é usada em todas as instâncias das funções da Vercel. */
export function createHostedHandler(resource: 'data' | 'health', getDatabase = getHostedDatabase) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method === 'GET') {
        const document = await getDatabase().read()
        return json(resource === 'health' ? { ok: true } : document)
      }
      if (resource !== 'data' || request.method !== 'PUT') return json({ error: 'Método não permitido.' }, 405)
      if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origem não permitida.' }, 403)
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Envie application/json.' }, 415)
      let body: unknown
      try { body = await readBody(request) }
      catch (error) { return json({ error: 'Conteúdo inválido ou muito grande.' }, error instanceof RangeError ? 413 : 400) }
      const input = validateWrite(body)
      if (!input) return json({ error: 'Dados inválidos.' }, 400)
      const db: HostedDatabase = getDatabase()
      const saved = await db.save(input.revision, input.data)
      return saved ? json(saved) : json({ error: 'Outra pessoa alterou os dados. Carregue a versão atual antes de editar.' }, 409)
    } catch (error) {
      if (error instanceof DatabaseConfigurationError) {
        return json({ code: 'database_not_configured', error: 'O serviço de dados ainda não foi configurado para este endereço.' }, 503)
      }
      // A resposta pública não inclui dados de conexão ou credenciais.
      return json({ error: 'Não foi possível acessar os dados compartilhados.' }, 503)
    }
  }
}
