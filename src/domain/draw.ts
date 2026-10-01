import type { Assignment, CoffeeItem, DrawSnapshot, Participant } from './types'
import { isValidDateString } from './date'
import {
  MAX_ITEMS,
  MAX_PARTICIPANTS,
  MAX_QUANTITY,
  MAX_TOTAL_QUANTITY,
} from './limits'
import { MinCostFlow } from './mincostflow'
import { effectivelyPrefers, isRestricted, restrictionReason } from './rules'
import { joinNames, plural } from './text'

export type DrawErrorCode =
  | 'invalid-date'
  | 'no-participants'
  | 'no-items'
  | 'invalid-data'
  | 'too-large'
  | 'impossible'

export interface DrawError {
  code: DrawErrorCode
  message: string
  /** Linhas de diagnóstico para exibir em lista. */
  details: string[]
}

export interface DrawStats {
  totalAssignments: number
  minLoad: number
  maxLoad: number
  preferenceHits: number
  /** Pares pessoa+item iguais aos do sorteio de referência. */
  repeats: number
}

export type AssignOutcome =
  | { ok: true; assignments: Assignment[]; stats: DrawStats }
  | { ok: false; error: DrawError }

export interface AssignInput {
  participants: Participant[]
  items: CoffeeItem[]
  /** Sorteio de referência cujos pares devem ser evitados (menor prioridade). */
  previous?: Assignment[]
  rng?: () => number
}

// ---------------------------------------------------------------------------
// Diagnóstico de impossibilidade
// ---------------------------------------------------------------------------

export interface Shortage {
  item: CoffeeItem
  eligible: Participant[]
  blocked: Array<{ participant: Participant; reason: 'item' | 'category' }>
}

/**
 * Cada pessoa leva no máximo uma unidade de cada item, então um item de
 * quantidade q exige q pessoas elegíveis distintas.
 */
export function findShortages(participants: Participant[], items: CoffeeItem[]): Shortage[] {
  const shortages: Shortage[] = []
  for (const item of items) {
    const eligible: Participant[] = []
    const blocked: Shortage['blocked'] = []
    for (const participant of participants) {
      const reason = restrictionReason(participant, item)
      if (reason) blocked.push({ participant, reason })
      else eligible.push(participant)
    }
    if (item.quantity > eligible.length) shortages.push({ item, eligible, blocked })
  }
  return shortages
}

function quoted(name: string): string {
  return `"${name}"`
}

function describeBlocked(shortage: Shortage): string {
  if (shortage.blocked.length === 0) return ''
  const parts = shortage.blocked.map(({ participant, reason }) =>
    reason === 'item'
      ? `${participant.name} (restrição ao item)`
      : `${participant.name} (restrição à categoria "${shortage.item.category ?? ''}")`,
  )
  return ` Não podem levar: ${joinNames(parts)}.`
}

function describeShortage(shortage: Shortage): string {
  const { item, eligible } = shortage
  const needs = `${quoted(item.name)} precisa de ${item.quantity} ${plural(item.quantity, 'pessoa diferente', 'pessoas diferentes')}`
  const have =
    eligible.length === 0
      ? 'mas ninguém pode levar'
      : `mas só ${eligible.length === 1 ? 'pode' : 'podem'} levar ${eligible.length} (${joinNames(eligible.map((p) => p.name))})`
  return `${needs}, ${have}.${describeBlocked(shortage)}`
}

