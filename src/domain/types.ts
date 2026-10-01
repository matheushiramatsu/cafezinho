export interface Participant {
  id: string
  name: string
  cannotBringItemIds: string[]
  cannotBringCategories: string[]
  preferredItemIds: string[]
}

export interface CoffeeItem {
  id: string
  name: string
  quantity: number
  category?: string
}

export interface Assignment {
  participantId: string
  itemId: string
}

export interface DrawSnapshot {
  id: string
  /** Data do café em formato local `YYYY-MM-DD`. */
  coffeeDate: string
  /** Momento do sorteio em ISO 8601. */
  createdAt: string
  participants: Participant[]
  items: CoffeeItem[]
  assignments: Assignment[]
}

export interface AppData {
  participants: Participant[]
  items: CoffeeItem[]
  coffeeDate: string
  /** Mais recente primeiro. */
  history: DrawSnapshot[]
}
