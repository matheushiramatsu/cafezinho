import type { DrawSnapshot } from './types'
import { formatDateLong } from './date'

export interface PersonRow {
  participantId: string
  name: string
  itemNames: string[]
}

export interface ItemRow {
  itemId: string
  name: string
  quantity: number
  category?: string
  participantNames: string[]
}

/** Visão por pessoa, na ordem do cadastro do snapshot. */
export function byPerson(snapshot: DrawSnapshot): PersonRow[] {
  const itemName = new Map(snapshot.items.map((item) => [item.id, item.name]))
  return snapshot.participants.map((participant) => ({
    participantId: participant.id,
    name: participant.name,
    itemNames: snapshot.assignments
      .filter((a) => a.participantId === participant.id)
      .map((a) => itemName.get(a.itemId) ?? '')
      .filter(Boolean),
  }))
}

/** Visão por item, na ordem do cadastro do snapshot. */
export function byItem(snapshot: DrawSnapshot): ItemRow[] {
  const personName = new Map(snapshot.participants.map((p) => [p.id, p.name]))
  return snapshot.items.map((item) => ({
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    category: item.category,
    participantNames: snapshot.assignments
      .filter((a) => a.itemId === item.id)
      .map((a) => personName.get(a.participantId) ?? '')
      .filter(Boolean),
  }))
}

/** Texto pronto para WhatsApp/Slack (`*negrito*` funciona nos dois). */
export function formatShareText(snapshot: DrawSnapshot): string {
  const lines: string[] = [`*Cafezinho ESL — ${formatDateLong(snapshot.coffeeDate)}*`, '']
  lines.push('*Por pessoa*')
  for (const row of byPerson(snapshot)) {
    lines.push(`• ${row.name}: ${row.itemNames.length ? row.itemNames.join(', ') : 'nada desta vez'}`)
  }
  lines.push('', '*Por item*')
  for (const row of byItem(snapshot)) {
    lines.push(`• ${row.name} (${row.quantity}): ${row.participantNames.join(', ')}`)
  }
  return lines.join('\n')
}
