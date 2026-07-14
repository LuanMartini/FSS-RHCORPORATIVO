BEGIN;

-- Autorizacao do painel sensivel --------------------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil VARCHAR(32) NOT NULL DEFAULT 'ADMINISTRADOR';
DO $$ BEGIN
  ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_perfil
    CHECK (perfil IN ('ADMINISTRADOR','AUDITOR','RH','GESTOR','COLABORADOR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ix_usuarios_perfil ON usuarios (perfil);

-- Ledger append-only. A HMAC e a ancora externa sao mantidas fora do banco,
-- portanto um administrador apenas do PostgreSQL nao consegue reescrever uma
-- cadeia valida depois de alterar, remover ou recomputar linhas.
CREATE TABLE IF NOT EXISTS logs_auditoria_imutaveis (
  id BIGSERIAL PRIMARY KEY,
  evento_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  timestamp_evento TIMESTAMPTZ NOT NULL,
  ator_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ator_referencia VARCHAR(180) NOT NULL,
  acao VARCHAR(80) NOT NULL,
  recurso_tipo VARCHAR(80) NOT NULL,
  recurso_id VARCHAR(160),
  ip INET,
  user_agent_hash CHAR(64),
  correlation_id UUID NOT NULL,
  payload_cifrado BYTEA NOT NULL,
  payload_iv BYTEA NOT NULL,
  payload_tag BYTEA NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  hash_anterior CHAR(64) NOT NULL,
  hash_atual CHAR(64) NOT NULL UNIQUE,
  hmac_integridade CHAR(64) NOT NULL,
  chave_versao SMALLINT NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_auditoria_hashes CHECK (
    hash_anterior ~ '^[0-9a-f]{64}$' AND hash_atual ~ '^[0-9a-f]{64}$'
    AND hmac_integridade ~ '^[0-9a-f]{64}$' AND payload_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_auditoria_acao CHECK (length(trim(acao)) BETWEEN 3 AND 80),
  CONSTRAINT ck_auditoria_chave CHECK (chave_versao > 0)
);

CREATE INDEX IF NOT EXISTS ix_auditoria_tempo ON logs_auditoria_imutaveis (timestamp_evento DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_ator_tempo ON logs_auditoria_imutaveis (ator_usuario_id, timestamp_evento DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_acao_tempo ON logs_auditoria_imutaveis (acao, timestamp_evento DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_recurso ON logs_auditoria_imutaveis (recurso_tipo, recurso_id, timestamp_evento DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_correlacao ON logs_auditoria_imutaveis (correlation_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_tempo_brin ON logs_auditoria_imutaveis USING BRIN (timestamp_evento);

CREATE OR REPLACE FUNCTION bloquear_mutacao_log_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LEDGER_IMMUTABLE: operacao % bloqueada', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_sem_update_delete ON logs_auditoria_imutaveis;
CREATE TRIGGER trg_auditoria_sem_update_delete
BEFORE UPDATE OR DELETE ON logs_auditoria_imutaveis
FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao_log_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_sem_truncate ON logs_auditoria_imutaveis;
CREATE TRIGGER trg_auditoria_sem_truncate
BEFORE TRUNCATE ON logs_auditoria_imutaveis
FOR EACH STATEMENT EXECUTE FUNCTION bloquear_mutacao_log_auditoria();

REVOKE UPDATE, DELETE, TRUNCATE ON logs_auditoria_imutaveis FROM PUBLIC;

-- Historico contratual temporal ---------------------------------------------
CREATE TABLE IF NOT EXISTS historico_contratos (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  cargo_id INTEGER NOT NULL REFERENCES cargos(id) ON DELETE RESTRICT,
  salario_centavos BIGINT NOT NULL,
  data_admissao DATE NOT NULL,
  data_desligamento DATE,
  desligamento_voluntario BOOLEAN,
  motivo_desligamento VARCHAR(160),
  tipo_contrato VARCHAR(32) NOT NULL DEFAULT 'CLT',
  vigencia DATERANGE NOT NULL,
  fonte VARCHAR(32) NOT NULL DEFAULT 'ERP',
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_historico_contrato UNIQUE (colaborador_id, data_admissao, versao),
  CONSTRAINT ck_historico_salario CHECK (salario_centavos >= 0),
  CONSTRAINT ck_historico_datas CHECK (data_desligamento IS NULL OR data_desligamento >= data_admissao),
  CONSTRAINT ck_historico_vigencia CHECK (NOT isempty(vigencia) AND lower(vigencia) = data_admissao),
  CONSTRAINT ck_historico_voluntario CHECK (data_desligamento IS NOT NULL OR desligamento_voluntario IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_contratos_admissao ON historico_contratos (data_admissao, departamento_id);
CREATE INDEX IF NOT EXISTS ix_contratos_desligamento ON historico_contratos (data_desligamento, departamento_id)
  WHERE data_desligamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_contratos_departamento_vigencia ON historico_contratos USING GIST (vigencia);
CREATE INDEX IF NOT EXISTS ix_contratos_colaborador ON historico_contratos (colaborador_id, versao DESC);
CREATE INDEX IF NOT EXISTS ix_contratos_tempo_brin ON historico_contratos USING BRIN (data_admissao, data_desligamento);

CREATE TABLE IF NOT EXISTS historico_movimentacoes_contratuais (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  tipo VARCHAR(40) NOT NULL,
  ocorrido_em TIMESTAMPTZ NOT NULL,
  departamento_anterior_id INTEGER REFERENCES departamentos(id) ON DELETE RESTRICT,
  departamento_novo_id INTEGER REFERENCES departamentos(id) ON DELETE RESTRICT,
  cargo_anterior_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT,
  cargo_novo_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT,
  salario_anterior_centavos BIGINT,
  salario_novo_centavos BIGINT,
  voluntario BOOLEAN,
  justificativa VARCHAR(500),
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_movimentacao_tipo CHECK (tipo IN
    ('ADMISSAO','ALTERACAO_SALARIAL','PROMOCAO','REBAIXAMENTO','TRANSFERENCIA','DESLIGAMENTO')),
  CONSTRAINT ck_movimentacao_salarios CHECK (
    (salario_anterior_centavos IS NULL OR salario_anterior_centavos >= 0)
    AND (salario_novo_centavos IS NULL OR salario_novo_centavos >= 0)
  )
);
CREATE INDEX IF NOT EXISTS ix_movimentacoes_tempo ON historico_movimentacoes_contratuais (ocorrido_em DESC, tipo);
CREATE INDEX IF NOT EXISTS ix_movimentacoes_colaborador ON historico_movimentacoes_contratuais (colaborador_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS ix_movimentacoes_departamento ON historico_movimentacoes_contratuais (departamento_novo_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS ix_movimentacoes_tempo_brin ON historico_movimentacoes_contratuais USING BRIN (ocorrido_em);

-- Dimensoes protegidas, historizadas e nunca devolvidas em nivel individual.
CREATE TABLE IF NOT EXISTS historico_demografico (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  genero VARCHAR(32),
  raca_cor VARCHAR(32),
  pessoa_com_deficiencia BOOLEAN,
  faixa_etaria VARCHAR(24),
  escolaridade VARCHAR(40),
  valido_desde DATE NOT NULL,
  valido_ate DATE,
  fonte VARCHAR(32) NOT NULL DEFAULT 'AUTODECLARACAO',
  consentimento_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_demografico_datas CHECK (valido_ate IS NULL OR valido_ate > valido_desde),
  CONSTRAINT ck_demografico_genero CHECK (genero IS NULL OR genero IN
    ('FEMININO','MASCULINO','NAO_BINARIO','OUTRO','NAO_INFORMADO')),
  CONSTRAINT ck_demografico_raca CHECK (raca_cor IS NULL OR raca_cor IN
    ('AMARELA','BRANCA','INDIGENA','PARDA','PRETA','NAO_INFORMADO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_demografico_ativo ON historico_demografico (colaborador_id) WHERE valido_ate IS NULL;
CREATE INDEX IF NOT EXISTS ix_demografico_vigencia ON historico_demografico (valido_desde, valido_ate);
CREATE INDEX IF NOT EXISTS ix_demografico_segmentos ON historico_demografico (genero, raca_cor, pessoa_com_deficiencia)
  WHERE valido_ate IS NULL;
CREATE INDEX IF NOT EXISTS ix_demografico_tempo_brin ON historico_demografico USING BRIN (valido_desde, valido_ate);

COMMIT;
