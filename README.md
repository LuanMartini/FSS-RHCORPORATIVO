# RH Corporativo

Sistema de RH corporativo com autenticação, dashboard, funcionários, admissão, ponto, holerite, folha mensal, férias, benefícios, treinamentos e advertências.

## Stack

- Frontend: React, TypeScript, Vite e Tailwind CSS.
- Backend: Node.js, Express, JWT, bcrypt e banco PostgreSQL ou MySQL.
- Qualidade: lint, build, testes automatizados do backend e CI via GitHub Actions.

## Como rodar

1. Instale as dependências:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

2. Configure o banco:

Crie um banco chamado `rhcorp` no PostgreSQL, ou copie `backend/.env.example` para `backend/.env` e ajuste as variáveis.

Se tiver Docker instalado, suba um PostgreSQL local com:

```bash
docker compose up -d
```

3. Aplique as migracoes e, apenas no primeiro ambiente de desenvolvimento,
execute o seed explicitamente:

```bash
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```

4. Rode tudo pela raiz:

```bash
npm run dev
```

Frontend: http://localhost:5173

API: http://localhost:3333

## Acesso inicial

O backend não executa migrações nem seed durante o startup. O comando explícito
`npm --prefix backend run db:seed` cria dados iniciais quando as tabelas estão
vazias; em produção, configure uma senha forte antes de executá-lo.

- E-mail: `admin@empresa.com`
- Senha: `admin123`

Também são criados departamentos, cargos, funcionários, benefícios, treinamentos e vagas de exemplo para o dashboard abrir preenchido.

## Comandos úteis

```bash
npm run check
npm run test
npm run build
npm run lint
npm run start:backend
npm --prefix backend run db:migrate
npm --prefix backend run worker
npm --prefix backend run worker:audit
```

## Segurança

Por padrão, novos cadastros de administrador ficam desabilitados quando já existe usuário no banco. Para abrir cadastro temporariamente em desenvolvimento:

```env
ALLOW_ADMIN_REGISTRATION=true
VITE_ADMIN_REGISTRATION_ENABLED=true
```

Em produção, mantenha ambos como `false`, troque `JWT_SECRET`, use uma senha forte para o admin inicial e configure `CORS_ORIGIN` com o domínio real do frontend.

## Core de admissão digital e organograma

O novo Core usa PostgreSQL e está organizado em camadas de domínio, aplicação,
infraestrutura e interfaces em `backend/src/core`. A migração relacional completa
fica em `backend/src/db/migrations/002_core_admissao_organograma.sql`, e o contrato
tipado da API em `backend/openapi/core.yaml`.

Para arquivos reais, configure `DOCUMENT_ENCRYPTION_KEY` com uma chave base64 de
32 bytes e mantenha `backend/storage` fora de volumes públicos. Em desenvolvimento,
o backend usa uma chave determinística somente para facilitar a execução local.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

O funil está em **Admissão digital** e a árvore com drag-and-drop em
**Organograma**. O envio em lote usa uma requisição binária por arquivo para
permitir progresso individual, retry isolado e limite de 10 MB.

## Ponto e jornada avançados

O menu **Ponto & Jornada** reúne o espelho mensal, banco de horas, marcação com
GPS/geofence, captura facial simulada, escalas 12x36, 6x1, 5x2, rotativas e
flexíveis e solicitações de ajuste em dois níveis. O motor estritamente tipado
está em `backend/src/jornada` e o schema particionado em
`backend/src/db/migrations/003_jornada_avancada.sql`.

Câmera e geolocalização exigem contexto seguro (`https`) fora de `localhost`.
Antes do uso como REP-P em produção ainda é obrigatório integrar certificado
ICP-Brasil para saídas PAdES/CAdES, implementar os leiautes fiscais AFD/AEJ e
emitir/manter o Atestado Técnico e Termo de Responsabilidade. O código mantém
essas fronteiras explícitas e não apresenta a biometria simulada como serviço
biométrico certificado.

## Deploy

Veja [DEPLOY.md](DEPLOY.md).

## Folha de pagamento e payroll

