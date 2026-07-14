-- ATS de alta concorrencia. PostgreSQL relacional + documentos JSONB indexados.

ALTER TABLE vagas ADD COLUMN IF NOT EXISTS codigo VARCHAR(32);
ALTER TABLE vagas ADD COLUMN IF NOT EXISTS requisitos JSONB NOT NULL DEFAULT '{"skillsObrigatorias":[],"skillsDesejaveis":[],"idiomas":[],"anosExperienciaMin":0}'::jsonb;
ALTER TABLE vagas ADD COLUMN IF NOT EXISTS modalidade VARCHAR(24) NOT NULL DEFAULT 'HIBRIDO';
ALTER TABLE vagas ADD COLUMN IF NOT EXISTS localizacao VARCHAR(160);
ALTER TABLE vagas ADD COLUMN IF NOT EXISTS faixa_salarial JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vagas ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_vagas_codigo ON vagas (codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_vagas_requisitos_gin ON vagas USING GIN (requisitos jsonb_path_ops);

CREATE TABLE IF NOT EXISTS recrutadores_vagas (
  vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao VARCHAR(16) NOT NULL CHECK (permissao IN ('GESTOR', 'EDITOR', 'ENTREVISTADOR', 'LEITOR')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vaga_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS ix_recrutadores_usuario ON recrutadores_vagas (usuario_id, permissao, vaga_id);

CREATE TABLE IF NOT EXISTS candidatos_perfil (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(180) NOT NULL,
  email VARCHAR(180) NOT NULL,
  telefone VARCHAR(40),
  localizacao VARCHAR(180),
  headline VARCHAR(220),
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  experiencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  idiomas JSONB NOT NULL DEFAULT '[]'::jsonb,
  educacao JSONB NOT NULL DEFAULT '[]'::jsonb,
  dados_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  busca_texto TEXT NOT NULL DEFAULT '',
  curriculo_storage_key VARCHAR(255),
  curriculo_sha256 CHAR(64),
  curriculo_mime VARCHAR(100),
  curriculo_nome VARCHAR(255),
  parser_provider VARCHAR(40) NOT NULL DEFAULT 'SIMULATED_LLM_V1',
  parser_versao VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  consentimento_lgpd_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidatos_perfil_email ON candidatos_perfil (lower(email));
CREATE INDEX IF NOT EXISTS ix_candidatos_perfil_skills ON candidatos_perfil USING GIN (skills jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ix_candidatos_perfil_documento ON candidatos_perfil USING GIN (dados_extraidos jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ix_candidatos_perfil_busca ON candidatos_perfil USING GIN (to_tsvector('portuguese', busca_texto));

CREATE TABLE IF NOT EXISTS candidaturas (
  id BIGSERIAL PRIMARY KEY,
  vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  candidato_perfil_id BIGINT NOT NULL REFERENCES candidatos_perfil(id) ON DELETE CASCADE,
  origem VARCHAR(40) NOT NULL DEFAULT 'UPLOAD_RH',
  match_score SMALLINT NOT NULL DEFAULT 0 CHECK (match_score BETWEEN 0 AND 100),
  match_detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsavel_id INTEGER REFERENCES usuarios(id),
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em TIMESTAMPTZ,
  CONSTRAINT uq_candidatura_vaga_candidato UNIQUE (vaga_id, candidato_perfil_id)
);

CREATE INDEX IF NOT EXISTS ix_candidaturas_vaga_score ON candidaturas (vaga_id, match_score DESC, aplicada_em DESC);
CREATE INDEX IF NOT EXISTS ix_candidaturas_responsavel ON candidaturas (responsavel_id, atualizada_em DESC);

CREATE TABLE IF NOT EXISTS candidaturas_status_kanban (
  candidatura_id BIGINT PRIMARY KEY REFERENCES candidaturas(id) ON DELETE CASCADE,
  vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  etapa VARCHAR(32) NOT NULL DEFAULT 'APLICACAO' CHECK (etapa IN (
    'APLICACAO', 'TRIAGEM', 'ENTREVISTA_TECNICA', 'FIT_CULTURAL', 'PROPOSTA', 'CONTRATADO'
  )),
  posicao NUMERIC(20,10) NOT NULL DEFAULT 1000,
  versao INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
  bloqueado_por INTEGER REFERENCES usuarios(id),
  bloqueado_ate TIMESTAMPTZ,
  movido_por INTEGER REFERENCES usuarios(id),
  movido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_kanban_vaga_etapa_posicao ON candidaturas_status_kanban (vaga_id, etapa, posicao, candidatura_id);
CREATE INDEX IF NOT EXISTS ix_kanban_locks_ativos ON candidaturas_status_kanban (bloqueado_ate, bloqueado_por) WHERE bloqueado_por IS NOT NULL;

CREATE TABLE IF NOT EXISTS historico_kanban (
  id BIGSERIAL PRIMARY KEY,
  candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
  vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  etapa_origem VARCHAR(32),
  etapa_destino VARCHAR(32) NOT NULL,
  versao_origem INTEGER NOT NULL,
  versao_destino INTEGER NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_historico_kanban_candidatura ON historico_kanban (candidatura_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS mensagens_chat (
  id BIGSERIAL PRIMARY KEY,
  candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
  remetente_tipo VARCHAR(16) NOT NULL CHECK (remetente_tipo IN ('RECRUTADOR', 'CANDIDATO', 'SISTEMA')),
  remetente_usuario_id INTEGER REFERENCES usuarios(id),
  remetente_candidato_id BIGINT REFERENCES candidatos_perfil(id),
  mensagem TEXT NOT NULL CHECK (char_length(mensagem) BETWEEN 1 AND 8000),
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  idempotencia UUID NOT NULL,
  lida_em TIMESTAMPTZ,
  editada_em TIMESTAMPTZ,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mensagem_idempotencia UNIQUE (candidatura_id, idempotencia),
  CONSTRAINT ck_mensagem_remetente CHECK (
    (remetente_tipo='RECRUTADOR' AND remetente_usuario_id IS NOT NULL) OR
    (remetente_tipo='CANDIDATO' AND remetente_candidato_id IS NOT NULL) OR
    remetente_tipo='SISTEMA'
  )
);

CREATE INDEX IF NOT EXISTS ix_mensagens_candidatura_tempo ON mensagens_chat (candidatura_id, criada_em DESC, id DESC);

CREATE TABLE IF NOT EXISTS agenda_entrevistas (
  id BIGSERIAL PRIMARY KEY,
  candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
  vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  titulo VARCHAR(220) NOT NULL,
  tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('TRIAGEM', 'TECNICA', 'FIT_CULTURAL', 'FINAL')),
  inicio_em TIMESTAMPTZ NOT NULL,
  fim_em TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  participantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  provedor VARCHAR(20) NOT NULL DEFAULT 'INTERNO' CHECK (provedor IN ('INTERNO', 'GOOGLE', 'OUTLOOK')),
  evento_externo_id VARCHAR(255),
  link_reuniao TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'AGENDADA' CHECK (status IN (
    'PENDENTE_SINCRONIZACAO', 'AGENDADA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA', 'FALHA_SINCRONIZACAO'
  )),
  criado_por INTEGER REFERENCES usuarios(id),
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_agenda_periodo CHECK (fim_em > inicio_em)
);

CREATE INDEX IF NOT EXISTS ix_agenda_vaga_inicio ON agenda_entrevistas (vaga_id, inicio_em, status);
CREATE INDEX IF NOT EXISTS ix_agenda_candidatura ON agenda_entrevistas (candidatura_id, inicio_em DESC);

CREATE TABLE IF NOT EXISTS tokens_portal_candidato (
  id BIGSERIAL PRIMARY KEY,
  candidatura_id BIGINT NOT NULL REFERENCES candidaturas(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  ultimo_acesso_em TIMESTAMPTZ,
  revogado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tokens_portal_validade ON tokens_portal_candidato (token_hash, expira_em) WHERE revogado_em IS NULL;

CREATE TABLE IF NOT EXISTS ats_eventos (
  id BIGSERIAL PRIMARY KEY,
  agregado_tipo VARCHAR(40) NOT NULL,
  agregado_id BIGINT NOT NULL,
  tipo VARCHAR(80) NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ats_eventos_agregado ON ats_eventos (agregado_tipo, agregado_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_ats_eventos_payload ON ats_eventos USING GIN (payload jsonb_path_ops);

INSERT INTO recrutadores_vagas (vaga_id, usuario_id, permissao)
SELECT v.id, u.id, 'GESTOR' FROM vagas v CROSS JOIN usuarios u
ON CONFLICT (vaga_id, usuario_id) DO NOTHING;

-- Migra candidatos legados sem duplicar perfis/candidaturas.
INSERT INTO candidatos_perfil (nome, email, telefone, curriculo_nome, dados_extraidos, busca_texto)
SELECT DISTINCT ON (lower(c.email)) c.nome, lower(c.email), c.telefone, c.link_curriculo,
  jsonb_build_object('origem', 'LEGADO'), concat_ws(' ', c.nome, c.email)
FROM candidatos c
WHERE c.email IS NOT NULL
ORDER BY lower(c.email), c.id DESC
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO candidaturas (vaga_id, candidato_perfil_id, origem, match_score, match_detalhes, aplicada_em)
SELECT c.vaga_id, p.id, 'LEGADO', 0, '{"motivo":"Perfil migrado; reprocessar match"}'::jsonb, c.created_at
FROM candidatos c JOIN candidatos_perfil p ON lower(p.email)=lower(c.email)
ON CONFLICT (vaga_id, candidato_perfil_id) DO NOTHING;

INSERT INTO candidaturas_status_kanban (candidatura_id, vaga_id, etapa, posicao)
SELECT a.id, a.vaga_id,
  CASE upper(COALESCE(c.fase, 'TRIAGEM'))
    WHEN 'APLICACAO' THEN 'APLICACAO'
    WHEN 'ENTREVISTA' THEN 'ENTREVISTA_TECNICA'
    WHEN 'PROPOSTA' THEN 'PROPOSTA'
    WHEN 'CONTRATADO' THEN 'CONTRATADO'
    ELSE 'TRIAGEM'
  END,
  row_number() OVER (PARTITION BY a.vaga_id, c.fase ORDER BY c.id) * 1000
FROM candidaturas a
JOIN candidatos_perfil p ON p.id=a.candidato_perfil_id
JOIN candidatos c ON c.vaga_id=a.vaga_id AND lower(c.email)=lower(p.email)
ON CONFLICT (candidatura_id) DO NOTHING;
