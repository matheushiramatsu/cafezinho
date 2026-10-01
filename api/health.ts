import { createHostedHandler } from '../server/hosted-api'

export default { fetch: createHostedHandler('health') }
