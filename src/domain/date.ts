// Datas do café são "datas de calendário" locais (YYYY-MM-DD). Nunca passamos
// essa string para `new Date(string)`, que a interpretaria como UTC e poderia
// exibir o dia anterior em fusos negativos (Brasil).

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const MIN_YEAR = 1900
export const MAX_YEAR = 2200

export function parseLocalDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function isValidDateString(value: string): boolean {
  return parseLocalDate(value) !== null
}

export function todayLocal(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const longFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const shortFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const stampFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** "quarta-feira, 14 de outubro de 2026" */
export function formatDateLong(value: string): string {
  const date = parseLocalDate(value)
  return date ? longFormat.format(date) : value
}

/** "14/10/2026" */
export function formatDateShort(value: string): string {
  const date = parseLocalDate(value)
  return date ? shortFormat.format(date) : value
}

/** "01/10, 10:32" a partir de um ISO 8601. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : stampFormat.format(date)
}
