BEGIN;

-- Filiais e geofences --------------------------------------------------------
CREATE TABLE IF NOT EXISTS filiais (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  codigo VARCHAR(30) NOT NULL UNIQUE,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  geofence_tipo VARCHAR(16) NOT NULL DEFAULT 'RAIO',
  raio_metros INTEGER,
  poligono JSONB,
  tolerancia_gps_metros INTEGER NOT NULL DEFAULT 50,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_filial_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_filial_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_filial_geofence_tipo CHECK (geofence_tipo IN ('RAIO','POLIGONO')),
  CONSTRAINT ck_filial_geofence_config CHECK (
    (geofence_tipo = 'RAIO' AND raio_metros BETWEEN 10 AND 50000) OR
    (geofence_tipo = 'POLIGONO' AND jsonb_typeof(poligono) = 'array' AND jsonb_array_length(poligono) >= 3)
  )
);

INSERT INTO filiais (nome, codigo, latitude, longitude, geofence_tipo, raio_metros)
VALUES ('Matriz Sao Paulo', 'MATRIZ-SP', -23.5505200, -46.6333080, 'RAIO', 500)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS filial_id BIGINT REFERENCES filiais(id) ON DELETE RESTRICT;
UPDATE colaboradores SET filial_id = (SELECT id FROM filiais WHERE codigo = 'MATRIZ-SP') WHERE filial_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_colaboradores_filial_ativos
  ON colaboradores (filial_id) WHERE status <> 'DESLIGADO';

