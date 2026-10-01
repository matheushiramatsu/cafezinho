# Cafezinho ESL

O Cafezinho ESL sorteia quem leva o quê no café da equipe. React + TypeScript + Vite na interface, servidor Node.js e SQLite para compartilhar participantes, itens, regras, data, resultados e histórico entre as pessoas que acessam **o mesmo servidor**. A preferência de tema continua individual no navegador.

## Executar

Requer Node.js 24 ou superior.

```
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. O comando inicia a interface e a API juntas. Para outras pessoas na mesma rede, compartilhe `http://IP-DO-SERVIDOR:5173` e permita a porta 5173 no firewall. O computador precisa permanecer ligado. Endereços como `localhost` e `127.0.0.1` só funcionam no próprio computador.

## Servir a equipe

```sh
npm run build
npm start
```

A aplicação completa fica em `http://localhost:3001`. Compartilhe `http://IP-DO-SERVIDOR:3001` na rede local. O botão **Copiar link** copia o endereço usado para abrir a página.

Para acesso pela internet, hospede esse servidor Node.js em uma máquina com disco persistente e publique um domínio com HTTPS por meio de um proxy reverso. Esta versão usa um único espaço compartilhado, sem autenticação: quem tem acesso ao endereço pode ler e editar os dados. Use uma rede privada/VPN ou controle de acesso no proxy para limitar o acesso à equipe.

A hospedagem estática anterior não executa este servidor. Não use o arquivo SQLite em disco temporário de funções serverless, nem em múltiplas réplicas com bancos separados. Execute uma instância do serviço com seu volume persistente.

### Docker

```sh
docker compose up --build -d
```

Abra a porta 3001. O volume `cafezinho-data` preserva o SQLite ao recriar o contêiner. Não remova esse volume se quiser manter os dados.

### Configuração e backup

Copie `.env.example` para `.env` se precisar mudar:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interfaces de rede em que a API escuta |
| `PORT` | `3001` | Porta do servidor |
| `DATABASE_PATH` | `./data/cafezinho.sqlite` | Arquivo persistente SQLite |

Em desenvolvimento, se mudar a porta da API, defina também `API_TARGET=http://127.0.0.1:NOVA-PORTA` no ambiente que inicia o Vite. Se a porta 5173 estiver ocupada, defina `WEB_PORT=5174` no ambiente antes de executar `npm run dev`. O Vite escuta em IPv4. Em produção, interface e API usam a mesma porta.

O banco é criado automaticamente e não entra no Git. Para backup simples, pare o servidor, copie a pasta `data/` inteira (incluindo eventuais arquivos `-wal` e `-shm`) e reinicie. Para restaurar, pare o servidor e restaure a pasta. No Docker, faça backup do volume com o serviço parado.

## Compartilhamento e dados antigos

- Os dados são carregados do servidor antes de habilitar as edições; uma falha de conexão não substitui o banco por dados vazios.
- As alterações são salvas automaticamente e os outros navegadores consultam atualizações a cada 3 segundos.
- Salvamentos usam uma revisão no SQLite. Se duas pessoas editarem a mesma versão, a segunda recebe um aviso e seu rascunho fica preservado na página. Ela pode baixar uma cópia JSON, carregar a versão compartilhada e refazer suas alterações.
- Sem conexão, as edições pendentes ficam na memória da página e há um botão para tentar novamente. Não feche a página antes de salvar ou baixar o rascunho; o navegador avisa ao tentar sair com alterações pendentes.
- Quando o banco nunca recebeu uma gravação e existem dados antigos no `localStorage`, aparece **Importar e compartilhar dados antigos**. A cópia local é preservada e a importação também respeita a revisão do servidor.
- O navegador só consegue ler o `localStorage` do mesmo endereço/origem. Se os dados estavam em outro domínio, exporte o conteúdo da chave `cafezinho:v1` (ou `cafe-da-firma:v1`) nesse domínio e transfira-o antes de importar. Não há acesso automático aos dados de outro domínio.

## API

| Método | Caminho | Resposta |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica acesso ao banco |
| `GET` | `/api/data` | `{ "revision": 0, "data": { ... } }` |
| `PUT` | `/api/data` | Recebe `{ "revision": <revisão lida>, "data": <dados completos> }` e retorna a nova revisão |

O `PUT` retorna `409` se a revisão estiver desatualizada, `400` para dados inválidos e `413` para conteúdo acima de 10 MiB. A API não habilita CORS; consumidores externos podem acessá-la pelo servidor/CLI na rede autorizada.

## Verificar

```sh
npm test
npm run lint
npm run build
```

Os testes cobrem regras e sorteio, restauração, SQLite, API HTTP, concorrência, sincronização entre clientes e recuperação de falhas de rede.

## Estrutura

- `server/`: API HTTP, validação e persistência SQLite.
- `src/domain/`: regras de negócio e cliente de sincronização.
- `src/components/`, `src/hooks/`: interface.
- `src/index.css`: tokens de cor (claro/escuro) com a paleta da ESL (eslsistemas.com.br).
- `src/assets/esl-logo-branca.png`, `public/favicon.png`: logo e ícone da ESL.

As chaves antigas do `localStorage` são lidas para importação, sem substituir o banco compartilhado nem apagar a cópia original.
