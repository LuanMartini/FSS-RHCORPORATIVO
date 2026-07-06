# RH Corporativo

Sistema de RH corporativo com autenticação, dashboard, funcionários, admissão, ponto, holerite, folha mensal, férias, benefícios, treinamentos e advertências.

## Stack

- Frontend: React, TypeScript, Vite e Tailwind CSS.
- Backend: Node.js, Express, JWT, bcrypt e banco PostgreSQL ou MySQL.

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

3. Rode tudo pela raiz:

```bash
npm run dev
```

Frontend: http://localhost:5173

API: http://localhost:3333

## Acesso inicial

O backend cria dados iniciais automaticamente quando as tabelas estão vazias.

- E-mail: `admin@empresa.com`
- Senha: `admin123`

Também são criados departamentos, cargos, funcionários, benefícios, treinamentos e vagas de exemplo para o dashboard abrir preenchido.

## Comandos úteis

```bash
npm run check
npm run build
npm run lint
npm run start:backend
```

## Segurança

Por padrão, novos cadastros de administrador ficam desabilitados quando já existe usuário no banco. Para abrir cadastro temporariamente em desenvolvimento:

```env
ALLOW_ADMIN_REGISTRATION=true
VITE_ADMIN_REGISTRATION_ENABLED=true
```

Em produção, mantenha ambos como `false`, troque `JWT_SECRET`, use uma senha forte para o admin inicial e configure `CORS_ORIGIN` com o domínio real do frontend.

## Deploy

Veja [DEPLOY.md](DEPLOY.md).