CREATE TABLE IF NOT EXISTS biometrias_faciais (
  colaborador_id BIGINT PRIMARY KEY REFERENCES colaboradores(id) ON DELETE CASCADE,
  template_hash CHAR(64) NOT NULL,
  foto_storage_key VARCHAR(500) NOT NULL,
  algoritmo VARCHAR(40) NOT NULL DEFAULT 'SIMULATED-HASH-V1',
  consentimento_em TIMESTAMPTZ NOT NULL,
  consentimento_ip INET,
  versao INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escalas -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalas_trabalho (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  tipo VARCHAR(24) NOT NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
  inicio_vigencia DATE NOT NULL,
  fim_vigencia DATE,
  minutos_jornada_padrao INTEGER NOT NULL,
  minutos_intervalo INTEGER NOT NULL DEFAULT 60,
  tolerancia_atraso_minutos INTEGER NOT NULL DEFAULT 5,
  horario_entrada TIME,
  horario_saida TIME,
  inicio_noturno TIME NOT NULL DEFAULT '22:00',
  fim_noturno TIME NOT NULL DEFAULT '05:00',
  minutos_hora_noturna NUMERIC(4,1) NOT NULL DEFAULT 52.5,
  configuracao_ciclo JSONB NOT NULL DEFAULT '{}'::jsonb,
  politica_banco JSONB NOT NULL DEFAULT '{"compensaExtras":true,"percentual":100}'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_escala_tipo CHECK (tipo IN ('12X36','6X1','5X2','ROTATIVA','FLEXIVEL')),
  CONSTRAINT ck_escala_vigencia CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CONSTRAINT ck_escala_minutos CHECK (minutos_jornada_padrao BETWEEN 1 AND 1440),
  CONSTRAINT ck_escala_hora_noturna CHECK (minutos_hora_noturna > 0 AND minutos_hora_noturna <= 60)
);

CREATE TABLE IF NOT EXISTS colaboradores_escalas (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  escala_id BIGINT NOT NULL REFERENCES escalas_trabalho(id) ON DELETE RESTRICT,
  inicio DATE NOT NULL,
  fim DATE,
  ciclo_offset SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_colaborador_escala_vigencia CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX IF NOT EXISTS ix_colaborador_escala_consulta
  ON colaboradores_escalas (colaborador_id, inicio DESC, fim);
CREATE UNIQUE INDEX IF NOT EXISTS ux_escalas_nome ON escalas_trabalho (nome);

INSERT INTO escalas_trabalho
  (nome, tipo, inicio_vigencia, minutos_jornada_padrao, minutos_intervalo,
   horario_entrada, horario_saida, configuracao_ciclo)
VALUES
  ('Administrativo 5x2', '5X2', DATE '2020-01-01', 480, 60, TIME '08:00', TIME '17:00',
   '{"diasSemana":[1,2,3,4,5],"extra100DomingoFeriado":true}'::jsonb),
  ('Plantao 12x36', '12X36', DATE '2020-01-01', 720, 60, TIME '07:00', TIME '19:00',
   '{"cicloDias":2,"diasTrabalho":[0],"extra100Folga":true}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO colaboradores_escalas (colaborador_id, escala_id, inicio)
SELECT c.id, e.id, GREATEST(COALESCE(c.data_admissao, CURRENT_DATE), e.inicio_vigencia)
  FROM colaboradores c CROSS JOIN LATERAL (
    SELECT id, inicio_vigencia FROM escalas_trabalho WHERE tipo = '5X2' ORDER BY id LIMIT 1
  ) e
 WHERE NOT EXISTS (SELECT 1 FROM colaboradores_escalas ce WHERE ce.colaborador_id = c.id);

-- Marcações imutáveis particionadas ----------------------------------------
CREATE SEQUENCE IF NOT EXISTS pontos_nsr_seq START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE IF NOT EXISTS pontos_registrados (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  nsr BIGINT NOT NULL DEFAULT nextval('pontos_nsr_seq'),
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  filial_id BIGINT NOT NULL REFERENCES filiais(id) ON DELETE RESTRICT,
  tipo VARCHAR(24) NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL,
  capturado_em_dispositivo TIMESTAMPTZ,
  gravado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  timezone VARCHAR(60) NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  precisao_gps_metros NUMERIC(10,2),
  distancia_filial_metros NUMERIC(12,2),
  dentro_geofence BOOLEAN NOT NULL,
  confianca_biometrica NUMERIC(5,2) NOT NULL,
  biometria_aprovada BOOLEAN NOT NULL,
  foto_storage_key VARCHAR(500) NOT NULL,
  coletor_id VARCHAR(120) NOT NULL,
  endereco_ip INET,
  user_agent VARCHAR(500),
  idempotency_key UUID NOT NULL,
  hash_anterior CHAR(64),
  hash_registro CHAR(64) NOT NULL,
  comprovante JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, registrado_em),
  CONSTRAINT ck_ponto_tipo CHECK (tipo IN ('ENTRADA','INTERVALO_INICIO','INTERVALO_FIM','SAIDA')),
  CONSTRAINT ck_ponto_coordenadas CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_ponto_biometria CHECK (confianca_biometrica BETWEEN 0 AND 100),
  CONSTRAINT ck_ponto_integridade CHECK (dentro_geofence = TRUE AND biometria_aprovada = TRUE)
) PARTITION BY RANGE (registrado_em);

CREATE INDEX IF NOT EXISTS ix_pontos_colaborador_data
  ON pontos_registrados (colaborador_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS ix_pontos_nsr ON pontos_registrados (nsr);
CREATE INDEX IF NOT EXISTS ix_pontos_hash ON pontos_registrados (hash_registro);

CREATE TABLE IF NOT EXISTS pontos_idempotencia (
  idempotency_key UUID PRIMARY KEY,
  nsr BIGINT NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_bloquear_mutacao_ponto() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.manutencao_fiscal_autorizada', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Marcacoes originais sao imutaveis; use o fluxo de tratamento/ajuste' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pontos_imutaveis ON pontos_registrados;
CREATE TRIGGER trg_pontos_imutaveis
BEFORE UPDATE OR DELETE ON pontos_registrados
FOR EACH ROW EXECUTE FUNCTION fn_bloquear_mutacao_ponto();

-- Tratamento, ajuste em dois níveis e banco de horas -------------------------
CREATE TABLE IF NOT EXISTS solicitacoes_ajuste (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  data_referencia DATE NOT NULL,
  tipo VARCHAR(32) NOT NULL,
  horario_solicitado TIMESTAMPTZ,
  tipo_marcacao VARCHAR(24),
  justificativa TEXT NOT NULL,
  anexo_storage_key VARCHAR(500),
  anexo_nome VARCHAR(255),
  anexo_mime_type VARCHAR(100),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDENTE_GESTOR',
  gestor_id BIGINT REFERENCES colaboradores(id) ON DELETE SET NULL,
  gestor_decisao_em TIMESTAMPTZ,
  gestor_observacao TEXT,
  rh_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  rh_decisao_em TIMESTAMPTZ,
  rh_observacao TEXT,
  solicitado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, solicitado_em),
  CONSTRAINT ck_ajuste_tipo CHECK (tipo IN ('INCLUSAO_MARCACAO','DESCONSIDERACAO','ATESTADO','ABONO')),
  CONSTRAINT ck_ajuste_status CHECK (status IN ('PENDENTE_GESTOR','PENDENTE_RH','APROVADO','REPROVADO_GESTOR','REPROVADO_RH','CANCELADO')),
  CONSTRAINT ck_ajuste_justificativa CHECK (LENGTH(TRIM(justificativa)) >= 10),
  CONSTRAINT ck_ajuste_marcacao CHECK (
    tipo <> 'INCLUSAO_MARCACAO' OR (horario_solicitado IS NOT NULL AND tipo_marcacao IS NOT NULL)
  )
) PARTITION BY RANGE (solicitado_em);
CREATE INDEX IF NOT EXISTS ix_ajustes_colaborador_data
  ON solicitacoes_ajuste (colaborador_id, data_referencia DESC);
CREATE INDEX IF NOT EXISTS ix_ajustes_fila
  ON solicitacoes_ajuste (status, solicitado_em) WHERE status IN ('PENDENTE_GESTOR','PENDENTE_RH');

CREATE TABLE IF NOT EXISTS aprovacoes_ajuste (
  id BIGSERIAL PRIMARY KEY,
  solicitacao_id BIGINT NOT NULL,
  solicitacao_criada_em TIMESTAMPTZ NOT NULL,
  nivel VARCHAR(16) NOT NULL,
  decisao VARCHAR(16) NOT NULL,
  responsavel_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE SET NULL,
  observacao TEXT,
  decidido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (solicitacao_id, solicitacao_criada_em)
    REFERENCES solicitacoes_ajuste(id, solicitado_em) ON DELETE RESTRICT,
  CONSTRAINT ck_aprovacao_nivel CHECK (nivel IN ('GESTOR','RH')),
  CONSTRAINT ck_aprovacao_decisao CHECK (decisao IN ('APROVADO','REPROVADO'))
);

CREATE TABLE IF NOT EXISTS marcacoes_tratadas (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  solicitacao_id BIGINT NOT NULL,
  solicitacao_criada_em TIMESTAMPTZ NOT NULL,
  tipo VARCHAR(24) NOT NULL,
  marcado_em TIMESTAMPTZ NOT NULL,
  operacao VARCHAR(24) NOT NULL DEFAULT 'INCLUSAO',
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (solicitacao_id, solicitacao_criada_em)
    REFERENCES solicitacoes_ajuste(id, solicitado_em) ON DELETE RESTRICT,
  CONSTRAINT ck_marcacao_tratada_tipo CHECK (tipo IN ('ENTRADA','INTERVALO_INICIO','INTERVALO_FIM','SAIDA')),
  CONSTRAINT ck_marcacao_tratada_operacao CHECK (operacao IN ('INCLUSAO','DESCONSIDERACAO','PRE_ASSINALADA'))
);
CREATE INDEX IF NOT EXISTS ix_marcacoes_tratadas_espelho
  ON marcacoes_tratadas (colaborador_id, marcado_em);

CREATE TABLE IF NOT EXISTS banco_horas (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
  competencia DATE NOT NULL,
  minutos_previstos INTEGER NOT NULL DEFAULT 0,
  minutos_trabalhados INTEGER NOT NULL DEFAULT 0,
  minutos_extras_50 INTEGER NOT NULL DEFAULT 0,
  minutos_extras_100 INTEGER NOT NULL DEFAULT 0,
  minutos_negativos INTEGER NOT NULL DEFAULT 0,
  minutos_atraso INTEGER NOT NULL DEFAULT 0,
  minutos_noturnos_reduzidos INTEGER NOT NULL DEFAULT 0,
  saldo_dia_minutos INTEGER NOT NULL DEFAULT 0,
  saldo_acumulado_minutos INTEGER NOT NULL DEFAULT 0,
  origem VARCHAR(24) NOT NULL DEFAULT 'CALCULO_AUTOMATICO',
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  versao_motor VARCHAR(30) NOT NULL,
  PRIMARY KEY (id, competencia),
  CONSTRAINT ux_banco_colaborador_competencia UNIQUE (colaborador_id, competencia)
) PARTITION BY RANGE (competencia);
CREATE INDEX IF NOT EXISTS ix_banco_horas_saldo
  ON banco_horas (colaborador_id, competencia DESC, saldo_acumulado_minutos);

CREATE TABLE IF NOT EXISTS feriados (
  id BIGSERIAL PRIMARY KEY,
  filial_id BIGINT REFERENCES filiais(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  nome VARCHAR(160) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'NACIONAL',
  UNIQUE (filial_id, data)
);

CREATE OR REPLACE FUNCTION fn_garantir_particoes_jornada(p_competencia DATE) RETURNS VOID AS $$
DECLARE
  inicio_mes DATE := date_trunc('month', p_competencia)::date;
  fim_mes DATE := (inicio_mes + INTERVAL '1 month')::date;
  sufixo TEXT := to_char(inicio_mes, 'YYYYMM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF pontos_registrados FOR VALUES FROM (%L) TO (%L)',
    'pontos_registrados_' || sufixo, inicio_mes::timestamptz, fim_mes::timestamptz
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF solicitacoes_ajuste FOR VALUES FROM (%L) TO (%L)',
    'solicitacoes_ajuste_' || sufixo, inicio_mes::timestamptz, fim_mes::timestamptz
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF banco_horas FOR VALUES FROM (%L) TO (%L)',
    'banco_horas_' || sufixo, inicio_mes, fim_mes
  );
END;
$$ LANGUAGE plpgsql;

SELECT fn_garantir_particoes_jornada((CURRENT_DATE - INTERVAL '1 month')::date);
SELECT fn_garantir_particoes_jornada(CURRENT_DATE);
SELECT fn_garantir_particoes_jornada((CURRENT_DATE + INTERVAL '1 month')::date);

COMMIT;
