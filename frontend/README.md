# Frontend do FSS RH Corporativo

Aplicação React e TypeScript servida pelo Vite. Ela consome a API do backend,
que deve estar disponível em http://localhost:3333.

## Configuração

Na raiz do repositório, instale as dependências:

```powershell
npm ci
npm --prefix backend ci
npm --prefix frontend ci
```

O frontend usa frontend/.env. Para criar o arquivo a partir do exemplo:

```powershell
Copy-Item frontend/.env.example frontend/.env
```

VITE_API_URL aponta para a API e, por padrão, usa http://localhost:3333.
VITE_ADMIN_REGISTRATION_ENABLED deve permanecer false, exceto durante o
bootstrap inicial autorizado em desenvolvimento.

## Desenvolvimento

Inicie primeiro o PostgreSQL, aplique as migrações e rode o backend conforme as
instruções do README da raiz. Em outro terminal:

```powershell
npm --prefix frontend run dev
```

Abra http://localhost:5173.

## Build e verificações

Os comandos podem ser executados a partir da raiz:

```powershell
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run check:bundle
```

O build compila os tipos, gera os arquivos de produção em frontend/dist e aplica
a checagem de orçamento do bundle.
