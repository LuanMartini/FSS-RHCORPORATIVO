BEGIN;

-- Os snapshots imutaveis da folha usam digest(..., 'sha256').
-- A extensao e instalada por migracao para que o runtime nunca dependa de
-- alteracoes manuais no banco ou tente modificar o schema ao iniciar a API.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;
