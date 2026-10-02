import { useEffect, useRef, useState } from 'react'
import type { DrawSnapshot } from '../domain/types'
import { copyText } from '../domain/clipboard'
import { formatDateLong, formatDateShort, formatTimestamp } from '../domain/date'
import { plural } from '../domain/text'
import { byPerson, formatShareText } from '../domain/view'
import Icon from './Icon'

interface Props {
  history: DrawSnapshot[]
  onShow: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  announce: (message: string) => void
}

export default function HistoryPanel({ history, onShow, onRemove, onClear, announce }: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirmClear) cancelRef.current?.focus()
    else if (wasConfirming.current) clearRef.current?.focus()
    wasConfirming.current = confirmClear
  }, [confirmClear])

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
        <>
          <ul className="rows" aria-label="Sorteios anteriores">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onShow={onShow}
                onRemove={onRemove}
                announce={announce}
              />
            ))}
          </ul>
          <div className="history__footer">
            {confirmClear ? (
              <div className="row row--confirm">
                <p className="row__confirm-text" role="alert">
                  Apagar os {history.length} sorteios do histórico? Cadastros não mudam.
                </p>
                <div className="row__actions">
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => {
                      onClear()
                      setConfirmClear(false)
                    }}
                  >
                    <Icon name="trash" />
                    Apagar histórico
                  </button>
                  <button
                    ref={cancelRef}
                    type="button"
                    className="btn"
                    onClick={() => setConfirmClear(false)}
                  >
                    <Icon name="x" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={clearRef}
                type="button"
                className="btn btn--ghost btn--danger-text"
                onClick={() => setConfirmClear(true)}
              >
                <Icon name="trash" />
                Limpar histórico
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function HistoryRow({
  entry,
  onShow,
  onRemove,
  announce,
}: {
  entry: DrawSnapshot
  onShow: Props['onShow']
  onRemove: Props['onRemove']
  announce: Props['announce']
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  const detailsId = `history-details-${entry.id}`

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) removeRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

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
        {confirming ? (
          <div className="row__actions">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                onRemove(entry.id)
                announce(`Sorteio de ${formatDateShort(entry.coffeeDate)} excluído do histórico.`)
              }}
            >
              <Icon name="trash" />
              Confirmar exclusão
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="btn"
              onClick={() => setConfirming(false)}
            >
              <Icon name="x" />
              Cancelar
            </button>
          </div>
        ) : (
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
            <button
              ref={removeRef}
              type="button"
              className="btn btn--ghost btn--danger-text"
              onClick={() => setConfirming(true)}
              aria-label={`Excluir sorteio de ${formatDateShort(entry.coffeeDate)}`}
            >
              <Icon name="trash" />
              <span className="btn__text">Excluir</span>
            </button>
          </div>
        )}
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
