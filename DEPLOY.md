# Deploy

## Variaveis do backend

Configure estas variaveis no servidor do backend:

```env
PORT=3333
JWT_SECRET=gere-um-segredo-longo
JWT_ISSUER=rhcorp-api
JWT_AUDIENCE=rhcorp-web
JWT_ACCESS_TTL=10m
CORS_ORIGIN=https://seu-frontend.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
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
TRUST_PROXY_HOPS=1
SEED_ADMIN_EMAIL=admin@empresa.com
SEED_ADMIN_PASSWORD=troque-essa-senha
MALWARE_SCANNER_URL=https://scanner-interno.example/scan
MALWARE_SCANNER_TOKEN=segredo-fornecido-pelo-scanner
LEAVE_WORKER_INTERVAL_MS=300000
```

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
