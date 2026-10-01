import type { CoffeeItem, Participant } from './types'
import {
  MAX_ITEMS,
  MAX_NAME_LENGTH,
  MAX_PARTICIPANTS,
  MAX_QUANTITY,
} from './limits.js'
import { collapseSpaces, normalizeKey } from './text.js'

interface Named {
  id: string
  name: string
}

/** Valida um nome contra os já existentes. Retorna a mensagem de erro ou null. */
export function validateName(
  rawName: string,
  existing: Named[],
  options: { exceptId?: string; label: string },
): string | null {
  const name = collapseSpaces(rawName)
  if (!name) return `Informe ${options.label}.`
  if (name.length > MAX_NAME_LENGTH) {
    return `Use no máximo ${MAX_NAME_LENGTH} caracteres.`
  }
  const key = normalizeKey(name)
  const clash = existing.find(
    (entry) => entry.id !== options.exceptId && normalizeKey(entry.name) === key,
  )
  if (clash) return `"${clash.name}" já está cadastrado.`
  return null
}

export function validateParticipantName(
  rawName: string,
  participants: Participant[],
  exceptId?: string,
): string | null {
  if (exceptId === undefined && participants.length >= MAX_PARTICIPANTS) {
    return `O limite é de ${MAX_PARTICIPANTS} participantes.`
  }
  return validateName(rawName, participants, { exceptId, label: 'o nome do participante' })
}

export function validateItemName(
  rawName: string,
  items: CoffeeItem[],
  exceptId?: string,
): string | null {
  if (exceptId === undefined && items.length >= MAX_ITEMS) {
    return `O limite é de ${MAX_ITEMS} itens.`
  }
  return validateName(rawName, items, { exceptId, label: 'o nome do item' })
}

export type QuantityResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

/** Quantidade: inteiro entre 1 e MAX_QUANTITY. */
export function parseQuantity(raw: string | number): QuantityResult {
  const text = String(raw).trim()
  if (!/^\d+$/u.test(text)) {
    return { ok: false, error: 'Informe um número inteiro maior ou igual a 1.' }
  }
  const value = Number(text)
  if (value < 1) return { ok: false, error: 'A quantidade mínima é 1.' }
  if (value > MAX_QUANTITY) {
    return { ok: false, error: `A quantidade máxima é ${MAX_QUANTITY}.` }
  }
  return { ok: true, value }
}

export function cleanCategory(raw: string | undefined): string | undefined {
  const clean = collapseSpaces(raw ?? '')
  return clean ? clean.slice(0, MAX_NAME_LENGTH) : undefined
}

export interface ImportPlan {
  added: Participant[]
  /** Nomes ignorados por já existirem ou se repetirem na própria lista. */
  duplicates: string[]
  emptyLines: number
  tooLong: number
  overflow: number
}

export function emptyParticipant(id: string, name: string): Participant {
  return {
    id,
    name,
    cannotBringItemIds: [],
    cannotBringCategories: [],
    preferredItemIds: [],
  }
}

/**
 * Importação em massa: um nome por linha. Ignora linhas vazias e duplicados
 * (após trim, espaços colapsados, caixa e acentos), inclusive os já cadastrados.
 */
export function planImport(
  existing: Participant[],
  raw: string,
  makeId: () => string,
): ImportPlan {
  const seen = new Set(existing.map((participant) => normalizeKey(participant.name)))
  const plan: ImportPlan = {
    added: [],
    duplicates: [],
    emptyLines: 0,
    tooLong: 0,
    overflow: 0,
  }
  for (const line of raw.split(/\r\n|\r|\n/u)) {
    const name = collapseSpaces(line)
    if (!name) {
      plan.emptyLines += 1
      continue
    }
    if (name.length > MAX_NAME_LENGTH) {
      plan.tooLong += 1
      continue
    }
    const key = normalizeKey(name)
    if (seen.has(key)) {
      plan.duplicates.push(name)
      continue
    }
    if (existing.length + plan.added.length >= MAX_PARTICIPANTS) {
      plan.overflow += 1
      continue
    }
    seen.add(key)
    plan.added.push(emptyParticipant(makeId(), name))
  }
  return plan
}

/** Resumo legível do resultado de uma importação, para exibir e anunciar. */
export function describeImport(plan: ImportPlan): string {
  const parts: string[] = []
  const { added, duplicates, emptyLines, tooLong, overflow } = plan
  parts.push(
    added.length === 0
      ? 'Nenhum participante novo foi adicionado.'
      : `${added.length} ${added.length === 1 ? 'participante adicionado' : 'participantes adicionados'}.`,
  )
  if (duplicates.length > 0) {
    parts.push(
      `${duplicates.length} ${duplicates.length === 1 ? 'duplicado ignorado' : 'duplicados ignorados'} (${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '…' : ''}).`,
    )
  }
  if (emptyLines > 0 && added.length + duplicates.length > 0) {
    parts.push(`${emptyLines} ${emptyLines === 1 ? 'linha vazia ignorada' : 'linhas vazias ignoradas'}.`)
  }
  if (tooLong > 0) {
    parts.push(
      `${tooLong} ${tooLong === 1 ? 'nome ignorado' : 'nomes ignorados'} por passar de ${MAX_NAME_LENGTH} caracteres.`,
    )
  }
  if (overflow > 0) {
    parts.push(`${overflow} ignorados: o limite é de ${MAX_PARTICIPANTS} participantes.`)
  }
  return parts.join(' ')
}
