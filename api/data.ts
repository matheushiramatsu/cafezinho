import { createHostedHandler } from '../server/hosted-api.js'

export default { fetch: createHostedHandler('data') }
