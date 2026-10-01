import { z } from 'zod'
import { isValidDateString } from '../src/domain/date.js'
import { MAX_HISTORY, MAX_ITEMS, MAX_NAME_LENGTH, MAX_PARTICIPANTS, MAX_QUANTITY } from '../src/domain/limits.js'
import { sanitizeData } from '../src/domain/storage.js'

const id = z.string().min(1).max(200)
const name = z.string().trim().min(1).max(MAX_NAME_LENGTH)
const participant = z.object({
  id, name,
  cannotBringItemIds: z.array(id).max(MAX_ITEMS),
  cannotBringCategories: z.array(name).max(MAX_ITEMS),
  preferredItemIds: z.array(id).max(MAX_ITEMS),
}).strict()
const item = z.object({ id, name, quantity: z.number().int().min(1).max(MAX_QUANTITY), category: name.optional() }).strict()
const participants = z.array(participant).max(MAX_PARTICIPANTS)
const items = z.array(item).max(MAX_ITEMS)
const date = z.string().refine(isValidDateString)
const snapshot = z.object({
  id, coffeeDate: date, createdAt: z.iso.datetime({ offset: true }), participants, items,
  assignments: z.array(z.object({ participantId: id, itemId: id }).strict()).max(MAX_PARTICIPANTS * MAX_ITEMS),
}).strict()
const payload = z.object({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  data: z.object({
    participants, items, coffeeDate: z.union([z.literal(''), date]),
    history: z.array(snapshot).max(MAX_HISTORY), currentResultId: id.nullable(),
  }).strict(),
}).strict()

export function validateWrite(value: unknown) {
  const parsed = payload.safeParse(value)
  if (!parsed.success) return null
  const sanitized = sanitizeData(parsed.data.data)
  if (sanitized.dropped > 0 || sanitized.data.currentResultId !== parsed.data.data.currentResultId) return null
  return { revision: parsed.data.revision, data: sanitized.data }
}
