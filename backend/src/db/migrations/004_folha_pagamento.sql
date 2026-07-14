-- Motor de folha: valores monetarios sao persistidos em centavos (BIGINT).
-- PostgreSQL 16. A vigencia das tabelas evita recalculo historico com regras novas.

CREATE TABLE IF NOT EXISTS tabelas_tributarias (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('INSS_EMPREGADO', 'IRRF_MENSAL', 'IRRF_REDUCAO', 'FGTS')),
  nome VARCHAR(160) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  deducao_dependente_centavos BIGINT NOT NULL DEFAULT 0 CHECK (deducao_dependente_centavos >= 0),
  desconto_simplificado_centavos BIGINT NOT NULL DEFAULT 0 CHECK (desconto_simplificado_centavos >= 0),
  fundamento_legal TEXT NOT NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_tabela_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT uq_tabela_tributaria UNIQUE (tipo, vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS ix_tabelas_tributarias_vigencia
  ON tabelas_tributarias (tipo, vigencia_inicio DESC, vigencia_fim);

CREATE TABLE IF NOT EXISTS faixas_tributarias (
  id BIGSERIAL PRIMARY KEY,
  tabela_id BIGINT NOT NULL REFERENCES tabelas_tributarias(id) ON DELETE CASCADE,
  ordem SMALLINT NOT NULL CHECK (ordem > 0),
  limite_inferior_centavos BIGINT NOT NULL CHECK (limite_inferior_centavos >= 0),
  limite_superior_centavos BIGINT CHECK (limite_superior_centavos >= limite_inferior_centavos),
  aliquota_milionesimos INTEGER NOT NULL DEFAULT 0 CHECK (aliquota_milionesimos BETWEEN 0 AND 1000000),
  parcela_deduzir_centavos BIGINT NOT NULL DEFAULT 0 CHECK (parcela_deduzir_centavos >= 0),
  formula JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_faixa_ordem UNIQUE (tabela_id, ordem)
);

CREATE INDEX IF NOT EXISTS ix_faixas_tabela_limites
  ON faixas_tributarias (tabela_id, limite_inferior_centavos, limite_superior_centavos);

CREATE TABLE IF NOT EXISTS rubricas_folha (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(32) NOT NULL UNIQUE,
  descricao VARCHAR(180) NOT NULL,
  natureza VARCHAR(16) NOT NULL CHECK (natureza IN ('VENCIMENTO', 'DESCONTO', 'INFORMATIVA', 'ENCARGO')),
  natureza_esocial VARCHAR(8),
  incide_inss BOOLEAN NOT NULL DEFAULT false,
  incide_irrf BOOLEAN NOT NULL DEFAULT false,
  incide_fgts BOOLEAN NOT NULL DEFAULT false,
  dedutivel_irrf BOOLEAN NOT NULL DEFAULT false,
  sujeito_margem BOOLEAN NOT NULL DEFAULT false,
  prioridade_margem SMALLINT NOT NULL DEFAULT 100,
  ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dependentes_folha (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  nome VARCHAR(180) NOT NULL,
  cpf VARCHAR(11),
  deduz_irrf BOOLEAN NOT NULL DEFAULT true,
  valido_desde DATE NOT NULL,
  valido_ate DATE,
  CONSTRAINT ck_dependente_vigencia CHECK (valido_ate IS NULL OR valido_ate >= valido_desde)
);

CREATE INDEX IF NOT EXISTS ix_dependentes_funcionario_vigencia
  ON dependentes_folha (funcionario_id, valido_desde, valido_ate) WHERE deduz_irrf;

CREATE TABLE IF NOT EXISTS beneficios_flexiveis (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(32) NOT NULL UNIQUE,
  nome VARCHAR(160) NOT NULL,
  tipo VARCHAR(32) NOT NULL CHECK (tipo IN ('VALE_TRANSPORTE', 'VALE_REFEICAO', 'PLANO_SAUDE', 'PREVIDENCIA_PRIVADA', 'OUTRO')),
  rubrica_id BIGINT NOT NULL REFERENCES rubricas_folha(id),
  valor_padrao_centavos BIGINT NOT NULL DEFAULT 0 CHECK (valor_padrao_centavos >= 0),
  percentual_salario_milionesimos INTEGER CHECK (percentual_salario_milionesimos BETWEEN 0 AND 1000000),
  teto_centavos BIGINT CHECK (teto_centavos >= 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  regras JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS adesoes_beneficios (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  beneficio_id BIGINT NOT NULL REFERENCES beneficios_flexiveis(id),
  valor_funcionario_centavos BIGINT CHECK (valor_funcionario_centavos >= 0),
  percentual_funcionario_milionesimos INTEGER CHECK (percentual_funcionario_milionesimos BETWEEN 0 AND 1000000),
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  prioridade SMALLINT NOT NULL DEFAULT 100,
  CONSTRAINT ck_adesao_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT uq_adesao_vigencia UNIQUE (funcionario_id, beneficio_id, vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS ix_adesoes_funcionario_vigencia
  ON adesoes_beneficios (funcionario_id, vigencia_inicio, vigencia_fim);

CREATE TABLE IF NOT EXISTS pensoes_alimenticias (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  favorecido VARCHAR(180) NOT NULL,
  percentual_milionesimos INTEGER CHECK (percentual_milionesimos BETWEEN 0 AND 1000000),
  valor_fixo_centavos BIGINT CHECK (valor_fixo_centavos >= 0),
  dedutivel_irrf BOOLEAN NOT NULL DEFAULT true,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  CONSTRAINT ck_pensao_modalidade CHECK ((percentual_milionesimos IS NOT NULL) <> (valor_fixo_centavos IS NOT NULL)),
  CONSTRAINT ck_pensao_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE TABLE IF NOT EXISTS lancamentos_folha (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  competencia DATE NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  rubrica_id BIGINT NOT NULL REFERENCES rubricas_folha(id),
  quantidade NUMERIC(12,4),
  valor_centavos BIGINT NOT NULL CHECK (valor_centavos >= 0),
  origem VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  referencia_externa VARCHAR(120),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lancamento_origem UNIQUE NULLS NOT DISTINCT
    (funcionario_id, competencia, rubrica_id, origem, referencia_externa)
);

CREATE INDEX IF NOT EXISTS ix_lancamentos_competencia_funcionario
  ON lancamentos_folha (competencia, funcionario_id);

CREATE TABLE IF NOT EXISTS folhas_processadas (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  competencia DATE NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  tipo VARCHAR(24) NOT NULL DEFAULT 'MENSAL' CHECK (tipo IN ('MENSAL', 'ADIANTAMENTO', 'DECIMO_TERCEIRO', 'FERIAS', 'RESCISAO')),
  versao INTEGER NOT NULL DEFAULT 1 CHECK (versao > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'CONCLUIDA_COM_ERROS', 'ENVIADA_BANCO', 'CANCELADA')),
  total_funcionarios INTEGER NOT NULL DEFAULT 0 CHECK (total_funcionarios >= 0),
  processados INTEGER NOT NULL DEFAULT 0 CHECK (processados >= 0),
  falhas INTEGER NOT NULL DEFAULT 0 CHECK (falhas >= 0),
  progresso_percentual NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progresso_percentual BETWEEN 0 AND 100),
  total_bruto_centavos BIGINT NOT NULL DEFAULT 0,
  total_descontos_centavos BIGINT NOT NULL DEFAULT 0,
  total_liquido_centavos BIGINT NOT NULL DEFAULT 0,
  total_fgts_centavos BIGINT NOT NULL DEFAULT 0,
  custo_empresa_centavos BIGINT NOT NULL DEFAULT 0,
  iniciado_por BIGINT REFERENCES usuarios(id),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  enviado_banco_em TIMESTAMPTZ,
  erro_resumo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_folha_versao UNIQUE (empresa_id, competencia, tipo, versao)
);

CREATE INDEX IF NOT EXISTS ix_folhas_status_competencia
  ON folhas_processadas (status, competencia DESC, criado_em DESC);

-- Fila duravel no PostgreSQL. O worker usa FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS fila_folha (
  id BIGSERIAL PRIMARY KEY,
  folha_id BIGINT NOT NULL UNIQUE REFERENCES folhas_processadas(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'AGUARDANDO'
    CHECK (status IN ('AGUARDANDO', 'EXECUTANDO', 'CONCLUIDO', 'FALHOU')),
  prioridade SMALLINT NOT NULL DEFAULT 100,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  max_tentativas SMALLINT NOT NULL DEFAULT 3,
  executar_apos TIMESTAMPTZ NOT NULL DEFAULT now(),
  bloqueado_por VARCHAR(120),
  bloqueado_em TIMESTAMPTZ,
  ultimo_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fila_folha_claim
  ON fila_folha (prioridade, executar_apos, id) WHERE status = 'AGUARDANDO';

CREATE TABLE IF NOT EXISTS contracheques (
  id BIGSERIAL PRIMARY KEY,
  folha_id BIGINT NOT NULL REFERENCES folhas_processadas(id) ON DELETE CASCADE,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id),
  departamento_id INTEGER REFERENCES departamentos(id),
  tabela_inss_id BIGINT NOT NULL REFERENCES tabelas_tributarias(id),
  tabela_irrf_id BIGINT NOT NULL REFERENCES tabelas_tributarias(id),
  salario_base_centavos BIGINT NOT NULL,
  base_inss_centavos BIGINT NOT NULL,
  base_irrf_centavos BIGINT NOT NULL,
  base_fgts_centavos BIGINT NOT NULL,
  total_bruto_centavos BIGINT NOT NULL,
  total_descontos_centavos BIGINT NOT NULL,
  total_liquido_centavos BIGINT NOT NULL,
  fgts_centavos BIGINT NOT NULL,
  margem_consignavel_centavos BIGINT NOT NULL DEFAULT 0,
  margem_utilizada_centavos BIGINT NOT NULL DEFAULT 0,
  metodo_deducao_irrf VARCHAR(24) NOT NULL CHECK (metodo_deducao_irrf IN ('LEGAL', 'SIMPLIFICADO')),
  pdf_storage_key VARCHAR(255),
  pdf_sha256 CHAR(64),
  assinatura_status VARCHAR(32) NOT NULL DEFAULT 'PENDENTE_CERTIFICADO',
  assinatura_algoritmo VARCHAR(64),
  assinatura_base64 TEXT,
  esocial_demonstrativo_id VARCHAR(80) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contracheque_folha_funcionario UNIQUE (folha_id, funcionario_id),
  CONSTRAINT ck_contracheque_totais CHECK (total_bruto_centavos >= 0 AND total_descontos_centavos >= 0 AND total_liquido_centavos >= 0)
);

CREATE INDEX IF NOT EXISTS ix_contracheques_funcionario_folha
  ON contracheques (funcionario_id, folha_id DESC);
CREATE INDEX IF NOT EXISTS ix_contracheques_departamento_folha
  ON contracheques (folha_id, departamento_id);

CREATE TABLE IF NOT EXISTS contracheque_rubricas (
  id BIGSERIAL PRIMARY KEY,
  contracheque_id BIGINT NOT NULL REFERENCES contracheques(id) ON DELETE CASCADE,
  rubrica_id BIGINT REFERENCES rubricas_folha(id),
  codigo VARCHAR(32) NOT NULL,
  descricao VARCHAR(180) NOT NULL,
  natureza VARCHAR(16) NOT NULL,
  referencia VARCHAR(80),
  valor_centavos BIGINT NOT NULL CHECK (valor_centavos >= 0),
  ordem SMALLINT NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS ix_contracheque_rubricas_contracheque
  ON contracheque_rubricas (contracheque_id, natureza, ordem);

CREATE TABLE IF NOT EXISTS falhas_processamento_folha (
  id BIGSERIAL PRIMARY KEY,
  folha_id BIGINT NOT NULL REFERENCES folhas_processadas(id) ON DELETE CASCADE,
  funcionario_id INTEGER REFERENCES funcionarios(id),
  codigo VARCHAR(64) NOT NULL,
  mensagem TEXT NOT NULL,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_falha_folha_funcionario UNIQUE (folha_id, funcionario_id)
);

CREATE INDEX IF NOT EXISTS ix_falhas_folha ON falhas_processamento_folha (folha_id, criado_em);

CREATE TABLE IF NOT EXISTS eventos_esocial_folha (
  id BIGSERIAL PRIMARY KEY,
  folha_id BIGINT NOT NULL REFERENCES folhas_processadas(id) ON DELETE CASCADE,
  contracheque_id BIGINT REFERENCES contracheques(id) ON DELETE CASCADE,
  tipo_evento VARCHAR(12) NOT NULL CHECK (tipo_evento IN ('S-1200', 'S-1210', 'S-1299')),
  chave_idempotencia VARCHAR(160) NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PRONTO_ENVIO'
    CHECK (status IN ('PRONTO_ENVIO', 'ENVIANDO', 'ACEITO', 'REJEITADO', 'CANCELADO')),
  protocolo VARCHAR(120),
  resposta JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_eventos_esocial_fila
  ON eventos_esocial_folha (status, tipo_evento, criado_em) WHERE status IN ('PRONTO_ENVIO', 'REJEITADO');

INSERT INTO tabelas_tributarias
  (tipo, nome, vigencia_inicio, deducao_dependente_centavos, desconto_simplificado_centavos, fundamento_legal, metadados)
VALUES
  ('INSS_EMPREGADO', 'INSS empregado 2026', DATE '2026-01-01', 0, 0,
   'Portaria Interministerial MPS/MF 13/2026', '{"fonte":"https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal"}'),
  ('IRRF_MENSAL', 'IRRF mensal 2026', DATE '2026-01-01', 18959, 60720,
   'Lei 15.270/2025 e tabela RFB 2026', '{"reducao_ate_centavos":500000,"reducao_decrescente_ate_centavos":735000,"fonte":"https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026"}'),
  ('FGTS', 'FGTS contrato CLT', DATE '2026-01-01', 0, 0,
   'Lei 8.036/1990; aliquota geral de 8%', '{"aliquota_milionesimos":80000}')
ON CONFLICT (tipo, vigencia_inicio) DO NOTHING;

WITH t AS (SELECT id FROM tabelas_tributarias WHERE tipo='INSS_EMPREGADO' AND vigencia_inicio=DATE '2026-01-01')
INSERT INTO faixas_tributarias (tabela_id, ordem, limite_inferior_centavos, limite_superior_centavos, aliquota_milionesimos)
SELECT t.id, f.ordem, f.inferior, f.superior, f.aliquota FROM t CROSS JOIN (VALUES
  (1, 0::bigint, 162100::bigint, 75000),
  (2, 162100::bigint, 290284::bigint, 90000),
  (3, 290284::bigint, 435427::bigint, 120000),
  (4, 435427::bigint, 847555::bigint, 140000)
) AS f(ordem, inferior, superior, aliquota)
ON CONFLICT (tabela_id, ordem) DO NOTHING;

WITH t AS (SELECT id FROM tabelas_tributarias WHERE tipo='IRRF_MENSAL' AND vigencia_inicio=DATE '2026-01-01')
INSERT INTO faixas_tributarias
  (tabela_id, ordem, limite_inferior_centavos, limite_superior_centavos, aliquota_milionesimos, parcela_deduzir_centavos)
SELECT t.id, f.ordem, f.inferior, f.superior, f.aliquota, f.deducao FROM t CROSS JOIN (VALUES
  (1, 0::bigint, 242880::bigint, 0, 0::bigint),
  (2, 242880::bigint, 282665::bigint, 75000, 18216::bigint),
  (3, 282665::bigint, 375105::bigint, 150000, 39416::bigint),
  (4, 375105::bigint, 466468::bigint, 225000, 67549::bigint),
  (5, 466468::bigint, NULL::bigint, 275000, 90873::bigint)
) AS f(ordem, inferior, superior, aliquota, deducao)
ON CONFLICT (tabela_id, ordem) DO NOTHING;

INSERT INTO rubricas_folha
  (codigo, descricao, natureza, natureza_esocial, incide_inss, incide_irrf, incide_fgts, dedutivel_irrf, sujeito_margem, prioridade_margem)
VALUES
  ('SALARIO', 'Salario base', 'VENCIMENTO', '1000', true, true, true, false, false, 0),
  ('HORA_EXTRA_50', 'Horas extras 50%', 'VENCIMENTO', '1004', true, true, true, false, false, 0),
  ('HORA_EXTRA_100', 'Horas extras 100%', 'VENCIMENTO', '1004', true, true, true, false, false, 0),
  ('ADICIONAL_NOTURNO', 'Adicional noturno', 'VENCIMENTO', '1205', true, true, true, false, false, 0),
  ('FALTA', 'Faltas nao justificadas', 'DESCONTO', '9209', true, true, true, false, false, 0),
  ('INSS', 'Contribuicao previdenciaria', 'DESCONTO', '9201', false, false, false, true, false, 0),
  ('IRRF', 'Imposto de renda retido', 'DESCONTO', '9203', false, false, false, false, false, 0),
  ('FGTS', 'Deposito de FGTS', 'INFORMATIVA', '9908', false, false, false, false, false, 0),
  ('VALE_TRANSPORTE', 'Vale-transporte', 'DESCONTO', '9216', false, false, false, false, false, 0),
  ('VALE_REFEICAO', 'Vale-refeicao', 'DESCONTO', '9217', false, false, false, false, false, 0),
  ('PENSAO', 'Pensao alimenticia', 'DESCONTO', '9213', false, false, false, true, false, 0),
  ('PLANO_SAUDE', 'Plano de saude coparticipativo', 'DESCONTO', '9219', false, false, false, false, true, 10),
  ('PREVIDENCIA_PRIVADA', 'Previdencia privada', 'DESCONTO', '9224', false, false, false, false, true, 20)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO beneficios_flexiveis (codigo, nome, tipo, rubrica_id, valor_padrao_centavos, regras)
SELECT 'SAUDE_COPART', 'Plano de saude coparticipativo', 'PLANO_SAUDE', id, 35000, '{"sujeitoMargem":true}'::jsonb
FROM rubricas_folha WHERE codigo='PLANO_SAUDE'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO beneficios_flexiveis (codigo, nome, tipo, rubrica_id, valor_padrao_centavos, percentual_salario_milionesimos, regras)
SELECT 'PREV_PRIVADA', 'Previdencia privada', 'PREVIDENCIA_PRIVADA', id, 0, 50000, '{"sujeitoMargem":true,"dedutibilidadeIRRFDependeDoPlano":true}'::jsonb
FROM rubricas_folha WHERE codigo='PREVIDENCIA_PRIVADA'
ON CONFLICT (codigo) DO NOTHING;
