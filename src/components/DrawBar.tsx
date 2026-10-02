import type { FormEvent } from 'react'
import type { DrawError } from '../domain/draw'
import { MAX_YEAR, MIN_YEAR } from '../domain/date'
import Icon from './Icon'

interface Props {
  date: string
  participantCount: number
  itemCount: number
  unitCount: number
  hasResult: boolean
  dateError: string | null
  drawError: DrawError | null
  onDateChange: (value: string) => void
  onDraw: () => void
}

export default function DrawBar({
  date,
  participantCount,
  itemCount,
  unitCount,
  hasResult,
  dateError,
  drawError,
  onDateChange,
  onDraw,
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onDraw()
  }

  return (
    <section className="drawbar" aria-labelledby="draw-title">
      <div className="drawbar__heading">
        <p className="drawbar__eyebrow">Sorteio</p>
        <h2 id="draw-title">Próximo café</h2>
      </div>
      <dl id="draw-summary" className="drawbar__counts">
        <div><dt>Pessoas</dt><dd>{participantCount.toString().padStart(2, '0')}</dd></div>
        <div><dt>Itens</dt><dd>{itemCount.toString().padStart(2, '0')}</dd></div>
        <div><dt>Unidades</dt><dd>{unitCount.toString().padStart(2, '0')}</dd></div>
      </dl>
      <form onSubmit={submit} noValidate className="drawbar__form">
        <div className="field drawbar__date">
          <label htmlFor="coffee-date">
            Data do café <span className="sr-only">(obrigatória)</span>
          </label>
          <input
            id="coffee-date"
            type="date"
            className="input"
            required
            min={`${MIN_YEAR}-01-01`}
            max={`${MAX_YEAR}-12-31`}
            value={date}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? 'coffee-date-error' : 'draw-summary'}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary btn--lg drawbar__cta">
          <Icon name="shuffle" size={20} />
          {hasResult ? 'Sortear novamente' : 'Sortear o café'}
        </button>
      </form>
      <p className="drawbar__summary">O resultado fica salvo no histórico.</p>
      {dateError && (
        <p id="coffee-date-error" className="field-error" role="alert">
          <Icon name="alert" size={16} />
          {dateError}
        </p>
      )}
      {drawError && (
        <div className="notice notice--danger" role="alert">
          <p className="notice__title">
            <Icon name="alert" size={18} />
            Não foi possível sortear
          </p>
          <p>{drawError.message}</p>
          {drawError.details.length > 0 && (
            <ul className="notice__list">
              {drawError.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {drawError.code === 'impossible' && (
            <p className="notice__hint">
              O resultado atual e o histórico não foram alterados. Ajuste a quantidade, remova
              restrições ou adicione participantes e tente de novo.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
