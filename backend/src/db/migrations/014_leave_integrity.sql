BEGIN;

ALTER TABLE ferias ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE RESTRICT;
ALTER TABLE ferias ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ferias ADD COLUMN IF NOT EXISTS dias SMALLINT;
ALTER TABLE ferias ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE ferias ADD COLUMN IF NOT EXISTS decidido_em TIMESTAMPTZ;
ALTER TABLE ferias ADD COLUMN IF NOT EXISTS decidido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

UPDATE ferias f SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m
 WHERE f.funcionario_id=m.funcionario_id AND f.colaborador_id IS NULL;
UPDATE ferias SET status='APROVADA' WHERE status='APROVADO';
UPDATE ferias SET status='REPROVADA' WHERE status='REPROVADO';
UPDATE ferias SET status='ENCERRADA' WHERE status='ENCERRADO';
UPDATE ferias SET dias=(data_fim-data_inicio)+1 WHERE dias IS NULL;

ALTER TABLE ferias ALTER COLUMN funcionario_id DROP NOT NULL;
ALTER TABLE ferias ALTER COLUMN colaborador_id SET NOT NULL;
ALTER TABLE ferias ALTER COLUMN dias SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE ferias ADD CONSTRAINT ck_ferias_datas CHECK (data_fim>=data_inicio);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ferias ADD CONSTRAINT ck_ferias_dias CHECK (dias BETWEEN 1 AND 30);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ferias ADD CONSTRAINT ck_ferias_status CHECK
    (status IN ('PENDENTE','APROVADA','REPROVADA','CANCELADA','EM_GOZO','ENCERRADA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS periodos_aquisitivos_ferias (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  inicio_em DATE NOT NULL,
  fim_em DATE NOT NULL,
  disponivel_em DATE NOT NULL,
  dias_direito SMALLINT NOT NULL DEFAULT 30 CHECK (dias_direito BETWEEN 0 AND 30),
  dias_utilizados SMALLINT NOT NULL DEFAULT 0 CHECK (dias_utilizados BETWEEN 0 AND 30),
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id,inicio_em),
  CHECK (fim_em>=inicio_em),
  CHECK (dias_utilizados<=dias_direito)
);

ALTER TABLE ferias ADD COLUMN IF NOT EXISTS periodo_aquisitivo_id BIGINT
  REFERENCES periodos_aquisitivos_ferias(id) ON DELETE RESTRICT;

INSERT INTO periodos_aquisitivos_ferias
  (colaborador_id,inicio_em,fim_em,disponivel_em,dias_direito)
SELECT id,COALESCE(data_admissao,created_at::date),
       COALESCE(data_admissao,created_at::date)+interval '1 year'-interval '1 day',
       COALESCE(data_admissao,created_at::date)+interval '1 year',30
  FROM colaboradores
ON CONFLICT (colaborador_id,inicio_em) DO NOTHING;

UPDATE ferias f SET periodo_aquisitivo_id=(
  SELECT p0.id FROM periodos_aquisitivos_ferias p0
   WHERE p0.colaborador_id=f.colaborador_id ORDER BY p0.inicio_em LIMIT 1
) WHERE f.periodo_aquisitivo_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_ferias_colaborador_periodo
  ON ferias (colaborador_id,data_inicio,data_fim,status);
CREATE INDEX IF NOT EXISTS ix_ferias_transicao
  ON ferias (status,data_inicio,data_fim) WHERE status IN ('APROVADA','EM_GOZO');

COMMIT;
