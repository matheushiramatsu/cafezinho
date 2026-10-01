/**
 * Fluxo de custo mínimo (successive shortest paths com SPFA).
 * Os grafos do sorteio são pequenos (dezenas de pessoas e itens), então a
 * simplicidade vence sobre variantes assintoticamente melhores.
 */
export class MinCostFlow {
  private readonly to: number[] = []
  private readonly cap: number[] = []
  private readonly cost: number[] = []
  private readonly adjacency: number[][]
  private readonly nodeCount: number

  constructor(nodeCount: number) {
    this.nodeCount = nodeCount
    this.adjacency = Array.from({ length: nodeCount }, () => [])
  }

  /** Adiciona aresta u→v e devolve o índice dela (a reversa é índice ^ 1). */
  addEdge(from: number, to: number, capacity: number, cost: number): number {
    const index = this.to.length
    this.to.push(to, from)
    this.cap.push(capacity, 0)
    this.cost.push(cost, -cost)
    this.adjacency[from].push(index)
    this.adjacency[to].push(index + 1)
    return index
  }

  /** Quantidade de fluxo que passa pela aresta `index`. */
  flowOn(index: number): number {
    return this.cap[index ^ 1]
  }

  run(source: number, sink: number, maxFlow: number): { flow: number; cost: number } {
    let flow = 0
    let totalCost = 0
    const n = this.nodeCount
    const dist = new Array<number>(n)
    const inQueue = new Array<boolean>(n)
    const prevEdge = new Array<number>(n)
    const queue = new Int32Array(n + 1)

    while (flow < maxFlow) {
      dist.fill(Infinity)
      inQueue.fill(false)
      prevEdge.fill(-1)
      dist[source] = 0
      let head = 0
      let tail = 0
      queue[tail++] = source
      inQueue[source] = true
      while (head !== tail) {
        const u = queue[head]
        head = (head + 1) % queue.length
        inQueue[u] = false
        for (const edge of this.adjacency[u]) {
          if (this.cap[edge] <= 0) continue
          const v = this.to[edge]
          const candidate = dist[u] + this.cost[edge]
          if (candidate < dist[v]) {
            dist[v] = candidate
            prevEdge[v] = edge
            if (!inQueue[v]) {
              inQueue[v] = true
              queue[tail] = v
              tail = (tail + 1) % queue.length
            }
          }
        }
      }
      if (dist[sink] === Infinity) break

      let push = maxFlow - flow
      for (let v = sink; v !== source; v = this.to[prevEdge[v] ^ 1]) {
        push = Math.min(push, this.cap[prevEdge[v]])
      }
      for (let v = sink; v !== source; v = this.to[prevEdge[v] ^ 1]) {
        this.cap[prevEdge[v]] -= push
        this.cap[prevEdge[v] ^ 1] += push
      }
      flow += push
      totalCost += push * dist[sink]
    }
    return { flow, cost: totalCost }
  }
}
