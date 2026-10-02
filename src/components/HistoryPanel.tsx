import { useState } from 'react'
import type { DrawSnapshot } from '../domain/types'
import { copyText } from '../domain/clipboard'
import { formatDateLong, formatDateShort, formatTimestamp } from '../domain/date'
import { plural } from '../domain/text'
import { byPerson, formatShareText } from '../domain/view'
import Icon from './Icon'

interface Props {
  history: DrawSnapshot[]
  onShow: (id: string) => void
  announce: (message: string) => void
}

export default function HistoryPanel({ history, onShow, announce }: Props) {
  return (
    <section id="historico" className="panel" aria-labelledby="history-title">
      <div className="panel__head">
        <h2 id="history-title">Histórico</h2>
        <p className="meta">
          {history.length} {plural(history.length, 'sorteio salvo', 'sorteios salvos')}
        </p>
      </div>

      {history.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Nenhum sorteio salvo</p>
          <p>Cada sorteio concluído fica guardado aqui, com os nomes e itens daquele dia.</p>
        </div>
      ) : (
        <ul className="rows" aria-label="Sorteios anteriores">
          {history.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              onShow={onShow}
              announce={announce}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function HistoryRow({
  entry,
  onShow,
  announce,
}: {
  entry: DrawSnapshot
  onShow: Props['onShow']
  announce: Props['announce']
}) {
  const [open, setOpen] = useState(false)
  const detailsId = `history-details-${entry.id}`

  async function copy() {
    const ok = await copyText(formatShareText(entry))
    announce(
      ok
        ? `Sorteio de ${formatDateShort(entry.coffeeDate)} copiado.`
        : 'Não foi possível copiar. Abra o resultado e copie o texto manualmente.',
    )
  }

  const people = byPerson(entry)

  return (
    <li className="row row--history">
      <div className="row__line">
        <div className="row__main">
          <p className="row__title">{formatDateLong(entry.coffeeDate)}</p>
          <p className="meta">
            Sorteado em {formatTimestamp(entry.createdAt)} · {entry.participants.length}{' '}
            {plural(entry.participants.length, 'pessoa', 'pessoas')} · {entry.items.length}{' '}
            {plural(entry.items.length, 'item', 'itens')}
          </p>
        </div>
        <div className="row__actions">
          <button
            type="button"
            className="btn btn--ghost"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
          >
            <Icon name="chevron" />
            <span className="btn__text">{open ? 'Ocultar' : 'Detalhes'}</span>
            <span className="sr-only">
              {' '}
              do sorteio de {formatDateShort(entry.coffeeDate)}
            </span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              onShow(entry.id)
              announce(`Sorteio de ${formatDateShort(entry.coffeeDate)} aberto em Resultado.`)
            }}
            aria-label={`Ver sorteio de ${formatDateShort(entry.coffeeDate)} no resultado`}
          >
            <Icon name="eye" />
            <span className="btn__text">Ver</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={copy}
            aria-label={`Copiar texto do sorteio de ${formatDateShort(entry.coffeeDate)}`}
          >
            <Icon name="copy" />
            <span className="btn__text">Copiar</span>
          </button>
        </div>
      </div>
      {open && (
        <ul id={detailsId} className="history__details">
          {people.map((row) => (
            <li key={row.participantId}>
              <strong>{row.name}:</strong>{' '}
              {row.itemNames.length ? row.itemNames.join(', ') : 'nada desta vez'}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