function describeShortages(shortages: Shortage[]): DrawError {
  if (shortages.length === 1) {
    const only = describeShortage(shortages[0])
    return { code: 'impossible', message: only, details: [] }
  }
  // Agrupa itens que dependem exatamente do mesmo conjunto de pessoas.
  const groups = new Map<string, Shortage[]>()
  for (const shortage of shortages) {
    const key = shortage.eligible
      .map((p) => p.id)
      .sort()
      .join('|')
    const group = groups.get(key)
    if (group) group.push(shortage)
    else groups.set(key, [shortage])
  }
  const details: string[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      details.push(describeShortage(group[0]))
      continue
    }
    const pool = group[0].eligible
    const poolText =
      pool.length === 0
        ? 'Ninguém pode levar'
        : `Só ${pool.length === 1 ? 'pode' : 'podem'} levar ${joinNames(pool.map((p) => p.name))}`
    const itemsText = joinNames(
      group.map(({ item }) => `${quoted(item.name)} (${item.quantity} ${plural(item.quantity, 'pessoa', 'pessoas')})`),
    )
    details.push(
      `${poolText}, mas os itens ${itemsText} dependem desse mesmo grupo e cada um precisa de mais pessoas do que ele tem.`,
    )
  }
  return {
    code: 'impossible',
    message: `${shortages.length} itens não têm pessoas elegíveis suficientes com as restrições atuais. Cada pessoa leva no máximo uma unidade de cada item.`,
    details,
  }
}

function describeOverloadedPool(
  participants: Participant[],
  items: CoffeeItem[],
): DrawError {
  const total = items.reduce((sum, item) => sum + item.quantity, 0)
  const lines = items.map((item) => {
    const eligible = participants.filter((p) => !isRestricted(p, item)).length
    return `${quoted(item.name)}: precisa de ${item.quantity}, ${eligible} ${plural(eligible, 'elegível', 'elegíveis')}`
  })
  return {
    code: 'impossible',
    message: `Não foi possível distribuir as ${total} unidades: o pool de pessoas elegíveis está sobrecarregado pelas restrições atuais.`,
    details: lines,
  }
}

// ---------------------------------------------------------------------------
// Otimização global por fluxo de custo mínimo
// ---------------------------------------------------------------------------

/**
 * Pesos lexicográficos. Cada nível é maior que a soma máxima possível de todos
 * os níveis abaixo dele (no pior caso, as `total` atribuições pagam o custo
 * máximo de cada nível), então um nível nunca é sacrificado por níveis
 * inferiores:
 *   equilíbrio  >  preferência  >  repetição  >  aleatoriedade
 * Viabilidade e restrições/unicidade são impostas pela estrutura do grafo
 * (arestas proibidas inexistem; capacidade 1 por par pessoa/item) e pelo
 * requisito de fluxo total.
 */
export interface Weights {
  noiseRange: number
  repeat: number
  preference: number
  balance: number
}

const SAFE_COST = 2 ** 50

export function computeWeights(total: number, maxLoad: number): Weights {
  for (let noiseRange = 256; noiseRange >= 1; noiseRange = Math.floor(noiseRange / 2)) {
    const repeat = total * noiseRange
    const preference = total * (repeat + noiseRange)
    const balance = total * (preference + repeat + noiseRange)
    // Maior custo de caminho: (2*maxLoad - 1) fatias de equilíbrio por unidade.
    if (balance * (2 * maxLoad + 1) * 4 < SAFE_COST) {
      return { noiseRange, repeat, preference, balance }
    }
    if (noiseRange === 1) break
  }
  const repeat = total
  const preference = total * (repeat + 1)
  return { noiseRange: 1, repeat, preference, balance: total * (preference + repeat + 1) }
}

function pairKey(participantId: string, itemId: string): string {
  return `${participantId}\u0000${itemId}`
}

