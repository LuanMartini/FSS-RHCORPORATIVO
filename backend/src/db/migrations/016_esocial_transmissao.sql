-- Metadados aditivos para transmissao assincrona da outbox eSocial.
-- Nao altera os estados nem remove colunas do contrato criado na migration 004.
BEGIN;

ALTER TABLE perfis_folha_colaboradores
  ADD COLUMN IF NOT EXISTS matricula_esocial VARCHAR(30),
  ADD COLUMN IF NOT EXISTS categoria_esocial VARCHAR(3),
  ADD COLUMN IF NOT EXISTS estabelecimento_tp_insc SMALLINT,
  ADD COLUMN IF NOT EXISTS estabelecimento_nr_insc VARCHAR(14),
  ADD COLUMN IF NOT EXISTS lotacao_esocial VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tabela_rubricas_esocial VARCHAR(8);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_perfil_folha_categoria_esocial') THEN
    ALTER TABLE perfis_folha_colaboradores
      ADD CONSTRAINT ck_perfil_folha_categoria_esocial
      CHECK (categoria_esocial IS NULL OR categoria_esocial ~ '^\d{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_perfil_folha_estabelecimento_esocial') THEN
    ALTER TABLE perfis_folha_colaboradores
      ADD CONSTRAINT ck_perfil_folha_estabelecimento_esocial
      CHECK (
        (estabelecimento_tp_insc IS NULL AND estabelecimento_nr_insc IS NULL)
        OR (estabelecimento_tp_insc IN (1,3,4) AND estabelecimento_nr_insc IS NOT NULL)
      );
  END IF;
END $$;

ALTER TABLE eventos_esocial_folha
  ADD COLUMN IF NOT EXISTS event_id CHAR(36),
  ADD COLUMN IF NOT EXISTS recibo VARCHAR(120),
  ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consultas SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_tentativas SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS executar_apos TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS bloqueado_por VARCHAR(120),
  ADD COLUMN IF NOT EXISTS bloqueado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_erro TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_evento_esocial_event_id') THEN
    ALTER TABLE eventos_esocial_folha
      ADD CONSTRAINT ck_evento_esocial_event_id
      CHECK (event_id IS NULL OR event_id ~ '^ID[12][A-Z0-9]{12}[0-9]{21}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_evento_esocial_tentativas') THEN
    ALTER TABLE eventos_esocial_folha
      ADD CONSTRAINT ck_evento_esocial_tentativas
      CHECK (tentativas >= 0 AND consultas >= 0 AND max_tentativas BETWEEN 1 AND 20);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_eventos_esocial_event_id
  ON eventos_esocial_folha (event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_eventos_esocial_transmissao
  ON eventos_esocial_folha (executar_apos,id)
  WHERE status IN ('PRONTO_ENVIO','ENVIANDO');

COMMIT;
