import { useRef, useState, type KeyboardEvent } from 'react'
import type { DrawSnapshot } from '../domain/types'
import { plural } from '../domain/text'
import { byItem, byPerson } from '../domain/view'

type Tab = 'person' | 'item'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'person', label: 'Por pessoa' },
  { id: 'item', label: 'Por item' },
]

/** Visões do resultado em abas. `idPrefix` evita colisão de ids entre instâncias. */
export default function ResultTabs({
  snapshot,
  idPrefix,
}: {
  snapshot: DrawSnapshot
  idPrefix: string
}) {
  const [active, setActive] = useState<Tab>('person')
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ person: null, item: null })

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === active)
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }
    const next = targets[event.key]
    if (next === undefined) return
    event.preventDefault()
    setActive(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }

  const people = byPerson(snapshot)
  const items = byItem(snapshot)

  return (
    <div className="tabs">
      <div
        className="tabs__list"
        role="tablist"
        aria-label="Visões do resultado"
        onKeyDown={onKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={active === tab.id}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`${idPrefix}-panel-person`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-person`}
        className="tabs__panel"
        hidden={active !== 'person'}
        data-print-title="Por pessoa"
      >
        <ul className="result-list">
          {people.map((row) => (
            <li key={row.participantId} className="result-row">
              <div className="result-row__head">
                <h3>{row.name}</h3>
                <span className="meta">
                  {row.itemNames.length} {plural(row.itemNames.length, 'item', 'itens')}
                </span>
              </div>
              {row.itemNames.length === 0 ? (
                <p className="meta">Nada desta vez.</p>
              ) : (
                <ul className="chips" aria-label={`Itens de ${row.name}`}>
                  {row.itemNames.map((name) => (
                    <li key={name} className="chip">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div
        id={`${idPrefix}-panel-item`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-item`}
        className="tabs__panel"
        hidden={active !== 'item'}
        data-print-title="Por item"
      >
        <ul className="result-list">
          {items.map((row) => (
            <li key={row.itemId} className="result-row">
              <div className="result-row__head">
                <h3>{row.name}</h3>
                <span className="meta">
                  {row.quantity} {plural(row.quantity, 'pessoa', 'pessoas')}
                  {row.category ? ` · ${row.category}` : ''}
                </span>
              </div>
              <ul className="chips" aria-label={`Quem leva ${row.name}`}>
                {row.participantNames.map((name) => (
                  <li key={name} className="chip">
                    {name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