O menu **Folha & Payroll** usa o motor em `backend/src/payroll`, com todos os
valores calculados em centavos inteiros (`BigInt`) e tabelas tributarias
versionadas pela competencia. A migracao `004_folha_pagamento.sql` inclui INSS e
IRRF de 2026, rubricas, dependentes, beneficios, pensoes, lancamentos mensais,
folhas versionadas, contracheques detalhados e uma outbox para eventos eSocial.

O comando `npm run dev` inicia tambem um worker independente. Em producao, API e
worker podem ser escalados separadamente; a fila PostgreSQL usa
`FOR UPDATE SKIP LOCKED`, recupera locks abandonados e mantem a consolidacao do
contracheque idempotente e transacional.

```bash
npm --prefix backend run worker
```

Os PDFs sao criptografados em repouso e sempre recebem hash SHA-256. Configure
`PAYROLL_SIGNING_PRIVATE_KEY` para produzir uma assinatura RSA-SHA256 destacada.
Isso nao equivale a uma assinatura PAdES/ICP-Brasil: a integracao com certificado,
carimbo do tempo e politica de assinatura deve ser feita antes do uso documental
em producao.

Os eventos S-1200 e S-1210 sao preparados em uma outbox idempotente, mas a
transmissao ao ambiente nacional, validacao de leiaute, certificado A1/A3,
consulta de recibo, totalizadores e fechamento S-1299 permanecem como fronteira
de integracao. Consulte o contrato REST em `backend/openapi/payroll.yaml`.

## ATS de recrutamento e selecao

O menu **Recrutamento ATS** oferece um Kanban virtualizado com as etapas
Aplicacao, Triagem, Entrevista Tecnica, Fit Cultural, Proposta e Contratado. O
snapshot vem da API REST e os deltas chegam pelo Socket.IO. Cada movimento exige
a versao atual do card e usa lock expiravel de 15 segundos; conflitos retornam
HTTP/evento 409 e forcam a leitura do estado vencedor.

A migracao `005_ats_recrutamento.sql` combina tabelas relacionais com documentos
JSONB indexados para skills, experiencias, idiomas, requisitos e resultados do
match. Curriculos PDF/DOCX sao limitados a 5 MB, validados por MIME e magic bytes,
extraidos por `pdf-parse`/`mammoth` e criptografados no storage seguro existente.
O parser `SIMULATED_LLM_V1` e o score `DETERMINISTIC_MATCH_V1` sao explicaveis e
nao se apresentam como decisao automatizada: a revisao humana continua obrigatoria.

Socket.IO roda na mesma porta da API. Para varias instancias, configure
`REDIS_URL`; o Redis adapter distribui rooms e eventos e a presenca global usa
`fetchSockets()`. Sem Redis, o modulo funciona em uma unica instancia.

Google Calendar e Outlook estao modelados como adapters. Enquanto OAuth, webhook
e APIs dos provedores nao forem configurados, entrevistas desses provedores ficam
em `PENDENTE_SINCRONIZACAO`. O provedor interno gera imediatamente um link de
sala Jitsi. O contrato REST e a lista de eventos Socket.IO ficam em
`backend/openapi/ats.yaml`.

## Gestão de desempenho e sucessão

O menu **Desempenho & Sucessão** reúne a matriz Nine-Box interativa, indicadores
de talentos, histórico de calibração e a cascata de OKRs. Arrastar uma pessoa
entre quadrantes abre uma decisão de calibração que exige justificativa e usa a
versão do resultado para impedir sobrescritas concorrentes.

A migration `006_desempenho_sucessao.sql` modela ciclos 360, perguntas, convites,
respostas numéricas, feedback qualitativo anônimo, resultados de talento, logs de
calibração, objetivos recursivos e histórico de progresso. Comentários textuais
não possuem referência ao avaliador e a view de leitura aplica k-anonimato antes
de liberar um grupo de respostas.

Ao atualizar um KR individual, o backend bloqueia a cadeia de ancestrais,
recalcula médias ponderadas do departamento até o objetivo corporativo e grava
todas as mudanças com o mesmo `correlation_id`. O contrato REST está em
`backend/openapi/performance.yaml`.

## Benefícios flexíveis e reembolsos

O menu **Benefícios** agora apresenta uma carteira mensal configurável, com
sliders sincronizados e limites mínimos/máximos definidos pelo RH. A atualização
usa centavos inteiros, transação serializável, controle de versão e chave de
idempotência persistida; assim, requisições repetidas não comprometem o saldo uma
segunda vez.

