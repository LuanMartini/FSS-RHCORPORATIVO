# Deploy

## Variaveis do backend

Configure estas variaveis no servidor do backend:

```env
PORT=3333
JWT_SECRET=gere-um-segredo-longo
ALLOW_ADMIN_REGISTRATION=false
CORS_ORIGIN=https://seu-frontend.com
DB_CLIENT=postgres
PG_HOST=host-do-banco
PG_PORT=5432
PG_USER=usuario
PG_PASSWORD=senha
PG_DATABASE=rhcorp
SEED_ADMIN_EMAIL=admin@empresa.com
SEED_ADMIN_PASSWORD=troque-essa-senha
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
npm --prefix backend install
npm --prefix backend start
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
- Manter `ALLOW_ADMIN_REGISTRATION=false`.
- Apontar `CORS_ORIGIN` para o dominio real do frontend.
- Apontar `VITE_API_URL` para a URL publica da API.
- Confirmar backup do banco.
