import { storedData, type SharedStore, type SyncStatus } from '../domain/shared'

const messages = {
  offline: 'Não foi possível conectar ao serviço de dados. Tente novamente.',
  conflict: 'Outra pessoa alterou os dados antes do seu salvamento. Seu rascunho foi mantido nesta página. Baixe uma cópia antes de carregar a versão compartilhada e refazer suas alterações.',
}

export default function SharingPanel({ status, store }: { status: SyncStatus; store: SharedStore }) {
  if (status !== 'offline' && status !== 'conflict') return null
  const problem = store.getSnapshot().problem
  function downloadDraft() {
    const blob = new Blob([JSON.stringify({ version: 1, ...storedData(store.getSnapshot().state) }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cafezinho-rascunho.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="sharing notice notice--warning" aria-label="Compartilhamento">
      <div>
        <p role="status">{status === 'offline' && problem ? problem : messages[status]}</p>
        {status === 'offline' && store.hasUnsavedChanges() && <p>As alterações pendentes ainda não foram compartilhadas. Mantenha esta página aberta até salvar ou baixar seu rascunho.</p>}
      </div>
      <div className="sharing__actions">
        {status === 'offline' && <button type="button" className="btn btn--ghost" onClick={() => { void store.retry() }}>Tentar novamente</button>}
        {(status === 'conflict' || status === 'offline') && store.hasUnsavedChanges() && (
          <button type="button" className="btn btn--ghost" onClick={downloadDraft}>Baixar rascunho</button>
        )}
        {status === 'conflict' && (
          <button type="button" className="btn btn--ghost" onClick={() => { void store.reloadShared() }}>Descartar rascunho e carregar dados compartilhados</button>
        )}
      </div>
    </section>
  )
}
