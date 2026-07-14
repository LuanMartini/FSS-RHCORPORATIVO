BEGIN;

-- Menor privilegio e sessoes revogaveis -------------------------------------
ALTER TABLE usuarios ALTER COLUMN perfil SET DEFAULT 'COLABORADOR';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS permissoes (
  codigo VARCHAR(80) PRIMARY KEY,
  descricao VARCHAR(240) NOT NULL,
  classificacao VARCHAR(16) NOT NULL DEFAULT 'INTERNA'
    CHECK (classificacao IN ('INTERNA','SENSIVEL','SAUDE','FINANCEIRA'))
);

CREATE TABLE IF NOT EXISTS perfis_permissoes (
  perfil VARCHAR(32) NOT NULL,
  permissao VARCHAR(80) NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (perfil, permissao),
  CONSTRAINT ck_perfil_permissao_perfil CHECK
    (perfil IN ('ADMINISTRADOR','AUDITOR','RH','GESTOR','COLABORADOR'))
);

INSERT INTO permissoes (codigo,descricao,classificacao) VALUES
  ('rh.dashboard.read','Visualizar indicadores gerais de RH','INTERNA'),
  ('employee.read','Listar e consultar colaboradores','SENSIVEL'),
  ('employee.write','Admitir e alterar colaboradores','SENSIVEL'),
  ('employee.terminate','Desligar colaboradores','SENSIVEL'),
  ('onboarding.read','Consultar admissoes','SENSIVEL'),
  ('onboarding.write','Criar admissoes e contratos','SENSIVEL'),
  ('onboarding.document.review','Validar e visualizar documentos admissionais','SENSIVEL'),
  ('organization.read','Consultar organograma','INTERNA'),
  ('organization.write','Alterar hierarquia organizacional','SENSIVEL'),
  ('time.self','Operar a propria jornada','SENSIVEL'),
  ('time.manage','Consultar e aprovar jornada da equipe','SENSIVEL'),
  ('time.hr.approve','Aprovar ajustes de jornada como RH','SENSIVEL'),
  ('payroll.read','Consultar folha corporativa','FINANCEIRA'),
  ('payroll.run','Processar folha','FINANCEIRA'),
  ('payroll.send_bank','Enviar folha ao banco','FINANCEIRA'),
  ('payroll.simulate','Simular calculo de folha','FINANCEIRA'),
  ('performance.read','Consultar desempenho','SENSIVEL'),
  ('performance.manage','Recalcular e calibrar desempenho','SENSIVEL'),
  ('benefits.self','Operar os proprios beneficios e reembolsos','FINANCEIRA'),
  ('benefits.approve','Aprovar beneficios e reembolsos','FINANCEIRA'),
  ('lms.use','Consumir trilhas e provas','INTERNA'),
  ('climate.use','Usar mural e pesquisas','INTERNA'),
  ('climate.analytics','Consultar analytics de clima','SENSIVEL'),
  ('ats.use','Acessar ATS sujeito ao escopo da vaga','SENSIVEL'),
  ('audit.read','Consultar auditoria e analytics','SENSIVEL'),
  ('audit.verify','Verificar integridade do ledger','SENSIVEL')
ON CONFLICT (codigo) DO UPDATE SET
  descricao=EXCLUDED.descricao, classificacao=EXCLUDED.classificacao;

INSERT INTO perfis_permissoes (perfil,permissao)
SELECT 'ADMINISTRADOR',codigo FROM permissoes
ON CONFLICT DO NOTHING;

INSERT INTO perfis_permissoes (perfil,permissao) VALUES
  ('AUDITOR','audit.read'),('AUDITOR','audit.verify'),
  ('RH','rh.dashboard.read'),('RH','employee.read'),('RH','employee.write'),
  ('RH','employee.terminate'),('RH','onboarding.read'),('RH','onboarding.write'),
  ('RH','onboarding.document.review'),('RH','organization.read'),('RH','organization.write'),
  ('RH','time.manage'),('RH','time.hr.approve'),('RH','payroll.read'),
  ('RH','payroll.run'),('RH','payroll.simulate'),('RH','performance.read'),
  ('RH','performance.manage'),('RH','benefits.approve'),('RH','climate.analytics'),
  ('RH','ats.use'),
  ('GESTOR','rh.dashboard.read'),('GESTOR','employee.read'),('GESTOR','organization.read'),
  ('GESTOR','time.self'),('GESTOR','time.manage'),('GESTOR','performance.read'),
  ('GESTOR','benefits.self'),('GESTOR','benefits.approve'),('GESTOR','lms.use'),
  ('GESTOR','climate.use'),('GESTOR','ats.use'),
  ('COLABORADOR','time.self'),('COLABORADOR','benefits.self'),
  ('COLABORADOR','lms.use'),('COLABORADOR','climate.use')
ON CONFLICT DO NOTHING;

