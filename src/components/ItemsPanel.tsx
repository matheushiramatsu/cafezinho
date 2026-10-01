import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CoffeeItem } from '../domain/types'
import { MAX_NAME_LENGTH, MAX_QUANTITY } from '../domain/limits'
import { distinctCategories } from '../domain/rules'
import { plural } from '../domain/text'
import Icon from './Icon'

interface Props {
  items: CoffeeItem[]
  onAdd: (name: string, quantity: string, category: string) => ItemErrors | null
  onUpdate: (id: string, name: string, quantity: string, category: string) => ItemErrors | null
  onRemove: (id: string) => void
}

export interface ItemErrors {
  name?: string
  quantity?: string
}

export default function ItemsPanel({ items, onAdd, onUpdate, onRemove }: Props) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [category, setCategory] = useState('')
  const [errors, setErrors] = useState<ItemErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const categories = distinctCategories(items.map((item) => item.category))
  const total = items.reduce((sum, item) => sum + item.quantity, 0)

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = onAdd(name, quantity, category)
    setErrors(problem ?? {})
    if (!problem) {
      setName('')
      setQuantity('1')
      setCategory('')
      nameRef.current?.focus()
    } else if (problem.name) nameRef.current?.focus()
    else quantityRef.current?.focus()
  }

  return (
    <section className="panel" aria-labelledby="items-title">
      <div className="panel__head">
        <h2 id="items-title">Itens do café</h2>
        <p className="meta">
          {items.length} {plural(items.length, 'item', 'itens')} · {total}{' '}
          {plural(total, 'unidade', 'unidades')}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="stack-3">
        <div className="item-form">
          <div className="field item-form__name">
            <label htmlFor="item-name">Novo item</label>
            <input
              ref={nameRef}
              id="item-name"
              type="text"
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH + 20}
              autoComplete="off"
              placeholder="Ex.: Pão de queijo"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'item-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
            />
          </div>
          <div className="field item-form__qty">
            <label htmlFor="item-quantity">Quantidade</label>
            <input
              ref={quantityRef}
              id="item-quantity"
              type="number"
              inputMode="numeric"
              className="input"
              min={1}
              max={MAX_QUANTITY}
              step={1}
              value={quantity}
              aria-invalid={errors.quantity ? true : undefined}
              aria-describedby={errors.quantity ? 'item-quantity-error' : 'item-quantity-hint'}
              onChange={(event) => {
                setQuantity(event.target.value)
                if (errors.quantity) setErrors({ ...errors, quantity: undefined })
              }}
            />
          </div>
          <div className="field item-form__category">
            <label htmlFor="item-category">
              Categoria <span className="optional">(opcional)</span>
            </label>
            <input
              id="item-category"
              type="text"
              className="input"
              value={category}
              list="item-categories"
              autoComplete="off"
              placeholder="Ex.: Bebidas"
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id="item-categories">
              {categories.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
          <button type="submit" className="btn btn--primary item-form__submit">
            <Icon name="plus" />
            Adicionar
          </button>
        </div>
        <p id="item-quantity-hint" className="hint">
          Quantidade = quantas pessoas diferentes levam o item (cada pessoa leva no máximo uma
          unidade).
        </p>
        {errors.name && (
          <p id="item-name-error" className="field-error" role="alert">
            <Icon name="alert" size={16} />
            {errors.name}
          </p>
        )}
        {errors.quantity && (
          <p id="item-quantity-error" className="field-error" role="alert">
            <Icon name="alert" size={16} />
            {errors.quantity}
          </p>
        )}
      </form>

      {items.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Nenhum item cadastrado</p>
          <p>Adicione o que entra no café (pão, suco, frutas) e quantas pessoas levam cada um.</p>
        </div>
      ) : (
        <ul className="rows" aria-label="Lista de itens">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              categories={categories}
              onUpdate={onUpdate}
              onRemove={(id) => {
                onRemove(id)
                nameRef.current?.focus()
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

type Mode = 'view' | 'edit' | 'confirm'

function ItemRow({
  item,
  categories,
  onUpdate,
  onRemove,
}: {
  item: CoffeeItem
  categories: string[]
  onUpdate: Props['onUpdate']
  onRemove: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode>('view')
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [category, setCategory] = useState(item.category ?? '')
  const [errors, setErrors] = useState<ItemErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousMode = useRef<Mode>('view')

  useEffect(() => {
    if (previousMode.current === mode) return
    previousMode.current = mode
    if (mode === 'edit') nameRef.current?.focus()
    else if (mode === 'confirm') cancelRef.current?.focus()
    else editRef.current?.focus()
  }, [mode])

  function startEdit() {
    setName(item.name)
    setQuantity(String(item.quantity))
    setCategory(item.category ?? '')
    setErrors({})
    setMode('edit')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const problem = onUpdate(item.id, name, quantity, category)
    if (problem) {
      setErrors(problem)
      if (problem.name) nameRef.current?.focus()
      else quantityRef.current?.focus()
      return
    }
    setMode('view')
  }

  if (mode === 'edit') {
    const listId = `edit-categories-${item.id}`
    return (
      <li className="row row--editing">
        <form
          onSubmit={save}
          noValidate
          className="row__form"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMode('view')
          }}
        >
          <div className="item-form">
            <div className="field item-form__name">
              <label htmlFor={`item-edit-name-${item.id}`}>Nome do item</label>
              <input
                ref={nameRef}
                id={`item-edit-name-${item.id}`}
                className="input"
                type="text"
                value={name}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `item-edit-name-error-${item.id}` : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  if (errors.name) setErrors({ ...errors, name: undefined })
                }}
              />
            </div>
            <div className="field item-form__qty">
              <label htmlFor={`item-edit-qty-${item.id}`}>Quantidade</label>
              <input
                ref={quantityRef}
                id={`item-edit-qty-${item.id}`}
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QUANTITY}
                step={1}
                value={quantity}
                aria-invalid={errors.quantity ? true : undefined}
                aria-describedby={errors.quantity ? `item-edit-qty-error-${item.id}` : undefined}
                onChange={(event) => {
                  setQuantity(event.target.value)
                  if (errors.quantity) setErrors({ ...errors, quantity: undefined })
                }}
              />
            </div>
            <div className="field item-form__category">
              <label htmlFor={`item-edit-category-${item.id}`}>
                Categoria <span className="optional">(opcional)</span>
              </label>
              <input
                id={`item-edit-category-${item.id}`}
                className="input"
                type="text"
                list={listId}
                value={category}
                autoComplete="off"
                onChange={(event) => setCategory(event.target.value)}
              />
              <datalist id={listId}>
                {categories.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </div>
          </div>
          {errors.name && (
            <p id={`item-edit-name-error-${item.id}`} className="field-error" role="alert">
              <Icon name="alert" size={16} />
              {errors.name}
            </p>
          )}
          {errors.quantity && (
            <p id={`item-edit-qty-error-${item.id}`} className="field-error" role="alert">
              <Icon name="alert" size={16} />
              {errors.quantity}
            </p>
          )}
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
          Excluir <strong>{item.name}</strong>? Restrições e preferências ligadas a ele serão
          removidas.
        </p>
        <div className="row__actions">
          <button type="button" className="btn btn--danger" onClick={() => onRemove(item.id)}>
            <Icon name="trash" />
            Excluir
          </button>
          <button ref={cancelRef} type="button" className="btn" onClick={() => setMode('view')}>
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
        <p className="row__title">
          {item.name}
          <span className="badge">
            <span className="sr-only">Quantidade: </span>× {item.quantity}
          </span>
        </p>
        <p className="meta">{item.category ? `Categoria: ${item.category}` : 'Sem categoria'}</p>
      </div>
      <div className="row__actions">
        <button
          ref={editRef}
          type="button"
          className="btn btn--ghost"
          onClick={startEdit}
          aria-label={`Editar ${item.name}`}
        >
          <Icon name="pencil" />
          <span className="btn__text">Editar</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--danger-text"
          onClick={() => setMode('confirm')}
          aria-label={`Excluir ${item.name}`}
        >
          <Icon name="trash" />
          <span className="btn__text">Excluir</span>
        </button>
      </div>
    </li>
  )
}
