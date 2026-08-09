# Deploy

## Variaveis do backend

Configure estas variaveis no servidor do backend:

```env
PORT=3333
DOTENV_CONFIG_QUIET=true
JWT_SECRET=gere-um-segredo-longo
JWT_ISSUER=rhcorp-api
JWT_AUDIENCE=rhcorp-web
JWT_ACCESS_TTL=10m
CORS_ORIGIN=https://seu-frontend.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
LOG_LEVEL=info
ERROR_TRACKING_DSN=https://chave-publica@o0.ingest.sentry.io/projeto
ERROR_TRACKING_TRACES_SAMPLE_RATE=0.05
METRICS_ENABLED=true
METRICS_TOKEN=segredo-longo-exclusivo-para-prometheus
DB_CLIENT=postgres
PG_HOST=host-do-banco
PG_PORT=5432
PG_USER=usuario
PG_PASSWORD=senha
PG_DATABASE=rhcorp
PG_SSL=true
PG_SSL_REJECT_UNAUTHORIZED=true
PG_POOL_MAX=10
PG_STATEMENT_TIMEOUT_MS=30000
FACIAL_MATCH_PROVIDER=local
FACIAL_MATCH_THRESHOLD=0.82
OCR_PROVIDER=tesseract
OCR_MANUAL_REVIEW_THRESHOLD=85
# Assinatura PAdES/CAdES: use certificado A1 montado como segredo, nunca no Git.
ICP_BRASIL_MODE=producao
ICP_BRASIL_SIGNER=p12
ICP_BRASIL_P12_PATH=/run/secrets/rhcorp-certificado.pfx
ICP_BRASIL_P12_PASSWORD=senha-vinda-do-gerenciador-de-segredos
ICP_BRASIL_SIGNATURE_LENGTH=16384
TRUST_PROXY_HOPS=1
SEED_ADMIN_EMAIL=admin@empresa.com
SEED_ADMIN_PASSWORD=troque-essa-senha
MALWARE_SCANNER_URL=https://scanner-interno.example/scan
MALWARE_SCANNER_TOKEN=segredo-fornecido-pelo-scanner
LEAVE_WORKER_INTERVAL_MS=300000
```

O reconhecimento facial de ponto executa localmente o modelo FaceRes. Em produção,
`FACIAL_MATCH_PROVIDER=local` é obrigatório; valor ausente ou um provedor ainda não
implantado bloqueia a marcação. Consulte `docs/biometria-facial.md` antes de ativar.

O OCR de admissão e reembolsos executa localmente com Tesseract.js e o modelo de
português empacotado com o backend. Em produção, `OCR_PROVIDER=tesseract` é
obrigatório; configurações ausentes ou provedores externos não implementados
bloqueiam o envio. Consulte `docs/ocr-local.md` para limites e revisão humana.

Em produção, a assinatura de contracheques e comprovantes de ponto exige
`ICP_BRASIL_MODE=producao` e o certificado A1 acima. A configuração incompleta
bloqueia a assinatura; `simulado` é aceito somente fora de produção. O caminho
A3/HSM depende de um adaptador PKCS#11 específico e também bloqueia enquanto
não estiver instalado. Consulte `docs/icp-brasil.md` para a homologação e os
limites regulatórios.

## Observabilidade

Logs saem estruturados em JSON quando `NODE_ENV=production`; use o campo
`requestId` (tambem devolvido nos headers `X-Request-Id` e
`X-Correlation-Id`) para correlacionar API, auditoria e erros. Corpos de
requisicao, senha, token, CPF e valores salariais nao sao registrados.

`ERROR_TRACKING_DSN` ativa opcionalmente o Sentry. A ausencia dele nao impede a
API ou os workers de iniciar. `ERROR_TRACKING_TRACES_SAMPLE_RATE` deve ser baixo
em producao e revisado com o DPO, pois rastreamento de performance pode carregar
metadados operacionais.

O endpoint `/metrics` so existe quando `METRICS_ENABLED=true` **e**
`METRICS_TOKEN` esta configurado. Exponha-o somente na rede interna; o Prometheus
deve enviar `X-Metrics-Token` (ou `Authorization: Bearer`) com esse segredo. Ele
exporta requisicoes/latencia por rota e status, erros por tipo, metricas padrao
do processo e filas pendentes de folha e reembolsos. Nao use CPF, e-mail, ID de
colaborador ou URL com parametros como label no Prometheus.

## Variaveis do frontend

Configure no provedor do frontend:

```env
VITE_API_URL=https://sua-api.com
VITE_ADMIN_REGISTRATION_ENABLED=false
```

## Sugestao de hospedagem

- Banco: PostgreSQL gerenciado.
- Backend: Render, Railway, Fly.io, VPS ou container Node.
- Frontend: Vercel, Netlify ou hospedagem estatica.

## Comandos de build

Backend:

```bash
npm --prefix backend ci
npm --prefix backend run db:migrate
npm --prefix backend run db:verify
npm --prefix backend start
```

`db:migrate` deve ser um job unico anterior ao deploy da API. A API apenas
valida os checksums de `schema_migrations` e recusa iniciar quando existe
migracao pendente ou alterada.

Workers independentes:

```bash
npm --prefix backend run worker
npm --prefix backend run worker:audit
npm --prefix backend run worker:leave
```

Frontend:

```bash
npm --prefix frontend install
npm --prefix frontend run build
```

Pasta publicada do frontend: `frontend/dist`.

## Checklist antes de publicar

- Trocar `JWT_SECRET`.
- Trocar `SEED_ADMIN_PASSWORD`.
- Manter `VITE_ADMIN_REGISTRATION_ENABLED=false`; o bootstrap da API retorna 404 em producao.
- Apontar `CORS_ORIGIN` para o dominio real do frontend.
- Ajustar `RATE_LIMIT_MAX` conforme o volume real de usuarios.
- Apontar `VITE_API_URL` para a URL publica da API.
- Confirmar backup do banco.
- Restaurar o backup em um banco separado e executar `db:migrate` nele.
- Confirmar que `schema_migrations` nao possui checksum divergente.
- Executar o worker de folha e o worker de auditoria separados da API.
- Executar o worker de ferias e configurar scanner antimalware real; uploads falham sem scanner em producao.
- Montar o PFX A1 como segredo, validar o PDF assinado e homologar cadeia/revogacao com o ITI antes de uso regulatorio.
- Validar TLS `verify-full` no PostgreSQL e Redis privado/autenticado.
- Garantir que nenhum segredo foi publicado como variavel `VITE_*`.

## Estrategia de migracao e rollback

1. Gere um backup/PITR e valide a restauracao antes do deploy.
2. Execute migracoes aditivas no job exclusivo de migracao.
3. Se o job falhar, bloqueie o deploy; migracoes transacionais fazem rollback.
4. Publique a API em canario e execute smoke tests de login, RBAC, ponto e folha.
5. Se a aplicacao falhar, reverta somente a imagem. O schema deve permanecer
   retrocompativel pelo padrao expand/contract.
6. Nao execute down migration destrutiva automaticamente. Em corrupcao logica,
   restaure o PITR em cluster novo, valide e troque o trafego.

A remocao de colunas legadas `funcionarios`/`funcionario_id` pertence a uma
release contract posterior, somente depois de confirmar que nao ha leitores
legados em producao.