export function validateAssignments(
  participants: Participant[],
  items: CoffeeItem[],
  assignments: Assignment[],
): string | null {
  const participantById = new Map(participants.map((p) => [p.id, p]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const { participantId, itemId } of assignments) {
    const participant = participantById.get(participantId)
    const item = itemById.get(itemId)
    if (!participant || !item) return 'Atribuição referencia pessoa ou item inexistente.'
    if (isRestricted(participant, item)) {
      return `${participant.name} não pode levar ${item.name}.`
    }
    const key = pairKey(participantId, itemId)
    if (seen.has(key)) return `${participant.name} recebeu ${item.name} mais de uma vez.`
    seen.add(key)
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
  }
  for (const item of items) {
    if ((counts.get(item.id) ?? 0) !== item.quantity) {
      return `${item.name} deveria ter ${item.quantity} ${plural(item.quantity, 'pessoa', 'pessoas')}.`
    }
  }
  return null
}

export function computeStats(
  participants: Participant[],
  items: CoffeeItem[],
  assignments: Assignment[],
  previous: Assignment[] = [],
): DrawStats {
  const loads = new Map(participants.map((p) => [p.id, 0]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const participantById = new Map(participants.map((p) => [p.id, p]))
  const previousPairs = new Set(previous.map((a) => pairKey(a.participantId, a.itemId)))
  let preferenceHits = 0
  let repeats = 0
  for (const { participantId, itemId } of assignments) {
    loads.set(participantId, (loads.get(participantId) ?? 0) + 1)
    const participant = participantById.get(participantId)
    const item = itemById.get(itemId)
    if (participant && item && effectivelyPrefers(participant, item)) preferenceHits += 1
    if (previousPairs.has(pairKey(participantId, itemId))) repeats += 1
  }
  const values = [...loads.values()]
  return {
    totalAssignments: assignments.length,
    minLoad: values.length ? Math.min(...values) : 0,
    maxLoad: values.length ? Math.max(...values) : 0,
    preferenceHits,
    repeats,
  }
}

export function assignItems(input: AssignInput): AssignOutcome {
  const { participants, items } = input
  const rng = input.rng ?? Math.random

  if (participants.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no-participants',
        message: 'Adicione ao menos um participante para sortear.',
        details: [],
      },
    }
  }
  if (items.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no-items',
        message: 'Adicione ao menos um item para sortear.',
        details: [],
      },
    }
  }
  const dataProblem = findDataProblem(participants, items)
  if (dataProblem) {
    return { ok: false, error: { code: 'invalid-data', message: dataProblem, details: [] } }
  }
  const total = items.reduce((sum, item) => sum + item.quantity, 0)
  if (
    participants.length > MAX_PARTICIPANTS ||
    items.length > MAX_ITEMS ||
    total > MAX_TOTAL_QUANTITY
  ) {
    return {
      ok: false,
      error: {
        code: 'too-large',
        message: `Lista grande demais para sortear: no máximo ${MAX_PARTICIPANTS} participantes, ${MAX_ITEMS} itens e ${MAX_TOTAL_QUANTITY} unidades no total.`,
        details: [],
      },
    }
  }

  const shortages = findShortages(participants, items)
  if (shortages.length > 0) return { ok: false, error: describeShortages(shortages) }

  const eligible = participants.map((participant) =>
    items.map((item) => !isRestricted(participant, item)),
  )
  const eligibleCounts = eligible.map((row) => row.filter(Boolean).length)
  const maxLoad = Math.max(...eligibleCounts)
  const weights = computeWeights(total, maxLoad)
  const previousPairs = new Set(
    (input.previous ?? []).map((a) => pairKey(a.participantId, a.itemId)),
  )

  const P = participants.length
  const I = items.length
  const source = 0
  const personNode = (p: number) => 1 + p
  const itemNode = (i: number) => 1 + P + i
  const sink = 1 + P + I
  const graph = new MinCostFlow(sink + 1)

  // fonte → pessoa: fatias progressivas de carga. A k-ésima fatia custa
  // (2k-1)*balance, logo carga L custa L² * balance (penalidade convexa).
  for (let p = 0; p < P; p += 1) {
    for (let k = 1; k <= eligibleCounts[p]; k += 1) {
      graph.addEdge(source, personNode(p), 1, (2 * k - 1) * weights.balance)
    }
  }
  // pessoa → item: capacidade 1 (unicidade), só entre pares permitidos.
  const pairEdges: Array<{ edge: number; p: number; i: number }> = []
  for (let p = 0; p < P; p += 1) {
    for (let i = 0; i < I; i += 1) {
      if (!eligible[p][i]) continue
      let cost = Math.floor(rng() * weights.noiseRange)
      if (!effectivelyPrefers(participants[p], items[i])) cost += weights.preference
      if (previousPairs.has(pairKey(participants[p].id, items[i].id))) cost += weights.repeat
      pairEdges.push({ edge: graph.addEdge(personNode(p), itemNode(i), 1, cost), p, i })
    }
  }
  // item → destino: capacidade = quantidade.
  for (let i = 0; i < I; i += 1) {
    graph.addEdge(itemNode(i), sink, items[i].quantity, 0)
  }

  const { flow } = graph.run(source, sink, total)
  if (flow !== total) {
    return { ok: false, error: describeOverloadedPool(participants, items) }
  }

  const assignments: Assignment[] = pairEdges
    .filter(({ edge }) => graph.flowOn(edge) > 0)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map(({ p, i }) => ({ participantId: participants[p].id, itemId: items[i].id }))

  const invalid = validateAssignments(participants, items, assignments)
  if (assignments.length !== total || invalid) {
    return {
      ok: false,
      error: {
        code: 'invalid-data',
        message: `Falha interna ao validar o sorteio${invalid ? `: ${invalid}` : ''}.`,
        details: [],
      },
    }
  }

  return {
    ok: true,
    assignments,
    stats: computeStats(participants, items, assignments, input.previous),
  }
}

