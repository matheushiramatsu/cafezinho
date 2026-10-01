import { useEffect, useRef, useState } from 'react'
import type { DrawSnapshot } from '../domain/types'
import { computeStats } from '../domain/draw'
import { copyText } from '../domain/clipboard'
import { formatDateLong } from '../domain/date'
import { plural } from '../domain/text'
import { formatShareText } from '../domain/view'
import Icon from './Icon'
import ResultTabs from './ResultTabs'

interface Props {
  result: DrawSnapshot | null
  invalidated: boolean
  /** Nota sobre o sorteio recém-feito (ex.: repetições evitadas). */
  runNote: string | null
  onClear: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export default function ResultPanel({ result, invalidated, runNote, onClear }: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    if (!result) return
    const ok = await copyText(formatShareText(result))
    setCopyState(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    if (ok) timer.current = window.setTimeout(() => setCopyState('idle'), 4000)
    else window.setTimeout(() => fallbackRef.current?.select(), 0)
  }

  return (
    <section className="panel result" aria-labelledby="result-title">
      <div className="panel__head result__head">
        <div>
          <h2 id="result-title" tabIndex={-1}>
            Resultado
          </h2>
          {result && <p className="result__date">{formatDateLong(result.coffeeDate)}</p>}
        </div>
        {result && (
          <div className="result__actions" role="group" aria-label="Ações do resultado">
            <button type="button" className="btn" onClick={copy}>
              <Icon name={copyState === 'copied' ? 'check' : 'copy'} />
              {copyState === 'copied' ? 'Copiado' : 'Copiar texto'}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              <Icon name="printer" />
              Imprimir
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClear}>
              <Icon name="undo" />
              Limpar resultado
            </button>
          </div>
        )}
      </div>

      <p className="sr-only" role="status">
        {copyState === 'copied' && 'Resultado copiado para a área de transferência.'}
      </p>

      {copyState === 'copied' && (
        <p className="notice notice--success" aria-hidden="true">
          <Icon name="check" size={16} />
          Texto copiado: cole no WhatsApp ou no Slack.
        </p>
      )}
      {copyState === 'failed' && result && (
        <div className="notice notice--danger" role="alert">
          <p>Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.</p>
          <textarea
            ref={fallbackRef}
            className="input textarea"
            readOnly
            rows={8}
            aria-label="Texto do resultado para copiar"
            value={formatShareText(result)}
          />
        </div>
      )}

      {result ? (
        <>
          <ResultSummary result={result} runNote={runNote} />
          <ResultTabs key={result.id} snapshot={result} idPrefix="result" />
        </>
      ) : (
        <div className="empty">
          <p className="empty__title">
            {invalidated ? 'Resultado descartado' : 'Nenhum resultado ainda'}
          </p>
          <p>
            {invalidated
              ? 'Você alterou participantes, itens, regras ou a data, então o resultado anterior não vale mais. Ele continua salvo no histórico. Sorteie de novo quando estiver pronto.'
              : 'Cadastre participantes e itens, escolha a data do café e use o botão Sortear. O resultado aparece aqui.'}
          </p>
        </div>
      )}
    </section>
  )
}

function ResultSummary({ result, runNote }: { result: DrawSnapshot; runNote: string | null }) {
  const stats = computeStats(result.participants, result.items, result.assignments)
  const hasPreferences = result.participants.some((p) => p.preferredItemIds.length > 0)
  const load =
    stats.minLoad === stats.maxLoad
      ? `${stats.maxLoad} ${plural(stats.maxLoad, 'item', 'itens')} por pessoa`
      : `de ${stats.minLoad} a ${stats.maxLoad} itens por pessoa`
  return (
    <p className="meta result__stats">
      {stats.totalAssignments} {plural(stats.totalAssignments, 'atribuição', 'atribuições')} · {load}
      {hasPreferences &&
        ` · ${stats.preferenceHits} ${plural(stats.preferenceHits, 'preferência atendida', 'preferências atendidas')}`}
      {runNote ? ` · ${runNote}` : ''}
    </p>
  )
}
