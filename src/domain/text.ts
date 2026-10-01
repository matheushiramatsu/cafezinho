/** Remove espaços nas pontas e colapsa qualquer sequência de espaços em um só. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/**
 * Chave de comparação: espaços colapsados, sem acentos e sem diferença de caixa.
 * "  José   Silva " e "jose silva" geram a mesma chave.
 */
export function normalizeKey(value: string): string {
  return collapseSpaces(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/gu, 'ss')
    .toLowerCase()
}

/** Junta nomes em português: "Ana, Bia e Caio". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}