function findDataProblem(participants: Participant[], items: CoffeeItem[]): string | null {
  const participantIds = new Set<string>()
  for (const participant of participants) {
    if (!participant.id || participantIds.has(participant.id)) {
      return 'Há participantes com identificador inválido ou repetido.'
    }
    participantIds.add(participant.id)
  }
  const itemIds = new Set<string>()
  for (const item of items) {
    if (!item.id || itemIds.has(item.id)) {
      return 'Há itens com identificador inválido ou repetido.'
    }
    itemIds.add(item.id)
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      return `A quantidade de "${item.name}" deve ser um inteiro entre 1 e ${MAX_QUANTITY}.`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Snapshot e sorteio completo
// ---------------------------------------------------------------------------

function cloneParticipant(participant: Participant): Participant {
  return {
    id: participant.id,
    name: participant.name,
    cannotBringItemIds: [...participant.cannotBringItemIds],
    cannotBringCategories: [...participant.cannotBringCategories],
    preferredItemIds: [...participant.preferredItemIds],
  }
}

function cloneItem(item: CoffeeItem): CoffeeItem {
  const copy: CoffeeItem = { id: item.id, name: item.name, quantity: item.quantity }
  if (item.category !== undefined) copy.category = item.category
  return copy
}

/** Cópia profunda: nenhuma referência compartilhada com o estado ou outro snapshot. */
export function cloneSnapshot(snapshot: DrawSnapshot): DrawSnapshot {
  return {
    id: snapshot.id,
    coffeeDate: snapshot.coffeeDate,
    createdAt: snapshot.createdAt,
    participants: snapshot.participants.map(cloneParticipant),
    items: snapshot.items.map(cloneItem),
    assignments: snapshot.assignments.map((a) => ({
      participantId: a.participantId,
      itemId: a.itemId,
    })),
  }
}

export interface RunDrawInput {
  participants: Participant[]
  items: CoffeeItem[]
  coffeeDate: string
  previous?: Assignment[]
  id: string
  now: Date
  rng?: () => number
}

export type RunDrawOutcome =
  | { ok: true; snapshot: DrawSnapshot; stats: DrawStats }
  | { ok: false; error: DrawError }

export function runDraw(input: RunDrawInput): RunDrawOutcome {
  if (!input.coffeeDate) {
    return {
      ok: false,
      error: { code: 'invalid-date', message: 'Escolha a data do café.', details: [] },
    }
  }
  if (!isValidDateString(input.coffeeDate)) {
    return {
      ok: false,
      error: { code: 'invalid-date', message: 'A data do café é inválida.', details: [] },
    }
  }
  const outcome = assignItems({
    participants: input.participants,
    items: input.items,
    previous: input.previous,
    rng: input.rng,
  })
  if (!outcome.ok) return outcome
  const snapshot = cloneSnapshot({
    id: input.id,
    coffeeDate: input.coffeeDate,
    createdAt: input.now.toISOString(),
    participants: input.participants,
    items: input.items,
    assignments: outcome.assignments,
  })
  return { ok: true, snapshot, stats: outcome.stats }
}
