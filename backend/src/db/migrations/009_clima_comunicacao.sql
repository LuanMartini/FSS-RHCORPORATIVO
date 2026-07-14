BEGIN;

CREATE TABLE IF NOT EXISTS usuarios_colaboradores (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL UNIQUE REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comunicacao_publicacoes (
  id BIGSERIAL PRIMARY KEY,
  autor_colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'PUBLICACAO',
  conteudo VARCHAR(4000) NOT NULL,
  destinatario_kudos_id BIGINT REFERENCES colaboradores(id) ON DELETE RESTRICT,
  categoria_kudos VARCHAR(32),
  sentimento VARCHAR(12),
  sentimento_confianca NUMERIC(5,4),
  modelo_sentimento VARCHAR(40),
  idempotencia UUID NOT NULL,
  editado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  removido_em TIMESTAMPTZ,
  versao INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT ux_publicacao_idempotencia UNIQUE (autor_colaborador_id,idempotencia),
  CONSTRAINT ck_publicacao_tipo CHECK (tipo IN ('PUBLICACAO','KUDOS','COMUNICADO')),
  CONSTRAINT ck_publicacao_conteudo CHECK (length(trim(conteudo)) BETWEEN 1 AND 4000),
  CONSTRAINT ck_publicacao_kudos CHECK (
    (tipo='KUDOS' AND destinatario_kudos_id IS NOT NULL AND categoria_kudos IS NOT NULL AND destinatario_kudos_id<>autor_colaborador_id)
    OR (tipo<>'KUDOS' AND destinatario_kudos_id IS NULL AND categoria_kudos IS NULL)
  ),
  CONSTRAINT ck_publicacao_sentimento CHECK (sentimento IS NULL OR sentimento IN ('POSITIVO','NEUTRO','NEGATIVO')),
  CONSTRAINT ck_publicacao_confianca CHECK (sentimento_confianca IS NULL OR sentimento_confianca BETWEEN 0 AND 1)
);
CREATE INDEX IF NOT EXISTS ix_publicacoes_feed ON comunicacao_publicacoes (criado_em DESC,id DESC) WHERE removido_em IS NULL;
CREATE INDEX IF NOT EXISTS ix_publicacoes_autor ON comunicacao_publicacoes (autor_colaborador_id,criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_publicacoes_kudos ON comunicacao_publicacoes (destinatario_kudos_id,criado_em DESC) WHERE tipo='KUDOS';
CREATE INDEX IF NOT EXISTS ix_colaboradores_autocomplete_clima ON colaboradores ((lower(COALESCE(nome_social,nome_completo))) text_pattern_ops) WHERE status='ATIVO';

CREATE TABLE IF NOT EXISTS comunicacao_curtidas (
  publicacao_id BIGINT NOT NULL REFERENCES comunicacao_publicacoes(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (publicacao_id,colaborador_id)
);
CREATE INDEX IF NOT EXISTS ix_curtidas_colaborador ON comunicacao_curtidas (colaborador_id,criado_em DESC);

CREATE TABLE IF NOT EXISTS comunicacao_comentarios (
  id BIGSERIAL PRIMARY KEY,
  publicacao_id BIGINT NOT NULL REFERENCES comunicacao_publicacoes(id) ON DELETE CASCADE,
  autor_colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  conteudo VARCHAR(1500) NOT NULL,
  sentimento VARCHAR(12),
  sentimento_confianca NUMERIC(5,4),
  modelo_sentimento VARCHAR(40),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  removido_em TIMESTAMPTZ,
  CONSTRAINT ck_comentario_conteudo CHECK (length(trim(conteudo)) BETWEEN 1 AND 1500),
  CONSTRAINT ck_comentario_sentimento CHECK (sentimento IS NULL OR sentimento IN ('POSITIVO','NEUTRO','NEGATIVO')),
  CONSTRAINT ck_comentario_confianca CHECK (sentimento_confianca IS NULL OR sentimento_confianca BETWEEN 0 AND 1)
);
CREATE INDEX IF NOT EXISTS ix_comentarios_publicacao ON comunicacao_comentarios (publicacao_id,criado_em) WHERE removido_em IS NULL;

CREATE TABLE IF NOT EXISTS comunicacao_mencoes (
  id BIGSERIAL PRIMARY KEY,
  publicacao_id BIGINT REFERENCES comunicacao_publicacoes(id) ON DELETE CASCADE,
  comentario_id BIGINT REFERENCES comunicacao_comentarios(id) ON DELETE CASCADE,
  colaborador_mencionado_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_mencao_origem CHECK (num_nonnulls(publicacao_id,comentario_id)=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mencao_publicacao ON comunicacao_mencoes (publicacao_id,colaborador_mencionado_id) WHERE publicacao_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mencao_comentario ON comunicacao_mencoes (comentario_id,colaborador_mencionado_id) WHERE comentario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mencoes_destinatario ON comunicacao_mencoes (colaborador_mencionado_id,criado_em DESC);

CREATE TABLE IF NOT EXISTS kudos_saldos_semanais (
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  quantidade_total SMALLINT NOT NULL DEFAULT 5,
  quantidade_utilizada SMALLINT NOT NULL DEFAULT 0,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (colaborador_id,semana_inicio),
  CONSTRAINT ck_kudos_saldo CHECK (quantidade_total BETWEEN 0 AND 100 AND quantidade_utilizada BETWEEN 0 AND quantidade_total)
);

CREATE TABLE IF NOT EXISTS kudos_historico (
  id BIGSERIAL PRIMARY KEY,
  remetente_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  destinatario_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  publicacao_id BIGINT NOT NULL UNIQUE REFERENCES comunicacao_publicacoes(id) ON DELETE RESTRICT,
  categoria VARCHAR(32) NOT NULL,
  quantidade SMALLINT NOT NULL DEFAULT 1,
  semana_inicio DATE NOT NULL,
  idempotencia UUID NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_kudos_idempotencia UNIQUE (remetente_id,idempotencia),
  CONSTRAINT ck_kudos_quantidade CHECK (quantidade>0),
  CONSTRAINT ck_kudos_sem_autoelogio CHECK (remetente_id<>destinatario_id)
);
CREATE INDEX IF NOT EXISTS ix_kudos_destinatario_periodo ON kudos_historico (destinatario_id,semana_inicio,criado_em DESC);

CREATE TABLE IF NOT EXISTS pesquisas_clima (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(64) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  pergunta VARCHAR(500) NOT NULL,
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  minimo_grupo SMALLINT NOT NULL DEFAULT 3,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_pesquisa_ciclo UNIQUE (codigo,inicio),
  CONSTRAINT ck_pesquisa_periodo CHECK (fim>=inicio),
  CONSTRAINT ck_pesquisa_minimo_grupo CHECK (minimo_grupo BETWEEN 3 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_pesquisa_ativa ON pesquisas_clima (inicio,fim) WHERE ativa;

-- Esta tabela prova participação sem armazenar usuario_id ou colaborador_id.
-- O HMAC usa segredo externo ao banco e é diferente para cada pesquisa.
CREATE TABLE IF NOT EXISTS pesquisas_participacoes_anonimas (
  pesquisa_id BIGINT NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  comprovante_identidade CHAR(64) NOT NULL,
  emitido_em_bucket DATE NOT NULL DEFAULT current_date,
  PRIMARY KEY (pesquisa_id,comprovante_identidade),
  CONSTRAINT ck_participacao_hash CHECK (comprovante_identidade ~ '^[0-9a-f]{64}$')
);

-- A impressão da credencial impede replay, mas nunca é persistida junto da
-- participação e tampouco aparece na linha da resposta.
CREATE TABLE IF NOT EXISTS enps_credenciais_consumidas (
  pesquisa_id BIGINT NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  impressao_credencial CHAR(64) NOT NULL,
  usado_em_bucket DATE NOT NULL DEFAULT current_date,
  PRIMARY KEY (pesquisa_id,impressao_credencial),
  CONSTRAINT ck_credencial_hash CHECK (impressao_credencial ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS pesquisas_respostas_anonimas (
  id UUID PRIMARY KEY,
  pesquisa_id BIGINT NOT NULL REFERENCES pesquisas_clima(id) ON DELETE CASCADE,
  departamento_id INTEGER NOT NULL REFERENCES departamentos(id) ON DELETE RESTRICT,
  nota SMALLINT NOT NULL,
  feedback_cifrado BYTEA,
  feedback_iv BYTEA,
  feedback_tag BYTEA,
  sentimento VARCHAR(12) NOT NULL DEFAULT 'NEUTRO',
  sentimento_confianca NUMERIC(5,4) NOT NULL DEFAULT 0,
  modelo_sentimento VARCHAR(40) NOT NULL,
  recebido_em_bucket DATE NOT NULL DEFAULT current_date,
  criado_ordem UUID NOT NULL,
  CONSTRAINT ck_resposta_nota CHECK (nota BETWEEN 0 AND 10),
  CONSTRAINT ck_resposta_sentimento CHECK (sentimento IN ('POSITIVO','NEUTRO','NEGATIVO')),
  CONSTRAINT ck_resposta_confianca CHECK (sentimento_confianca BETWEEN 0 AND 1),
  CONSTRAINT ck_feedback_criptografado CHECK (
    (feedback_cifrado IS NULL AND feedback_iv IS NULL AND feedback_tag IS NULL)
    OR (feedback_cifrado IS NOT NULL AND octet_length(feedback_iv)=12 AND octet_length(feedback_tag)=16)
  )
);
CREATE INDEX IF NOT EXISTS ix_respostas_pesquisa_departamento ON pesquisas_respostas_anonimas (pesquisa_id,departamento_id);
CREATE INDEX IF NOT EXISTS ix_respostas_sentimento ON pesquisas_respostas_anonimas (pesquisa_id,sentimento);

CREATE OR REPLACE VIEW vw_enps_agregado_departamento AS
SELECT r.pesquisa_id,r.departamento_id,d.nome AS departamento,COUNT(*)::int AS respostas,
       ROUND(100.0*(COUNT(*) FILTER (WHERE r.nota>=9)-COUNT(*) FILTER (WHERE r.nota<=6))/NULLIF(COUNT(*),0),2) AS enps,
       ROUND(AVG(r.nota),2) AS media,
       COUNT(*) FILTER (WHERE r.sentimento='POSITIVO')::int AS positivos,
       COUNT(*) FILTER (WHERE r.sentimento='NEUTRO')::int AS neutros,
       COUNT(*) FILTER (WHERE r.sentimento='NEGATIVO')::int AS negativos
FROM pesquisas_respostas_anonimas r
JOIN pesquisas_clima p ON p.id=r.pesquisa_id
JOIN departamentos d ON d.id=r.departamento_id
GROUP BY r.pesquisa_id,r.departamento_id,d.nome,p.minimo_grupo
HAVING COUNT(*)>=p.minimo_grupo;

INSERT INTO pesquisas_clima (codigo,titulo,pergunta,inicio,fim,minimo_grupo)
VALUES ('PULSO_ENPS_SEMANAL','Pulso semanal','Em uma escala de 0 a 10, quanto você recomendaria esta empresa como um ótimo lugar para trabalhar?',date_trunc('week',current_date)::date,(date_trunc('week',current_date)+interval '6 days')::date,3)
ON CONFLICT (codigo,inicio) DO NOTHING;

COMMIT;
