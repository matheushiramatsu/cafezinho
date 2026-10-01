# Cafezinho ESL

O Cafezinho ESL sorteia quem leva o quê no café da equipe. Frontend React 19 + TypeScript + Vite, sem backend:
os dados ficam no `localStorage` do navegador.

## Comandos

```
npm run dev      # servidor de desenvolvimento
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm test         # vitest (domínio: sorteio, regras, estado, persistência)
```

## Estrutura

- `src/domain/`: regras de negócio puras (sorteio por fluxo de custo mínimo, cadastros, estado, persistência).
- `src/components/`, `src/hooks/`: interface.
- `src/index.css`: tokens de cor (claro/escuro) com a paleta da ESL (eslsistemas.com.br).
- `src/assets/esl-logo-branca.png`, `public/favicon.png`: logo e ícone da ESL.

As chaves do `localStorage` usam o prefixo `cafezinho:`. Dados salvos antes do renome (prefixo antigo)
são lidos como fallback e migrados para as chaves novas no primeiro salvamento.