A migration `007_beneficios_reembolsos.sql` inclui limites tributários, carteiras,
alocações, operações idempotentes, regras de alçada, solicitações, aprovações e
transações de cartão. Comprovantes JPG, PNG ou PDF são validados por assinatura
binária, criptografados com AES-256-GCM e processados por OCR determinístico
simulado para extrair CNPJ, data, valor, fornecedor e categoria.

Na conciliação, uma transação é bloqueada durante o vínculo e o valor precisa
corresponder exatamente ao comprovante. Despesas até R$ 500 seguem para o gestor;
valores superiores adicionam a diretoria. O contrato REST está em
`backend/openapi/flex-benefits.yaml`.

## LMS corporativo e gamificação

O menu **Treinamentos** oferece a trilha linear de onboarding, player de vídeo
com presença auditável, prova conceitual randomizada, XP, badges SVG e rankings
semanal e mensal. O próximo módulo permanece bloqueado até o anterior estar
concluído e aprovado com nota mínima de 80%.

A migration `008_lms_gamificacao.sql` mantém cursos, matrículas, aulas,
sincronizações idempotentes a cada cinco segundos, snapshots de prova, respostas,
eventos de XP, conquistas e materializações do leaderboard. Eventos com aba oculta
não acumulam tempo; saltos além da janela validada são rejeitados pelo backend.

O frontend usa atualização localizada do progresso para não remontar o player ou
produzir flickering. A randomização muda a ordem das perguntas e alternativas,
enquanto o gabarito nunca é enviado ao navegador. Consulte o contrato REST em
`backend/openapi/lms.yaml`.

## Clima organizacional e comunicação interna

O menu **Clima & Mural** reúne a timeline social, menções com autocomplete,
curtidas, comentários e Kudos estruturados. Cada colaborador recebe uma cota
semanal; a publicação, o débito do saldo e o histórico do elogio são gravados em
uma transação serializável e idempotente.

O eNPS usa dois domínios criptograficamente separados. A rota autenticada grava
somente um HMAC por usuário e pesquisa e emite uma cédula curta que contém apenas
pesquisa, departamento e nonce. A rota anônima consome essa cédula, mas a resposta
final não armazena usuário, colaborador, comprovante de participação ou impressão
da credencial. Textos têm e-mail, CPF, telefone e menções removidos antes da
análise e são cifrados com AES-256-GCM; relatórios departamentais exigem no mínimo
três respostas.

A migration `009_clima_comunicacao.sql` contém feed, interações, menções, saldo e
histórico de Kudos, pesquisas, comprovantes HMAC, credenciais anti-replay,
respostas anônimas e a view agregada de eNPS. O contrato REST está em
`backend/openapi/climate.yaml`.

## Auditoria imutável e analytics estratégico

O menu **Auditoria & Analytics** é restrito aos perfis `ADMINISTRADOR` e
`AUDITOR`. Ele reúne integridade operacional, turnover histórico, alertas por
departamento e tempo de casa, faixas salariais e pay equity ajustado por cargo,
departamento e permanência. Pessoas aparecem somente por identificadores HMAC;
grupos demográficos com menos de três integrantes são suprimidos.

A migration `010_auditoria_analytics.sql` cria o ledger
`logs_auditoria_imutaveis`, históricos contratuais/demográficos e índices B-tree,
GiST e BRIN para séries temporais. `UPDATE`, `DELETE` e `TRUNCATE` são recusados
por triggers. Cada novo evento cifra seu payload com AES-256-GCM e encadeia o
SHA-256 ao elo anterior; uma HMAC com segredo externo ao banco impede recomputação
por um administrador apenas do PostgreSQL. O último hash também é gravado em uma
âncora assinada e atômica fora do banco, permitindo detectar remoção da cauda.

Em produção, configure `AUDIT_LEDGER_SECRET`, `AUDIT_PAYLOAD_KEY`,
`AUDIT_ANCHOR_PATH` e `AUDIT_KEY_VERSION`, mantenha segredos/âncora em um KMS ou
volume com controle independente e envie cópias da âncora para storage WORM. O
contrato REST está em `backend/openapi/audit.yaml`.
