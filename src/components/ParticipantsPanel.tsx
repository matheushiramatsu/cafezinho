import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Participant } from '../domain/types'
import { MAX_NAME_LENGTH } from '../domain/limits'
import { plural } from '../domain/text'
import Icon from './Icon'

interface Props {
  participants: Participant[]
  onAdd: (name: string) => string | null
  onImport: (text: string) => string
  onRename: (id: string, name: string) => string | null
  onRemove: (id: string) => void
  onOpenRules: (id: string) => void
}

function rulesSummary(participant: Participant): string {
  const restrictions =
    participant.cannotBringItemIds.length + participant.cannotBringCategories.length
  const preferences = participant.preferredItemIds.length
  if (restrictions === 0 && preferences === 0) return 'Sem regras'
  const parts: string[] = []
  if (restrictions > 0) parts.push(`${restrictions} ${plural(restrictions, 'restrição', 'restrições')}`)
  if (preferences > 0) parts.push(`${preferences} ${plural(preferences, 'preferência', 'preferências')}`)
  return parts.join(' · ')
}

export default function ParticipantsPanel({
  participants,
  onAdd,
  onImport,
  onRename,
  onRemove,
  onOpenRules,
}: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = onAdd(name)
    setError(problem)
    if (!problem) setName('')
    addInputRef.current?.focus()
  }

  function submitImport(event: FormEvent) {
    event.preventDefault()
    if (!importText.trim()) {
      setImportMessage('Cole ao menos um nome, um por linha.')
      return
    }
    setImportMessage(onImport(importText))
    setImportText('')
  }

  return (
    <section className="panel" aria-labelledby="participants-title">
      <div className="panel__head">
        <h2 id="participants-title">Participantes</h2>
        <p className="meta">
          {participants.length} {plural(participants.length, 'pessoa', 'pessoas')}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="stack-3">
        <div className="field">
          <label htmlFor="participant-name">Novo participante</label>
          <div className="inline-form">
            <input
              ref={addInputRef}
              id="participant-name"
              type="text"
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH + 20}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'participant-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError(null)
              }}
              placeholder="Ex.: Ana Souza"
            />
            <button type="submit" className="btn btn--primary">
              <Icon name="plus" />
              Adicionar
            </button>
          </div>
          {error && (
            <p id="participant-name-error" className="field-error" role="alert">
              <Icon name="alert" size={16} />
              {error}
            </p>
          )}
        </div>
      </form>

      <details className="disclosure">
        <summary>
          <Icon name="upload" size={16} />
          Importar lista de nomes
          <Icon name="chevron" size={16} />
        </summary>
        <form onSubmit={submitImport} noValidate className="stack-3">
          <div className="field">
            <label htmlFor="participant-import">Um nome por linha</label>
            <textarea
              id="participant-import"
              className="input textarea"
              rows={5}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              aria-describedby="participant-import-hint"
              placeholder={'Ana Souza\nBruno Lima\nCarla Dias'}
            />
            <p id="participant-import-hint" className="hint">
              Linhas vazias e nomes repetidos (mesmo com outra caixa, acento ou espaços) são
              ignorados, inclusive os já cadastrados.
            </p>
          </div>
          <div>
            <button type="submit" className="btn">
              <Icon name="upload" />
              Importar nomes
            </button>
          </div>
          {importMessage && (
            <p className="notice notice--info" role="status">
              {importMessage}
            </p>
          )}
        </form>
      </details>

      {participants.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Ninguém na lista ainda</p>
          <p>Adicione um nome acima ou importe uma lista. Depois, cadastre os itens ao lado.</p>
        </div>
      ) : (
        <ul className="rows" aria-label="Lista de participantes">
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              onRename={onRename}
              onRemove={(id) => {
                onRemove(id)
                addInputRef.current?.focus()
              }}
              onOpenRules={onOpenRules}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

type Mode = 'view' | 'edit' | 'confirm'

function ParticipantRow({
  participant,
  onRename,
  onRemove,
  onOpenRules,
}: {
  participant: Participant
  onRename: (id: string, name: string) => string | null
  onRemove: (id: string) => void
  onOpenRules: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(participant.name)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousMode = useRef<Mode>('view')

  useEffect(() => {
    if (previousMode.current === mode) return
    previousMode.current = mode
    if (mode === 'edit') inputRef.current?.focus()
    else if (mode === 'confirm') cancelRef.current?.focus()
    else editRef.current?.focus()
  }, [mode])

  function startEdit() {
    setDraft(participant.name)
    setError(null)
    setMode('edit')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const problem = onRename(participant.id, draft)
    if (problem) {
      setError(problem)
      inputRef.current?.focus()
      return
    }
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <li className="row row--editing">
        <form onSubmit={save} noValidate className="row__form">
          <div className="field">
            <label htmlFor={`rename-${participant.id}`}>Nome de {participant.name}</label>
            <input
              ref={inputRef}
              id={`rename-${participant.id}`}
              className="input"
              type="text"
              value={draft}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `rename-error-${participant.id}` : undefined}
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setMode('view')
              }}
            />
            {error && (
              <p id={`rename-error-${participant.id}`} className="field-error" role="alert">
                <Icon name="alert" size={16} />
                {error}
              </p>
            )}
          </div>
          <div className="row__actions">
            <button type="submit" className="btn btn--primary">
              <Icon name="check" />
              Salvar
            </button>
            <button type="button" className="btn" onClick={() => setMode('view')}>
              <Icon name="x" />
              Cancelar
            </button>
          </div>
        </form>
      </li>
    )
  }

  if (mode === 'confirm') {
    return (
      <li className="row row--confirm">
        <p className="row__confirm-text" role="alert">
          Excluir <strong>{participant.name}</strong>? As regras dele também serão removidas.
        </p>
        <div className="row__actions">
          <button type="button" className="btn btn--danger" onClick={() => onRemove(participant.id)}>
            <Icon name="trash" />
            Excluir
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            onClick={() => setMode('view')}
          >
            <Icon name="x" />
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="row">
      <div className="row__main">
        <p className="row__title">{participant.name}</p>
        <p className="meta">{rulesSummary(participant)}</p>
      </div>
      <div className="row__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onOpenRules(participant.id)}
          aria-label={`Regras de ${participant.name}`}
        >
          <Icon name="sliders" />
          <span className="btn__text">Regras</span>
        </button>
        <button
          ref={editRef}
          type="button"
          className="btn btn--ghost"
          onClick={startEdit}
          aria-label={`Renomear ${participant.name}`}
        >
          <Icon name="pencil" />
          <span className="btn__text">Renomear</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--danger-text"
          onClick={() => setMode('confirm')}
          aria-label={`Excluir ${participant.name}`}
        >
          <Icon name="trash" />
          <span className="btn__text">Excluir</span>
        </button>
      </div>
    </li>
  )
}
