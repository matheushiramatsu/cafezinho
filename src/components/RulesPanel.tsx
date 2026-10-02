import type { RefObject } from 'react'
import type { CoffeeItem, Participant } from '../domain/types'
import { distinctCategories, restrictionReason } from '../domain/rules'
import { normalizeKey } from '../domain/text'

interface Props {
  participants: Participant[]
  items: CoffeeItem[]
  selectedId: string | null
  selectRef: RefObject<HTMLSelectElement | null>
  onSelect: (id: string) => void
  onTogglePreferred: (participantId: string, itemId: string) => void
  onToggleRestrictedItem: (participantId: string, itemId: string) => void
  onToggleRestrictedCategory: (participantId: string, category: string) => void
}

export default function RulesPanel({
  participants,
  items,
  selectedId,
  selectRef,
  onSelect,
  onTogglePreferred,
  onToggleRestrictedItem,
  onToggleRestrictedCategory,
}: Props) {
  const selected = participants.find((p) => p.id === selectedId) ?? participants[0]

  return (
    <section className="panel rules-panel" aria-labelledby="rules-title">
      <div className="panel__head">
        <div className="panel__heading">
          <span className="section-number" aria-hidden="true">03</span>
          <div>
            <h2 id="rules-title">Cada um do seu jeito</h2>
            <p className="hint">Restrições e preferências de quem participa.</p>
          </div>
        </div>
      </div>

      {participants.length === 0 || items.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Defina as regras depois de cadastrar</p>
          <p>
            {participants.length === 0 && items.length === 0
              ? 'Cadastre participantes e itens para marcar o que cada pessoa não pode ou prefere levar.'
              : participants.length === 0
                ? 'Cadastre ao menos um participante para marcar restrições e preferências.'
                : 'Cadastre ao menos um item para marcar restrições e preferências.'}
          </p>
        </div>
      ) : (
        <RulesEditor
          participant={selected}
          participants={participants}
          items={items}
          selectRef={selectRef}
          onSelect={onSelect}
          onTogglePreferred={onTogglePreferred}
          onToggleRestrictedItem={onToggleRestrictedItem}
          onToggleRestrictedCategory={onToggleRestrictedCategory}
        />
      )}
    </section>
  )
}

function RulesEditor({
  participant,
  participants,
  items,
  selectRef,
  onSelect,
  onTogglePreferred,
  onToggleRestrictedItem,
  onToggleRestrictedCategory,
}: {
  participant: Participant
  participants: Participant[]
  items: CoffeeItem[]
  selectRef: Props['selectRef']
  onSelect: Props['onSelect']
  onTogglePreferred: Props['onTogglePreferred']
  onToggleRestrictedItem: Props['onToggleRestrictedItem']
  onToggleRestrictedCategory: Props['onToggleRestrictedCategory']
}) {
  const categories = distinctCategories([
    ...items.map((item) => item.category),
    ...participant.cannotBringCategories,
  ])
  const restrictedCategoryKeys = new Set(participant.cannotBringCategories.map(normalizeKey))

  return (
    <div className="stack-4">
      <div className="field rules__picker">
        <label htmlFor="rules-participant">Participante</label>
        <select
          ref={selectRef}
          id="rules-participant"
          className="input"
          value={participant.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          {participants.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>

      <p className="hint">
        Se um item é restrição de {participant.name}, a restrição vence: ele não pode ser marcado
        como preferência e nunca será sorteado para essa pessoa.
      </p>

      <div className="rules__grid">
        <fieldset className="fieldset">
          <legend>Prefere levar</legend>
          <ul className="checks">
            {items.map((item) => {
              const reason = restrictionReason(participant, item)
              const checked = participant.preferredItemIds.includes(item.id)
              const id = `pref-${participant.id}-${item.id}`
              return (
                <li key={item.id}>
                  <label className="check" htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      disabled={reason !== null}
                      onChange={() => onTogglePreferred(participant.id, item.id)}
                    />
                    <span className="check__text">
                      {item.name}
                      {reason && (
                        <span className="hint check__hint">
                          Bloqueado:{' '}
                          {reason === 'item'
                            ? 'é uma restrição deste item'
                            : `categoria "${item.category}" é restrição`}
                          . A restrição vence.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Não pode levar (itens)</legend>
          <ul className="checks">
            {items.map((item) => {
              const id = `cannot-${participant.id}-${item.id}`
              const byCategory =
                item.category !== undefined && restrictedCategoryKeys.has(normalizeKey(item.category))
              return (
                <li key={item.id}>
                  <label className="check" htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={participant.cannotBringItemIds.includes(item.id)}
                      onChange={() => onToggleRestrictedItem(participant.id, item.id)}
                    />
                    <span className="check__text">
                      {item.name}
                      {byCategory && (
                        <span className="hint check__hint">
                          Já bloqueado pela categoria "{item.category}".
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Não pode levar (categorias)</legend>
          {categories.length === 0 ? (
            <p className="hint">Nenhum item tem categoria. Defina categorias nos itens para usar este filtro.</p>
          ) : (
            <ul className="checks">
              {categories.map((category) => {
                const id = `cannot-cat-${participant.id}-${normalizeKey(category).replace(/\s+/gu, '-')}`
                return (
                  <li key={category}>
                    <label className="check" htmlFor={id}>
                      <input
                        id={id}
                        type="checkbox"
                        checked={restrictedCategoryKeys.has(normalizeKey(category))}
                        onChange={() => onToggleRestrictedCategory(participant.id, category)}
                      />
                      <span className="check__text">{category}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>
      </div>
    </div>
  )
}
