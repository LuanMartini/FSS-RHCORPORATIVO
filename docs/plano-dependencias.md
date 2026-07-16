# Plano de atualização das dependências do backend

Data da análise: 2026-07-16.

## Resumo executivo

As atualizações foram separadas por risco e testadas em branches independentes,
todas criadas a partir do commit `df6ab27`. Nenhuma migration ou alteração de
banco faz parte dos commits de dependências.

| Grupo | Branch | Versão testada | Resultado |
| --- | --- | --- | --- |
| Baixo risco | `codex/backend-deps-minor-2026` | Helmet 8.3.0, mysql2 3.23.0 e pg 8.22.0 | Aprovado |
| Major dotenv | `codex/dotenv-17` | dotenv 17.4.2 | Aprovado isoladamente |
| Major bcrypt | `codex/bcryptjs-3` | bcryptjs 3.0.3 | Aprovado isoladamente |
| Major Express | `codex/express-5-spike` | Express 5.2.1 | Spike aprovado; não fazer merge automático |

Cada branch deve originar um commit/PR próprio. Como as branches são irmãs, a
ordem recomendada é fazer merge da atualização menor, rebasear e repetir os
testes da branch seguinte antes de cada merge. Não usar `npm update` para
combinar esses grupos.

## Atualizações de baixo risco

Alterações aplicadas:

| Dependência | Antes no manifesto/lock | Depois | Uso no projeto |
| --- | --- | --- | --- |
| `helmet` | `^8.2.0` / 8.2.0 | `^8.3.0` / 8.3.0 | Headers de segurança em `backend/src/middleware/security.js` |
| `mysql2` | `^3.22.3` / 3.22.3 | `^3.23.0` / 3.23.0 | Adapter opcional em `backend/src/db/client.js` |
| `pg` | `^8.13.0` / 8.20.0 | `^8.22.0` / 8.22.0 | Adapter canônico PostgreSQL em `backend/src/db/client.js` |

Não foi necessária alteração de código de aplicação. Evidências:

- `npm run check`: código de saída 0; lint, typecheck, 27 testes unitários e
  build passaram. Os 12 testes de banco foram pulados somente nessa execução
  sem `RUN_DB_INTEGRATION`.
- PostgreSQL 16 e Redis 7 reais: `db:migrate`, `db:seed` e `db:verify`
  passaram; a suíte com `RUN_DB_INTEGRATION=1` executou 39/39 testes, sem skip.
- O arquivo de lock resolveu exatamente Helmet 8.3.0, mysql2 3.23.0 e pg 8.22.0.
- `npm --prefix backend audit --omit=dev --audit-level=high`: zero
  vulnerabilidades.

Rollback: reverter somente o commit desta branch e reinstalar com `npm ci`.
Não existe rollback de schema.

### Correção do ambiente de integração descoberta durante a validação

O job do CI declarava `RUN_DB_INTEGRATION=1`, mas não executava `db:seed`. Em
banco vazio isso fez seis testes dependerem de fixtures inexistentes (`cargos`,
`escalas_trabalho`, colaboradores, carteira e questionário). Além disso,
`DOCUMENT_ENCRYPTION_KEY` estava em hexadecimal, embora
`encryptedFileStorage.js` exija base64 que decodifique exatamente 32 bytes.

A branch de baixo risco corrige somente o ambiente de CI:

- adiciona um passo `db:seed` entre migrate e verify;
- configura credenciais de seed exclusivas de teste;
- troca `DOCUMENT_ENCRYPTION_KEY` por uma chave base64 de 32 bytes, também
  exclusiva de teste.

Sem o seed foram reproduzidas seis falhas; com seed e a chave no formato errado,
restou apenas o teste AES-GCM. Com os dois pré-requisitos corretos, a suíte
passou 39/39. Nenhuma asserção ou timeout foi relaxado.

## dotenv 16 para 17

### Mudança oficial e impacto

