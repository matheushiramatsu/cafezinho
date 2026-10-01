import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import eslLogo from './assets/esl-logo-branca.png'
import DrawBar from './components/DrawBar'
import HistoryPanel from './components/HistoryPanel'
import Icon from './components/Icon'
import ItemsPanel, { type ItemErrors } from './components/ItemsPanel'
import ParticipantsPanel from './components/ParticipantsPanel'
import ResultPanel from './components/ResultPanel'
import RulesPanel from './components/RulesPanel'
import ThemeToggle from './components/ThemeToggle'
import { runDraw, type DrawError } from './domain/draw'
import { formatDateLong, formatDateShort } from './domain/date'
import { makeId } from './domain/ids'
import {
  describeImport,
  parseQuantity,
  planImport,
  validateItemName,
  validateParticipantName,
} from './domain/registry'
import { isRestricted } from './domain/rules'
import { createState, reducer, referenceAssignments } from './domain/state'
import { loadData } from './domain/storage'
import { collapseSpaces, normalizeKey } from './domain/text'
import { usePersistence } from './hooks/usePersistence'
import { useTheme } from './hooks/useTheme'

interface RunNote {
  id: string
  text: string
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export default function App() {
  const [boot] = useState(() => loadData())
  const [state, dispatch] = useReducer(reducer, boot.data, createState)
  const [theme, setTheme] = useTheme()
  const [bootNotice, setBootNotice] = useState(boot.notice)
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 })
  const [rulesFor, setRulesFor] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [drawError, setDrawError] = useState<DrawError | null>(null)
  const [runNote, setRunNote] = useState<RunNote | null>(null)
  const rulesSelectRef = useRef<HTMLSelectElement>(null)
  const focusResultNext = useRef(false)

  const { participants, items, coffeeDate, history, result, invalidated } = state

  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ text, count: previous.count + 1 }))
  }, [])

  // Persistência: cadastros, data, histórico e o id do resultado atual (restaurado do histórico).
  const storageProblem = usePersistence({
    participants,
    items,
    coffeeDate,
    history,
    currentResultId: result?.id ?? null,
  })

  // Depois de sortear, leva o foco para o resultado.
  useEffect(() => {
    if (!focusResultNext.current || !result) return
    focusResultNext.current = false
    const heading = document.getElementById('result-title')
    heading?.focus()
    heading?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [result])

  /** Qualquer edição apaga erros de sorteio antigos, que podem não valer mais. */
  const edit = useCallback((action: Parameters<typeof dispatch>[0]) => {
    dispatch(action)
    setDrawError(null)
    setDateError(null)
  }, [])

  // --- Participantes -------------------------------------------------------
  function addParticipant(name: string): string | null {
    const problem = validateParticipantName(name, participants)
    if (problem) return problem
    edit({ type: 'addParticipant', id: makeId(), name })
    announce(`${collapseSpaces(name)} adicionado aos participantes.`)
    return null
  }

  function importParticipants(text: string): string {
    const plan = planImport(participants, text, makeId)
    if (plan.added.length > 0) edit({ type: 'importParticipants', participants: plan.added })
    const message = describeImport(plan)
    announce(message)
    return message
  }

  function renameParticipant(id: string, name: string): string | null {
    const problem = validateParticipantName(name, participants, id)
    if (problem) return problem
    edit({ type: 'renameParticipant', id, name })
    announce(`Participante renomeado para ${collapseSpaces(name)}.`)
    return null
  }

  function removeParticipant(id: string) {
    const target = participants.find((p) => p.id === id)
    edit({ type: 'removeParticipant', id })
    if (target) announce(`${target.name} excluído.`)
  }

  // --- Itens ---------------------------------------------------------------
  function validateItem(
    name: string,
    quantity: string,
    exceptId?: string,
  ): { errors: ItemErrors | null; quantity: number } {
    const errors: ItemErrors = {}
    const nameProblem = validateItemName(name, items, exceptId)
    if (nameProblem) errors.name = nameProblem
    const parsed = parseQuantity(quantity)
    if (!parsed.ok) errors.quantity = parsed.error
    return {
      errors: errors.name || errors.quantity ? errors : null,
      quantity: parsed.ok ? parsed.value : 0,
    }
  }

  function addItem(name: string, quantity: string, category: string): ItemErrors | null {
    const checked = validateItem(name, quantity)
    if (checked.errors) return checked.errors
    edit({ type: 'addItem', id: makeId(), name, quantity: checked.quantity, category })
    announce(`${collapseSpaces(name)} adicionado aos itens.`)
    return null
  }

  function updateItem(id: string, name: string, quantity: string, category: string) {
    const checked = validateItem(name, quantity, id)
    if (checked.errors) return checked.errors
    edit({ type: 'updateItem', id, name, quantity: checked.quantity, category })
    announce(`${collapseSpaces(name)} atualizado.`)
    return null
  }

  function removeItem(id: string) {
    const target = items.find((i) => i.id === id)
    edit({ type: 'removeItem', id })
    if (target) announce(`${target.name} excluído.`)
  }

  // --- Regras --------------------------------------------------------------
  function openRules(id: string) {
    setRulesFor(id)
    const target = rulesSelectRef.current ?? document.getElementById('rules-title')
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      if (target instanceof HTMLSelectElement) target.focus({ preventScroll: true })
    }
  }

  function toggleRestrictedItem(participantId: string, itemId: string) {
    const person = participants.find((p) => p.id === participantId)
    const item = items.find((i) => i.id === itemId)
    if (person && item && !person.cannotBringItemIds.includes(itemId) && person.preferredItemIds.includes(itemId)) {
      announce(`Restrição vence: ${item.name} deixou de ser preferência de ${person.name}.`)
    }
    edit({ type: 'toggleRestrictedItem', participantId, itemId })
  }

  function toggleRestrictedCategory(participantId: string, category: string) {
    const person = participants.find((p) => p.id === participantId)
    if (person) {
      const key = normalizeKey(category)
      const adding = !person.cannotBringCategories.some((c) => normalizeKey(c) === key)
      const lost = items.filter(
        (item) =>
          adding &&
          item.category !== undefined &&
          normalizeKey(item.category) === key &&
          person.preferredItemIds.includes(item.id) &&
          !isRestricted(person, item),
      )
      if (lost.length > 0) {
        announce(
          `Restrição vence: ${lost.map((i) => i.name).join(', ')} deixou de ser preferência de ${person.name}.`,
        )
      }
    }
    edit({ type: 'toggleRestrictedCategory', participantId, category })
  }

  // --- Sorteio -------------------------------------------------------------
  function draw() {
    setDateError(null)
    setDrawError(null)
    if (!coffeeDate) {
      const message = 'Escolha a data do café para sortear.'
      setDateError(message)
      announce(message)
      document.getElementById('coffee-date')?.focus()
      return
    }
    const previous = referenceAssignments(state)
    const outcome = runDraw({
      participants,
      items,
      coffeeDate,
      previous,
      id: makeId(),
      now: new Date(),
    })
    if (!outcome.ok) {
      if (outcome.error.code === 'invalid-date') {
        setDateError(outcome.error.message)
        document.getElementById('coffee-date')?.focus()
      } else {
        setDrawError(outcome.error)
      }
      announce(`Não foi possível sortear. ${outcome.error.message}`)
      return
    }
    focusResultNext.current = true
    dispatch({ type: 'drawSucceeded', snapshot: outcome.snapshot })
    setRunNote(
      previous.length === 0
        ? null
        : {
            id: outcome.snapshot.id,
            text:
              outcome.stats.repeats === 0
                ? 'nenhum par repetido do sorteio anterior'
                : `${outcome.stats.repeats} ${outcome.stats.repeats === 1 ? 'par repetido' : 'pares repetidos'} do sorteio anterior (mínimo possível com as regras)`,
          },
    )
    announce(
      `Sorteio concluído para ${formatDateLong(coffeeDate)} e salvo no histórico. ${outcome.snapshot.assignments.length} atribuições.`,
    )
  }

  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const visibleRunNote = runNote && result && runNote.id === result.id ? runNote.text : null

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>

      <header className="topbar">
        <div className="topbar__inner">
          <p className="brand">
            <img className="brand__logo" src={eslLogo} alt="ESL" width={69} height={32} />
            <span className="brand__name">Cafezinho ESL</span>
          </p>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
      </header>

      <main id="main" className="container">
        <p className="print-brand">Cafezinho ESL</p>
        <section className="intro" aria-labelledby="intro-title">
          <h1 id="intro-title">Quem leva o quê no café?</h1>
          <p className="intro__text">
            Cadastre a turma e os itens, marque restrições e preferências, escolha a data e
            sorteie. O resultado fica equilibrado entre as pessoas e é salvo no histórico.
          </p>
        </section>

        {bootNotice && (
          <div className="notice notice--warning" role="alert">
            <p>{bootNotice}</p>
            <button type="button" className="btn btn--ghost" onClick={() => setBootNotice(null)}>
              <Icon name="x" />
              Dispensar aviso
            </button>
          </div>
        )}
        {storageProblem && (
          <div className="notice notice--danger" role="alert">
            <p>
              {storageProblem === 'quota'
                ? 'O armazenamento do navegador está cheio: as últimas alterações não foram salvas. Exclua sorteios antigos do histórico para liberar espaço.'
                : 'Não foi possível salvar neste navegador (armazenamento indisponível ou bloqueado). Você pode continuar, mas os dados se perdem ao fechar a página.'}
            </p>
          </div>
        )}

        <DrawBar
          date={coffeeDate}
          participantCount={participants.length}
          itemCount={items.length}
          unitCount={unitCount}
          hasResult={result !== null}
          dateError={dateError}
          drawError={drawError}
          onDateChange={(date) => edit({ type: 'setDate', date })}
          onDraw={draw}
        />

        <div className="prep">
          <ParticipantsPanel
            participants={participants}
            onAdd={addParticipant}
            onImport={importParticipants}
            onRename={renameParticipant}
            onRemove={removeParticipant}
            onOpenRules={openRules}
          />
          <ItemsPanel
            items={items}
            onAdd={addItem}
            onUpdate={updateItem}
            onRemove={removeItem}
          />
        </div>

        <RulesPanel
          participants={participants}
          items={items}
          selectedId={rulesFor}
          selectRef={rulesSelectRef}
          onSelect={setRulesFor}
          onTogglePreferred={(participantId, itemId) =>
            edit({ type: 'togglePreferred', participantId, itemId })
          }
          onToggleRestrictedItem={toggleRestrictedItem}
          onToggleRestrictedCategory={toggleRestrictedCategory}
        />

        <ResultPanel
          result={result}
          invalidated={invalidated}
          runNote={visibleRunNote}
          onClear={() => {
            dispatch({ type: 'clearResult' })
            announce('Resultado limpo. Cadastros e histórico foram mantidos.')
          }}
        />

        <HistoryPanel
          history={history}
          announce={announce}
          onShow={(id) => {
            focusResultNext.current = true
            dispatch({ type: 'showFromHistory', id })
          }}
          onRemove={(id) => dispatch({ type: 'removeHistory', id })}
          onClear={() => {
            dispatch({ type: 'clearHistory' })
            announce('Histórico apagado.')
          }}
        />
      </main>

      <footer className="footer">
        <p className="meta">
          Seus dados ficam apenas neste navegador. Nada é enviado para a internet.
          {coffeeDate && ` Café marcado para ${formatDateShort(coffeeDate)}.`}
        </p>
      </footer>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement.text}
        {announcement.count % 2 === 0 ? '' : '​'}
      </div>
    </div>
  )
}
