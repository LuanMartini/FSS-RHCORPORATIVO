BEGIN;

CREATE TABLE IF NOT EXISTS limites_beneficios (
  id BIGSERIAL PRIMARY KEY,
  categoria VARCHAR(32) NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE CASCADE,
  minimo_percentual NUMERIC(7,4) NOT NULL DEFAULT 0,
  maximo_percentual NUMERIC(7,4) NOT NULL DEFAULT 100,
  minimo_centavos BIGINT NOT NULL DEFAULT 0,
  maximo_centavos BIGINT,
  tributavel BOOLEAN NOT NULL DEFAULT false,
  fundamento_tributario TEXT,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_limite_categoria CHECK (categoria IN ('VALE_REFEICAO','MOBILIDADE','SAUDE','EDUCACAO')),
  CONSTRAINT ck_limite_percentuais CHECK (minimo_percentual BETWEEN 0 AND 100 AND maximo_percentual BETWEEN minimo_percentual AND 100),
  CONSTRAINT ck_limite_valores CHECK (minimo_centavos>=0 AND (maximo_centavos IS NULL OR maximo_centavos>=minimo_centavos)),
  CONSTRAINT ck_limite_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim>=vigencia_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_limite_beneficio_escopo
  ON limites_beneficios (categoria,COALESCE(departamento_id,0),vigencia_inicio);
CREATE INDEX IF NOT EXISTS ix_limites_beneficios_vigencia ON limites_beneficios (ativo,vigencia_inicio,vigencia_fim,categoria);

CREATE TABLE IF NOT EXISTS carteira_colaborador (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  saldo_total_centavos BIGINT NOT NULL,
  saldo_alocado_centavos BIGINT NOT NULL DEFAULT 0,
  saldo_consumido_centavos BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'ABERTA',
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_carteira_colaborador_competencia UNIQUE (colaborador_id,competencia),
  CONSTRAINT ck_carteira_competencia CHECK (competencia=date_trunc('month',competencia)::date),
  CONSTRAINT ck_carteira_saldos CHECK (
    saldo_total_centavos>=0 AND saldo_alocado_centavos>=0 AND saldo_consumido_centavos>=0 AND
    saldo_alocado_centavos<=saldo_total_centavos AND saldo_consumido_centavos<=saldo_total_centavos
  ),
  CONSTRAINT ck_carteira_status CHECK (status IN ('ABERTA','FECHADA','BLOQUEADA'))
);
CREATE INDEX IF NOT EXISTS ix_carteira_competencia ON carteira_colaborador (competencia,status,colaborador_id);

CREATE TABLE IF NOT EXISTS alocacoes_beneficios (
  id BIGSERIAL PRIMARY KEY,
  carteira_id BIGINT NOT NULL REFERENCES carteira_colaborador(id) ON DELETE CASCADE,
  categoria VARCHAR(32) NOT NULL,
  valor_centavos BIGINT NOT NULL,
  percentual NUMERIC(7,4) NOT NULL,
  limite_id BIGINT NOT NULL REFERENCES limites_beneficios(id) ON DELETE RESTRICT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_alocacao_categoria UNIQUE (carteira_id,categoria),
  CONSTRAINT ck_alocacao_categoria CHECK (categoria IN ('VALE_REFEICAO','MOBILIDADE','SAUDE','EDUCACAO')),
  CONSTRAINT ck_alocacao_valor CHECK (valor_centavos>=0 AND percentual BETWEEN 0 AND 100)
);

-- Idempotência persiste o hash do comando e a resposta. Repetir a mesma chave
-- nunca executa uma segunda distribuição; payload diferente gera conflito.
CREATE TABLE IF NOT EXISTS operacoes_carteira (
  id UUID PRIMARY KEY,
  carteira_id BIGINT NOT NULL REFERENCES carteira_colaborador(id) ON DELETE CASCADE,
  chave_idempotencia UUID NOT NULL UNIQUE,
  payload_sha256 CHAR(64) NOT NULL,
  resposta JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_operacoes_carteira ON operacoes_carteira (carteira_id,criado_em DESC);

CREATE TABLE IF NOT EXISTS regras_aprovacao_reembolso (
  id BIGSERIAL PRIMARY KEY,
  valor_minimo_centavos BIGINT NOT NULL,
  valor_maximo_centavos BIGINT,
  niveis JSONB NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  CONSTRAINT ck_regra_valores CHECK (valor_minimo_centavos>=0 AND (valor_maximo_centavos IS NULL OR valor_maximo_centavos>=valor_minimo_centavos)),
  CONSTRAINT ck_regra_niveis CHECK (jsonb_typeof(niveis)='array' AND jsonb_array_length(niveis)>0)
);

CREATE TABLE IF NOT EXISTS transacoes_cartao (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  identificador_externo VARCHAR(120) NOT NULL UNIQUE,
  estabelecimento VARCHAR(180) NOT NULL,
  cnpj_estabelecimento CHAR(14),
  valor_centavos BIGINT NOT NULL,
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  transacionado_em TIMESTAMPTZ NOT NULL,
  cartao_final CHAR(4) NOT NULL,
  categoria_sugerida VARCHAR(32),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_transacao_valor CHECK (valor_centavos>0),
  CONSTRAINT ck_transacao_status CHECK (status IN ('PENDENTE','EM_CONCILIACAO','CONCILIADA','CONTESTADA')),
  CONSTRAINT ck_transacao_cartao CHECK (cartao_final ~ '^[0-9]{4}$')
);
CREATE INDEX IF NOT EXISTS ix_transacoes_cartao_pendentes ON transacoes_cartao (colaborador_id,status,transacionado_em DESC);

CREATE TABLE IF NOT EXISTS reembolsos_solicitacoes (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  transacao_cartao_id BIGINT REFERENCES transacoes_cartao(id) ON DELETE RESTRICT,
  categoria VARCHAR(32) NOT NULL,
  descricao TEXT NOT NULL,
  valor_solicitado_centavos BIGINT NOT NULL,
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  data_despesa DATE NOT NULL,
  cnpj_fornecedor CHAR(14),
  comprovante_storage_key VARCHAR(500) NOT NULL UNIQUE,
  comprovante_sha256 CHAR(64) NOT NULL,
  comprovante_mime VARCHAR(100) NOT NULL,
  comprovante_nome VARCHAR(255) NOT NULL,
  ocr_resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_confianca NUMERIC(5,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'EM_ANALISE',
  nivel_atual SMALLINT NOT NULL DEFAULT 1,
  total_niveis SMALLINT NOT NULL,
  chave_idempotencia UUID NOT NULL UNIQUE,
  versao INTEGER NOT NULL DEFAULT 1,
  solicitado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_reembolso_categoria CHECK (categoria IN ('MOBILIDADE','PASSAGEM','ALIMENTACAO','HOSPEDAGEM','SAUDE','EDUCACAO','OUTROS')),
  CONSTRAINT ck_reembolso_valor CHECK (valor_solicitado_centavos>0),
  CONSTRAINT ck_reembolso_ocr CHECK (ocr_confianca BETWEEN 0 AND 100),
  CONSTRAINT ck_reembolso_status CHECK (status IN ('EM_ANALISE','PENDENTE_GESTOR','PENDENTE_DIRETORIA','APROVADO','REJEITADO','PAGO','CANCELADO')),
  CONSTRAINT ck_reembolso_niveis CHECK (nivel_atual>=1 AND total_niveis>=1 AND nivel_atual<=total_niveis)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reembolso_transacao_cartao
  ON reembolsos_solicitacoes (transacao_cartao_id)
  WHERE transacao_cartao_id IS NOT NULL AND status NOT IN ('CANCELADO','REJEITADO');
CREATE INDEX IF NOT EXISTS ix_reembolsos_esteira ON reembolsos_solicitacoes (status,nivel_atual,solicitado_em);
CREATE INDEX IF NOT EXISTS ix_reembolsos_colaborador ON reembolsos_solicitacoes (colaborador_id,solicitado_em DESC);

CREATE TABLE IF NOT EXISTS reembolsos_aprovacoes (
  id BIGSERIAL PRIMARY KEY,
  reembolso_id BIGINT NOT NULL REFERENCES reembolsos_solicitacoes(id) ON DELETE CASCADE,
  nivel SMALLINT NOT NULL,
  papel VARCHAR(24) NOT NULL,
  aprovador_colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE SET NULL,
  decidido_por_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
  observacao TEXT,
  decidido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_aprovacao_reembolso_nivel UNIQUE (reembolso_id,nivel),
  CONSTRAINT ck_aprovacao_papel CHECK (papel IN ('GESTOR','DIRETORIA','FINANCEIRO')),
  CONSTRAINT ck_aprovacao_status CHECK (status IN ('PENDENTE','APROVADO','REJEITADO','IGNORADO'))
);
CREATE INDEX IF NOT EXISTS ix_aprovacoes_pendentes ON reembolsos_aprovacoes (status,papel,criado_em);

CREATE TABLE IF NOT EXISTS permissoes_beneficios (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel VARCHAR(24) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id,papel),
  CONSTRAINT ck_permissao_beneficios_papel CHECK (papel IN ('GESTOR','DIRETORIA','FINANCEIRO','RH'))
);

INSERT INTO limites_beneficios
  (categoria,minimo_percentual,maximo_percentual,minimo_centavos,maximo_centavos,tributavel,fundamento_tributario,vigencia_inicio)
VALUES
 ('VALE_REFEICAO',20,60,0,NULL,false,'Política corporativa e regras vigentes do PAT',date_trunc('year',now())::date),
 ('MOBILIDADE',10,40,0,NULL,true,'Tratamento tributário parametrizável conforme modalidade',date_trunc('year',now())::date),
 ('SAUDE',10,50,0,NULL,false,'Assistência à saúde conforme política coletiva',date_trunc('year',now())::date),
 ('EDUCACAO',0,30,0,NULL,true,'Auxílio educacional sujeito à análise de elegibilidade',date_trunc('year',now())::date)
ON CONFLICT (categoria,COALESCE(departamento_id,0),vigencia_inicio) DO NOTHING;

INSERT INTO regras_aprovacao_reembolso (valor_minimo_centavos,valor_maximo_centavos,niveis,vigencia_inicio)
SELECT 1,50000,'["GESTOR"]'::jsonb,date_trunc('year',now())::date
WHERE NOT EXISTS (SELECT 1 FROM regras_aprovacao_reembolso WHERE ativo);
INSERT INTO regras_aprovacao_reembolso (valor_minimo_centavos,valor_maximo_centavos,niveis,vigencia_inicio)
SELECT 50001,NULL,'["GESTOR","DIRETORIA"]'::jsonb,date_trunc('year',now())::date
WHERE NOT EXISTS (SELECT 1 FROM regras_aprovacao_reembolso WHERE valor_minimo_centavos=50001 AND ativo);

INSERT INTO carteira_colaborador (colaborador_id,competencia,saldo_total_centavos,saldo_alocado_centavos)
SELECT id,date_trunc('month',now())::date,100000,100000 FROM colaboradores WHERE status='ATIVO'
ON CONFLICT (colaborador_id,competencia) DO NOTHING;

INSERT INTO alocacoes_beneficios (carteira_id,categoria,valor_centavos,percentual,limite_id)
SELECT c.id,v.categoria,v.valor,v.percentual,l.id
FROM carteira_colaborador c
CROSS JOIN (VALUES ('VALE_REFEICAO',40000,40::numeric),('MOBILIDADE',30000,30::numeric),('SAUDE',20000,20::numeric),('EDUCACAO',10000,10::numeric)) v(categoria,valor,percentual)
JOIN limites_beneficios l ON l.categoria=v.categoria AND l.departamento_id IS NULL AND l.ativo
WHERE c.competencia=date_trunc('month',now())::date
ON CONFLICT (carteira_id,categoria) DO NOTHING;

INSERT INTO transacoes_cartao
  (colaborador_id,identificador_externo,estabelecimento,valor_centavos,transacionado_em,cartao_final,categoria_sugerida)
SELECT c.id,'DEMO-'||c.id||'-01','Mobilidade Urbana',3240,now()-interval '2 days','4821','MOBILIDADE'
FROM colaboradores c WHERE c.status='ATIVO'
ON CONFLICT (identificador_externo) DO NOTHING;
INSERT INTO transacoes_cartao
  (colaborador_id,identificador_externo,estabelecimento,valor_centavos,transacionado_em,cartao_final,categoria_sugerida)
SELECT c.id,'DEMO-'||c.id||'-02','Restaurante Central',8670,now()-interval '4 days','4821','ALIMENTACAO'
FROM colaboradores c WHERE c.status='ATIVO'
ON CONFLICT (identificador_externo) DO NOTHING;

INSERT INTO permissoes_beneficios (usuario_id,papel)
SELECT id,papel FROM usuarios CROSS JOIN (VALUES ('GESTOR'),('DIRETORIA'),('FINANCEIRO'),('RH')) p(papel)
ON CONFLICT (usuario_id,papel) DO NOTHING;

COMMIT;