-- Fonte canonica: funcionarios passa a ser apenas identificador legado -------
CREATE TABLE IF NOT EXISTS funcionarios_colaboradores (
  funcionario_id INTEGER PRIMARY KEY REFERENCES funcionarios(id) ON DELETE RESTRICT,
  colaborador_id BIGINT NOT NULL UNIQUE REFERENCES colaboradores(id) ON DELETE RESTRICT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO funcionarios_colaboradores (funcionario_id,colaborador_id)
SELECT f.id,c.id FROM funcionarios f JOIN colaboradores c ON c.cpf=f.cpf
ON CONFLICT DO NOTHING;

ALTER TABLE dependentes_folha ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE adesoes_beneficios ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE pensoes_alimenticias ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE lancamentos_folha ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE CASCADE;
ALTER TABLE contracheques ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE RESTRICT;
ALTER TABLE falhas_processamento_folha ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE RESTRICT;

ALTER TABLE dependentes_folha ALTER COLUMN funcionario_id DROP NOT NULL;
ALTER TABLE adesoes_beneficios ALTER COLUMN funcionario_id DROP NOT NULL;
ALTER TABLE pensoes_alimenticias ALTER COLUMN funcionario_id DROP NOT NULL;
ALTER TABLE lancamentos_folha ALTER COLUMN funcionario_id DROP NOT NULL;
ALTER TABLE contracheques ALTER COLUMN funcionario_id DROP NOT NULL;


UPDATE dependentes_folha x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;
UPDATE adesoes_beneficios x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;
UPDATE pensoes_alimenticias x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;
UPDATE lancamentos_folha x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;
UPDATE contracheques x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;
UPDATE falhas_processamento_folha x SET colaborador_id=m.colaborador_id
  FROM funcionarios_colaboradores m WHERE x.funcionario_id=m.funcionario_id AND x.colaborador_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_dependentes_colaborador_vigencia
  ON dependentes_folha (colaborador_id,valido_desde,valido_ate) WHERE deduz_irrf;
CREATE INDEX IF NOT EXISTS ix_adesoes_colaborador_vigencia
  ON adesoes_beneficios (colaborador_id,vigencia_inicio,vigencia_fim);
CREATE INDEX IF NOT EXISTS ix_lancamentos_competencia_colaborador
  ON lancamentos_folha (competencia,colaborador_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_contracheque_folha_colaborador
  ON contracheques (folha_id,colaborador_id) WHERE colaborador_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_falha_folha_colaborador
  ON falhas_processamento_folha (folha_id,colaborador_id) WHERE colaborador_id IS NOT NULL;

-- Ciclo de vida integrado ATS -> Core -> Jornada -> Folha --------------------
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(40) NOT NULL DEFAULT 'PRE_ADMISSAO';
DO $$ BEGIN
  ALTER TABLE colaboradores ADD CONSTRAINT ck_colaborador_lifecycle CHECK (lifecycle_status IN (
    'CANDIDATO_APROVADO','PRE_ADMISSAO','DOCUMENTOS_PENDENTES','VALIDACAO_RH',
    'CONTRATO_PENDENTE','PRONTO_PARA_ATIVAR','ATIVO','AFASTADO','DESLIGADO','CANCELADO'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
UPDATE colaboradores SET lifecycle_status=CASE status
  WHEN 'ATIVO' THEN 'ATIVO' WHEN 'AFASTADO' THEN 'AFASTADO'
  WHEN 'DESLIGADO' THEN 'DESLIGADO' ELSE 'PRE_ADMISSAO' END;
CREATE INDEX IF NOT EXISTS ix_colaborador_lifecycle ON colaboradores (lifecycle_status,updated_at DESC);

CREATE TABLE IF NOT EXISTS admissoes_origens (
  candidatura_id BIGINT PRIMARY KEY REFERENCES candidaturas(id) ON DELETE RESTRICT,
  colaborador_id BIGINT UNIQUE REFERENCES colaboradores(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDENTE_DADOS'
    CHECK (status IN ('PENDENTE_DADOS','PRE_ADMISSAO','ATIVO','CANCELADO')),
  aprovado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  aprovado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agregado_tipo VARCHAR(60) NOT NULL,
  agregado_id VARCHAR(160) NOT NULL,
  tipo VARCHAR(120) NOT NULL,
  versao SMALLINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_em TIMESTAMPTZ,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  ultimo_erro TEXT
);
CREATE INDEX IF NOT EXISTS ix_outbox_pendente
  ON outbox_eventos (criado_em,id) WHERE publicado_em IS NULL;

CREATE TABLE IF NOT EXISTS audit_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ator_referencia VARCHAR(180) NOT NULL,
  acao VARCHAR(80) NOT NULL,
  recurso_tipo VARCHAR(80) NOT NULL,
  recurso_id VARCHAR(160),
  ip INET,
  user_agent TEXT,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em TIMESTAMPTZ,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  ultimo_erro TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_outbox_pendente
  ON audit_outbox (criado_em,id) WHERE processado_em IS NULL;

CREATE TABLE IF NOT EXISTS snapshots_folha_colaboradores (
  folha_id BIGINT NOT NULL REFERENCES folhas_processadas(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  dados JSONB NOT NULL,
  hash_dados CHAR(64) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folha_id,colaborador_id),
  CONSTRAINT ck_snapshot_hash CHECK (hash_dados ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS perfis_folha_colaboradores (
  colaborador_id BIGINT PRIMARY KEY REFERENCES colaboradores(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'PRONTO' CHECK (status IN ('PENDENTE','PRONTO','BLOQUEADO')),
  banco_codigo VARCHAR(12),
  agencia_cifrada BYTEA,
  conta_cifrada BYTEA,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO perfis_folha_colaboradores (colaborador_id,status)
SELECT id,'PRONTO' FROM colaboradores WHERE status IN ('ATIVO','AFASTADO')
ON CONFLICT (colaborador_id) DO NOTHING;

COMMIT;
