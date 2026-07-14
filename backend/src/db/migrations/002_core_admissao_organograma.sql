BEGIN;

-- Estrutura organizacional ---------------------------------------------------
ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS codigo VARCHAR(20);
ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE departamentos SET codigo = COALESCE(codigo, NULLIF(sigla, ''), 'DEP-' || id) WHERE codigo IS NULL;
ALTER TABLE departamentos ALTER COLUMN codigo SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_departamentos_codigo ON departamentos (codigo);
CREATE INDEX IF NOT EXISTS ix_departamentos_ativos ON departamentos (ativo) WHERE ativo = TRUE;

ALTER TABLE cargos ADD COLUMN IF NOT EXISTS cargo_superior_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT;
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS nivel SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE cargos ADD CONSTRAINT ck_cargos_sem_auto_referencia
    CHECK (cargo_superior_id IS NULL OR cargo_superior_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE cargos ADD CONSTRAINT ck_cargos_nivel_positivo CHECK (nivel > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS ix_cargos_departamento ON cargos (departamento_id, ativo);
CREATE INDEX IF NOT EXISTS ix_cargos_superior ON cargos (cargo_superior_id) WHERE cargo_superior_id IS NOT NULL;

-- Cadastro canonico do novo Core. A tabela funcionarios permanece como
-- compatibilidade dos modulos legados durante a migracao gradual.
CREATE TABLE IF NOT EXISTS colaboradores (
  id BIGSERIAL PRIMARY KEY,
  nome_completo VARCHAR(180) NOT NULL,
  nome_social VARCHAR(180),
  cpf CHAR(11) NOT NULL,
  email VARCHAR(180) NOT NULL,
  telefone VARCHAR(32),
  data_nascimento DATE,
  cargo_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE RESTRICT,
  gestor_id BIGINT REFERENCES colaboradores(id) ON DELETE RESTRICT,
  salario NUMERIC(14,2),
  data_admissao DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'PRE_ADMISSAO',
  etapa_admissao VARCHAR(32) NOT NULL DEFAULT 'PRE_ADMISSAO',
  versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_colaboradores_cpf UNIQUE (cpf),
  CONSTRAINT ux_colaboradores_email UNIQUE (email),
  CONSTRAINT ck_colaboradores_cpf CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT ck_colaboradores_status CHECK (status IN
    ('PRE_ADMISSAO','PENDENTE_ASSINATURA','ATIVO','AFASTADO','DESLIGADO')),
  CONSTRAINT ck_colaboradores_etapa CHECK (etapa_admissao IN
    ('PRE_ADMISSAO','ENVIO_DOCUMENTOS','VALIDACAO_RH','INTEGRACAO_SISTEMICA','CONCLUIDA')),
  CONSTRAINT ck_colaboradores_sem_auto_gestor CHECK (gestor_id IS NULL OR gestor_id <> id),
  CONSTRAINT ck_colaboradores_salario CHECK (salario IS NULL OR salario >= 0)
);

CREATE INDEX IF NOT EXISTS ix_colaboradores_etapa ON colaboradores (etapa_admissao, status);
CREATE INDEX IF NOT EXISTS ix_colaboradores_cargo ON colaboradores (cargo_id) WHERE status <> 'DESLIGADO';
CREATE INDEX IF NOT EXISTS ix_colaboradores_departamento ON colaboradores (departamento_id) WHERE status <> 'DESLIGADO';
CREATE INDEX IF NOT EXISTS ix_colaboradores_gestor ON colaboradores (gestor_id) WHERE gestor_id IS NOT NULL;

-- Documentos e workflow ------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos_admissao (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo VARCHAR(32) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  storage_key VARCHAR(500) NOT NULL UNIQUE,
  checksum_sha256 CHAR(64) NOT NULL,
  algoritmo_criptografia VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
  chave_versao SMALLINT NOT NULL DEFAULT 1,
  metadados_ocr JSONB NOT NULL DEFAULT '{}'::jsonb,
  confianca_ocr NUMERIC(5,2),
  status_validacao VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
  justificativa TEXT,
  validado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_documentos_tipo CHECK (tipo IN ('RG','CPF','PIS','COMPROVANTE_RESIDENCIA','DIPLOMA')),
  CONSTRAINT ck_documentos_tamanho CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760),
  CONSTRAINT ck_documentos_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT ck_documentos_status CHECK (status_validacao IN ('PENDENTE','APROVADO','RECUSADO')),
  CONSTRAINT ck_documentos_recusa_justificada CHECK
    (status_validacao <> 'RECUSADO' OR LENGTH(TRIM(COALESCE(justificativa, ''))) >= 5)
);

CREATE INDEX IF NOT EXISTS ix_documentos_colaborador_status
  ON documentos_admissao (colaborador_id, status_validacao);
CREATE INDEX IF NOT EXISTS ix_documentos_ocr ON documentos_admissao USING GIN (metadados_ocr);
CREATE UNIQUE INDEX IF NOT EXISTS ux_documento_aprovado_por_tipo
  ON documentos_admissao (colaborador_id, tipo) WHERE status_validacao = 'APROVADO';

CREATE TABLE IF NOT EXISTS contratos_trabalho (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  storage_key VARCHAR(500) NOT NULL UNIQUE,
  checksum_sha256 CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
  token_publico UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  assinado_em TIMESTAMPTZ,
  ip_assinatura INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_contratos_status CHECK (status IN ('PENDENTE','ASSINADO','EXPIRADO','CANCELADO'))
);

CREATE TABLE IF NOT EXISTS tokens_assinatura (
  id BIGSERIAL PRIMARY KEY,
  contrato_id BIGINT NOT NULL REFERENCES contratos_trabalho(id) ON DELETE CASCADE,
  pin_hash CHAR(64) NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_token_tentativas CHECK (tentativas BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS ix_tokens_contrato_ativo
  ON tokens_assinatura (contrato_id, expira_em) WHERE usado_em IS NULL;

CREATE TABLE IF NOT EXISTS fila_emails (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(40) NOT NULL,
  destinatario VARCHAR(180) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  tentativas SMALLINT NOT NULL DEFAULT 0,
  processar_apos TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ,
  ultimo_erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_fila_email_status CHECK (status IN ('PENDENTE','PROCESSANDO','ENVIADO','FALHA'))
);
CREATE INDEX IF NOT EXISTS ix_fila_emails_pendentes
  ON fila_emails (processar_apos, id) WHERE status IN ('PENDENTE','FALHA');

-- Auditoria e protecao contra ciclos ----------------------------------------
CREATE TABLE IF NOT EXISTS historico_hierarquico (
  id BIGSERIAL PRIMARY KEY,
  cargo_id INTEGER NOT NULL REFERENCES cargos(id) ON DELETE RESTRICT,
  superior_anterior_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT,
  superior_novo_id INTEGER REFERENCES cargos(id) ON DELETE RESTRICT,
  alterado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo VARCHAR(500) NOT NULL,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_historico_alteracao_real CHECK
    (superior_anterior_id IS DISTINCT FROM superior_novo_id)
);
CREATE INDEX IF NOT EXISTS ix_historico_cargo_data
  ON historico_hierarquico (cargo_id, alterado_em DESC);
CREATE INDEX IF NOT EXISTS ix_historico_superior_novo ON historico_hierarquico (superior_novo_id);

CREATE OR REPLACE FUNCTION fn_impedir_ciclo_cargos() RETURNS TRIGGER AS $$
DECLARE encontrou_ciclo BOOLEAN;
BEGIN
  -- O mesmo lock usado pelo servico protege tambem alteracoes SQL diretas e
  -- elimina a janela de corrida entre duas transacoes concorrentes.
  PERFORM pg_advisory_xact_lock(742019);
  IF NEW.cargo_superior_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.id = NEW.cargo_superior_id THEN
    RAISE EXCEPTION 'Um cargo nao pode responder a si proprio' USING ERRCODE = '23514';
  END IF;

  WITH RECURSIVE ancestrais(id) AS (
    SELECT NEW.cargo_superior_id
    UNION ALL
    SELECT c.cargo_superior_id
      FROM cargos c JOIN ancestrais a ON c.id = a.id
     WHERE c.cargo_superior_id IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM ancestrais WHERE id = NEW.id) INTO encontrou_ciclo;

  IF encontrou_ciclo THEN
    RAISE EXCEPTION 'Alteracao recusada: dependencia circular no organograma' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_impedir_ciclo_cargos ON cargos;
CREATE TRIGGER trg_impedir_ciclo_cargos
BEFORE INSERT OR UPDATE OF cargo_superior_id ON cargos
FOR EACH ROW EXECUTE FUNCTION fn_impedir_ciclo_cargos();

-- Carga de compatibilidade para ambientes que ja possuem funcionarios.
INSERT INTO colaboradores
  (nome_completo, cpf, email, telefone, data_nascimento, cargo_id, departamento_id,
   salario, status, etapa_admissao, data_admissao)
SELECT f.nome, regexp_replace(f.cpf, '[^0-9]', '', 'g'), f.email, f.telefone,
       f.data_nascimento, f.cargo_id, f.departamento_id, f.salario,
       CASE WHEN f.status = 'DESLIGADO' THEN 'DESLIGADO' ELSE 'ATIVO' END,
       'CONCLUIDA', f.created_at::date
  FROM funcionarios f
ON CONFLICT (cpf) DO NOTHING;

COMMIT;
