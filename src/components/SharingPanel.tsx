import { useState } from 'react'
import { storedData, type SharedStore, type SyncStatus } from '../domain/shared'

const messages: Record<SyncStatus, string> = {
  loading: 'Carregando os dados compartilhados…',
  saved: 'Dados compartilhados · alterações salvas',
  saving: 'Salvando alterações para a equipe…',
  offline: 'Não foi possível conectar ao serviço de dados. Tente novamente.',
  conflict: 'Outra pessoa alterou os dados antes do seu salvamento. Seu rascunho foi mantido nesta página. Baixe uma cópia antes de carregar a versão compartilhada e refazer suas alterações.',
}

export default function SharingPanel({ status, store }: { status: SyncStatus; store: SharedStore }) {
  const [copyMessage, setCopyMessage] = useState('')
  const problem = store.getSnapshot().problem
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyMessage('Link copiado. Compartilhe com quem tem acesso a este servidor.')
    } catch {
      setCopyMessage('Copie o endereço desta página na barra do navegador para compartilhar.')
    }
  }
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
    <section className={`sharing notice ${status === 'offline' || status === 'conflict' ? 'notice--warning' : ''}`} aria-label="Compartilhamento">
      <div>
        <p role="status">{status === 'offline' && problem ? problem : messages[status]}</p>
        {status === 'offline' && store.hasUnsavedChanges() && <p>As alterações pendentes ainda não foram compartilhadas. Mantenha esta página aberta até salvar ou baixar seu rascunho.</p>}
        <p className="meta">Quem acessa este endereço vê e pode editar os mesmos dados. A página atualiza automaticamente.</p>
        {copyMessage && <p className="meta" role="status">{copyMessage}</p>}
      </div>
      <div className="sharing__actions">
        <button type="button" className="btn btn--ghost" onClick={() => { void copyLink() }}>Copiar link</button>
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