O [changelog oficial do dotenv](https://github.com/motdotla/dotenv/blob/master/CHANGELOG.md)
registra uma única mudança na passagem 16.6.1 para 17.0.0: `quiet` passou a ser
`false` por padrão, exibindo o arquivo e a quantidade de chaves injetadas. A API
`import 'dotenv/config'`, o parser e a política de não sobrescrever variáveis já
existentes permanecem disponíveis em 17.4.2.

O projeto usa `import 'dotenv/config'` em `server.js`, migrations, seeds e
workers. Para preservar o comportamento silencioso anterior, a branch documenta
`DOTENV_CONFIG_QUIET=true` em `backend/.env.example` e `DEPLOY.md`.

### Teste de compatibilidade

`backend/test/dotenvCompatibility.test.js`:

1. extrai automaticamente todas as atribuições de ambiente documentadas em
   `DEPLOY.md`;
2. cria um `.env` temporário com valores sintéticos, inclusive `#` entre aspas;
3. inicia um processo Node ESM que executa exatamente `import 'dotenv/config'`;
4. confirma que todas as chaves foram carregadas com o valor integral;
5. remove o arquivo temporário.

Resultados na branch `codex/dotenv-17`:

- `npm run check` com PostgreSQL/Redis e `RUN_DB_INTEGRATION=1`: 40/40 testes,
  zero skip, lint/typecheck/build aprovados;
- `npm --prefix backend audit --omit=dev --audit-level=high`: zero
  vulnerabilidades.

Rollback: reverter apenas o commit do dotenv. Manter
`DOTENV_CONFIG_QUIET=true` é inofensivo no dotenv 16.6.1.

## bcryptjs 2 para 3

### Mudanças oficiais e impacto

O repositório não mantém um changelog por release. A fonte oficial usada foi a
[comparação 2.4.3...v3.0.0](https://github.com/dcodeIO/bcrypt.js/compare/2.4.3...v3.0.0)
e a [documentação atual](https://github.com/dcodeIO/bcrypt.js/).

Pontos relevantes:

- o pacote principal passou a ESM, mantendo um wrapper CommonJS por `exports`;
- a geração padrão passou de `$2a$` para `$2b$`;
- os tipos TypeScript passaram a ser distribuídos pelo próprio pacote;
- foi adicionada a função `truncates` para detectar senhas acima do limite
  bcrypt de 72 bytes;
- a implementação de aleatoriedade foi modernizada para Node Crypto/Web Crypto.

O projeto já é ESM e usa `import bcrypt from 'bcryptjs'`; portanto não foi
necessária mudança nos controllers ou no seed.

### Prova de retrocompatibilidade de login

Antes do upgrade, bcryptjs 2.4.3 gerou fixtures literais `$2a$` e `$2b$` com o
mesmo salt e uma senha exclusivamente de teste. O novo teste
`backend/test/bcryptCompatibility.test.js` foi executado primeiro contra 2.4.3
e depois contra 3.0.3. Ele prova que:

- a senha correta autentica nos dois hashes legados;
- senha incorreta é recusada nos dois hashes;
- um hash novo é gerado e validado normalmente;
- com banco real, um usuário gravado com o fixture `$2a$` faz `POST /login` e
  recebe um JWT válido pelo controller de autenticação existente.

Resultados na branch `codex/bcryptjs-3`:

- prova dos fixtures aprovada ainda em 2.4.3;
- `npm run check` após o upgrade, com PostgreSQL/Redis e
  `RUN_DB_INTEGRATION=1`: 42/42 testes, zero skip, lint/typecheck/build
  aprovados;
- `npm --prefix backend audit --omit=dev --audit-level=high`: zero
  vulnerabilidades.

Antes do merge, manter a regra de produto que limita senhas por bytes, não
somente por caracteres. A adoção de `bcrypt.truncates` pode ser um hardening
posterior e não é necessária para a compatibilidade dos hashes existentes.

Rollback: reverter apenas o commit do bcryptjs. O teste com hashes literais deve
permanecer em qualquer reexecução/rebase da migração.

## Express 4 para 5

### Fonte e breaking changes relevantes

A referência é o [guia oficial de migração para Express 5](https://expressjs.com/en/guide/migrating-5.html).
Express 5 exige Node 18 ou superior; o CI já usa Node 22.

Inventário do código atual:

| Área do guia | Situação encontrada | Ação antes do merge |
| --- | --- | --- |
| Sintaxe de rotas | Somente paths literais e parâmetros nomeados (`:id`, `:token` etc.); não há wildcard anônimo, `?` opcional ou regexp em string | Manter teste que instancia todas as rotas |
| APIs removidas | Não há `app.del`, `req.param`, `res.send(status)`, `res.send(body,status)`, `res.json(obj,status)`, `res.sendfile` ou `res.redirect(url,status)` | Nenhuma conversão necessária |
| `req.query` | Somente leitura. Os filtros atuais são escalares | Adicionar teste contratual se algum cliente externo enviar query aninhada, pois o parser padrão passa de `extended` para `simple` |
| `req.params` | Somente leitura; nenhum código depende do protótipo do objeto | Nenhuma alteração prevista |
| `req.body` | `express.json`, `raw` e Multer são explícitos; controllers em geral usam `req.body ?? {}`; o audit já trata `undefined` | Cobrir uploads e requests sem body no E2E |
| Promises rejeitadas | Controllers assíncronos já usam `try/catch` e `next(error)` | Compatível; remoção dos wrappers seria refatoração separada |
| `express.urlencoded`/`express.static` | Não são usados | Sem impacto de defaults ou MIME/dotfiles |
| `app.listen` | O projeto usa `node:http` `server.listen`, não `app.listen` | Sem impacto direto |
| `req.host`/`res.clearCookie`/`res.vary` | Não são usados | Sem impacto direto |

Arquivos centrais revisados: `backend/src/server.js`, todos os arquivos
`*Routes.js`/`*Routes.ts`, controllers, `backend/src/middleware/security.js` e
`backend/src/middleware/authorization.js`.

### Compatibilidade do middleware

| Middleware | Evidência |
| --- | --- |
| `express-rate-limit` 8.5.2 | Declara peer `express >= 4.11`; health e rotas protegidas passaram |
| Helmet 8.2.0/8.3.0 | Não declara peer restritivo; inicialização e testes HTTP passaram |
| `cors` 2.8.5 | Middleware Connect sem peer restritivo; testes HTTP passaram |
| Multer 2.2.0 | Sem peer restritivo; rotas ATS/Jornada/Flex foram instanciadas e protegidas |
| Socket.IO 4.8.3 | Acoplado ao `http.Server`, não ao roteador Express |

Observação: `@types/express` já está em 5.0.6 no estado inicial, mesmo com
Express 4 em runtime. Isso reduz o delta de compilação, mas torna os testes de
runtime ainda mais importantes.

### Resultado do spike e plano de rollout

Na branch `codex/express-5-spike`, `npm install express@5.2.1` não exigiu
alterações de aplicação. `npm run check` foi executado com PostgreSQL/Redis e
`RUN_DB_INTEGRATION=1`: 39/39 testes, zero skip, lint/typecheck/build aprovados.
O audit de produção retornou zero vulnerabilidades.

Apesar do resultado, não fazer merge automático. Sequência exigida:

1. concluir e mesclar as três branches anteriores individualmente;
2. rebasear a branch Express sobre esse estado e repetir a suíte completa;
3. adicionar/confirmar testes de contrato para query strings aninhadas e todos
   os endpoints OpenAPI públicos;
4. executar E2E de login, uploads, rate limit, CORS, 404 e tratamento de erro;
5. publicar em staging, validar clientes externos e observar logs/latência;
6. fazer canário em produção com rollback por imagem/commit pronto;
7. somente então abrir o merge definitivo.

Rollback: reverter exclusivamente o commit Express e reinstalar o lockfile com
`npm ci`. Não há alteração de banco.

## Checklist para revisão humana

- [ ] Um PR para Helmet/mysql2/pg e correção do job de integração.
- [ ] Um PR separado para dotenv 17.
- [ ] Um PR separado para bcryptjs 3.
- [ ] Express 5 permanece em PR/branch própria até staging e contratos externos.
- [ ] Cada PR rebaseado executa `npm run check` com `RUN_DB_INTEGRATION=1`.
- [ ] Cada PR executa `npm --prefix backend audit --omit=dev --audit-level=high`.
- [ ] Nenhum certificado, segredo real ou `.env` é versionado.
