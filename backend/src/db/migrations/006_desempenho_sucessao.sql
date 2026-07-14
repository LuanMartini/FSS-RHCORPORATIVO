BEGIN;

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS foto_url TEXT;

CREATE TABLE IF NOT EXISTS ciclos_avaliacao (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  descricao TEXT,
  inicio_em DATE NOT NULL,
  fim_em DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'RASCUNHO',
  pesos_avaliadores JSONB NOT NULL DEFAULT
    '{"AUTOAVALIACAO":10,"GESTOR":40,"PAR":30,"LIDERADO":20}'::jsonb,
  minimo_anonimato SMALLINT NOT NULL DEFAULT 3,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_ciclos_avaliacao_nome_periodo UNIQUE (nome,inicio_em,fim_em),
  CONSTRAINT ck_ciclo_periodo CHECK (fim_em >= inicio_em),
  CONSTRAINT ck_ciclo_status CHECK (status IN ('RASCUNHO','ATIVO','CALIBRACAO','ENCERRADO')),
  CONSTRAINT ck_ciclo_minimo_anonimato CHECK (minimo_anonimato BETWEEN 2 AND 10),
  CONSTRAINT ck_ciclo_pesos_objeto CHECK (jsonb_typeof(pesos_avaliadores) = 'object')
);

CREATE TABLE IF NOT EXISTS perguntas_avaliacao (
  id BIGSERIAL PRIMARY KEY,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  enunciado TEXT NOT NULL,
  dimensao VARCHAR(24) NOT NULL,
  tipo_resposta VARCHAR(24) NOT NULL DEFAULT 'ESCALA',
  peso NUMERIC(7,4) NOT NULL DEFAULT 1,
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ck_pergunta_dimensao CHECK (dimensao IN ('DESEMPENHO','POTENCIAL','QUALITATIVA')),
  CONSTRAINT ck_pergunta_tipo CHECK (tipo_resposta IN ('ESCALA','TEXTO')),
  CONSTRAINT ck_pergunta_peso CHECK (peso > 0),
  CONSTRAINT ck_pergunta_coerente CHECK (
    (dimensao = 'QUALITATIVA' AND tipo_resposta = 'TEXTO') OR
    (dimensao <> 'QUALITATIVA' AND tipo_resposta = 'ESCALA')
  )
);
CREATE INDEX IF NOT EXISTS ix_perguntas_ciclo ON perguntas_avaliacao (ciclo_id,ativa,ordem);

-- A identidade do avaliador existe apenas no convite quantitativo. Comentarios
-- qualitativos sao persistidos separadamente, sem FK para convite ou avaliador.
CREATE TABLE IF NOT EXISTS avaliacoes_360 (
  id BIGSERIAL PRIMARY KEY,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  avaliado_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  avaliador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo_avaliador VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
  token_hash CHAR(64) NOT NULL UNIQUE,
  enviado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_avaliacao_360 UNIQUE (ciclo_id,avaliado_id,avaliador_id,tipo_avaliador),
  CONSTRAINT ck_avaliacao_tipo CHECK (tipo_avaliador IN ('AUTOAVALIACAO','GESTOR','PAR','LIDERADO')),
  CONSTRAINT ck_avaliacao_status CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','EXPIRADA')),
  CONSTRAINT ck_autoavaliacao CHECK (
    (tipo_avaliador = 'AUTOAVALIACAO' AND avaliado_id = avaliador_id) OR
    (tipo_avaliador <> 'AUTOAVALIACAO' AND avaliado_id <> avaliador_id)
  )
);
CREATE INDEX IF NOT EXISTS ix_avaliacoes_avaliado ON avaliacoes_360 (ciclo_id,avaliado_id,status,tipo_avaliador);
CREATE INDEX IF NOT EXISTS ix_avaliacoes_avaliador ON avaliacoes_360 (avaliador_id,status,ciclo_id);

CREATE TABLE IF NOT EXISTS respostas_avaliacao_numericas (
  id BIGSERIAL PRIMARY KEY,
  avaliacao_id BIGINT NOT NULL REFERENCES avaliacoes_360(id) ON DELETE CASCADE,
  pergunta_id BIGINT NOT NULL REFERENCES perguntas_avaliacao(id) ON DELETE CASCADE,
  nota NUMERIC(4,2) NOT NULL,
  respondido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_resposta_numerica UNIQUE (avaliacao_id,pergunta_id),
  CONSTRAINT ck_resposta_nota CHECK (nota BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS ix_respostas_numericas_avaliacao ON respostas_avaliacao_numericas (avaliacao_id);

CREATE TABLE IF NOT EXISTS respostas_qualitativas_anonimas (
  id UUID PRIMARY KEY,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  avaliado_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pergunta_id BIGINT NOT NULL REFERENCES perguntas_avaliacao(id) ON DELETE CASCADE,
  comentario TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_comentario_tamanho CHECK (length(btrim(comentario)) BETWEEN 3 AND 8000)
);
CREATE INDEX IF NOT EXISTS ix_feedback_anonimo_grupo
  ON respostas_qualitativas_anonimas (ciclo_id,avaliado_id,pergunta_id);

CREATE TABLE IF NOT EXISTS resultados_talento (
  id BIGSERIAL PRIMARY KEY,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  desempenho_calculado NUMERIC(5,2) NOT NULL DEFAULT 0,
  potencial_calculado NUMERIC(5,2) NOT NULL DEFAULT 0,
  desempenho_calibrado NUMERIC(5,2),
  potencial_calibrado NUMERIC(5,2),
  quadrante_x SMALLINT NOT NULL DEFAULT 1,
  quadrante_y SMALLINT NOT NULL DEFAULT 1,
  total_avaliacoes INTEGER NOT NULL DEFAULT 0,
  distribuicao_avaliadores JSONB NOT NULL DEFAULT '{}'::jsonb,
  versao INTEGER NOT NULL DEFAULT 1,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  calibrado_em TIMESTAMPTZ,
  CONSTRAINT ux_resultado_talento UNIQUE (ciclo_id,colaborador_id),
  CONSTRAINT ck_resultado_desempenho CHECK (desempenho_calculado BETWEEN 0 AND 100),
  CONSTRAINT ck_resultado_potencial CHECK (potencial_calculado BETWEEN 0 AND 100),
  CONSTRAINT ck_resultado_calibrado_desempenho CHECK (desempenho_calibrado IS NULL OR desempenho_calibrado BETWEEN 0 AND 100),
  CONSTRAINT ck_resultado_calibrado_potencial CHECK (potencial_calibrado IS NULL OR potencial_calibrado BETWEEN 0 AND 100),
  CONSTRAINT ck_resultado_quadrante CHECK (quadrante_x BETWEEN 1 AND 3 AND quadrante_y BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS ix_resultados_ninebox ON resultados_talento (ciclo_id,quadrante_y DESC,quadrante_x,colaborador_id);

CREATE TABLE IF NOT EXISTS logs_calibracao_ninebox (
  id BIGSERIAL PRIMARY KEY,
  resultado_id BIGINT NOT NULL REFERENCES resultados_talento(id) ON DELETE CASCADE,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  quadrante_x_anterior SMALLINT NOT NULL,
  quadrante_y_anterior SMALLINT NOT NULL,
  quadrante_x_novo SMALLINT NOT NULL,
  quadrante_y_novo SMALLINT NOT NULL,
  desempenho_anterior NUMERIC(5,2) NOT NULL,
  potencial_anterior NUMERIC(5,2) NOT NULL,
  desempenho_novo NUMERIC(5,2) NOT NULL,
  potencial_novo NUMERIC(5,2) NOT NULL,
  justificativa TEXT NOT NULL,
  calibrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  calibrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_log_quadrantes CHECK (
    quadrante_x_anterior BETWEEN 1 AND 3 AND quadrante_y_anterior BETWEEN 1 AND 3 AND
    quadrante_x_novo BETWEEN 1 AND 3 AND quadrante_y_novo BETWEEN 1 AND 3
  ),
  CONSTRAINT ck_log_justificativa CHECK (length(btrim(justificativa)) BETWEEN 10 AND 2000)
);
CREATE INDEX IF NOT EXISTS ix_logs_calibracao_colaborador ON logs_calibracao_ninebox (ciclo_id,colaborador_id,calibrado_em DESC);

CREATE TABLE IF NOT EXISTS objetivos_okr (
  id BIGSERIAL PRIMARY KEY,
  ciclo_id BIGINT NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  objetivo_pai_id BIGINT REFERENCES objetivos_okr(id) ON DELETE CASCADE,
  nivel VARCHAR(24) NOT NULL,
  titulo VARCHAR(240) NOT NULL,
  descricao TEXT,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE CASCADE,
  colaborador_id BIGINT REFERENCES colaboradores(id) ON DELETE CASCADE,
  unidade VARCHAR(24) NOT NULL DEFAULT 'PERCENTUAL',
  valor_inicial NUMERIC(18,4) NOT NULL DEFAULT 0,
  valor_atual NUMERIC(18,4) NOT NULL DEFAULT 0,
  valor_meta NUMERIC(18,4) NOT NULL DEFAULT 100,
  peso NUMERIC(9,4) NOT NULL DEFAULT 1,
  progresso NUMERIC(7,4) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'ATIVO',
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_okr_nivel CHECK (nivel IN ('CORPORATIVO','DEPARTAMENTO','INDIVIDUAL')),
  CONSTRAINT ck_okr_unidade CHECK (unidade IN ('PERCENTUAL','NUMERO','MOEDA','BOOLEANO')),
  CONSTRAINT ck_okr_peso CHECK (peso > 0),
  CONSTRAINT ck_okr_progresso CHECK (progresso BETWEEN 0 AND 100),
  CONSTRAINT ck_okr_status CHECK (status IN ('RASCUNHO','ATIVO','CONCLUIDO','CANCELADO')),
  CONSTRAINT ck_okr_meta CHECK (valor_meta <> valor_inicial),
  CONSTRAINT ck_okr_escopo CHECK (
    (nivel='CORPORATIVO' AND departamento_id IS NULL AND colaborador_id IS NULL) OR
    (nivel='DEPARTAMENTO' AND departamento_id IS NOT NULL AND colaborador_id IS NULL) OR
    (nivel='INDIVIDUAL' AND colaborador_id IS NOT NULL)
  ),
  CONSTRAINT ck_okr_sem_auto_pai CHECK (objetivo_pai_id IS NULL OR objetivo_pai_id <> id)
);
CREATE INDEX IF NOT EXISTS ix_okr_pai ON objetivos_okr (objetivo_pai_id,status);
CREATE INDEX IF NOT EXISTS ix_okr_ciclo_nivel ON objetivos_okr (ciclo_id,nivel,departamento_id,colaborador_id);

CREATE TABLE IF NOT EXISTS historico_progresso_okr (
  id BIGSERIAL PRIMARY KEY,
  objetivo_id BIGINT NOT NULL REFERENCES objetivos_okr(id) ON DELETE CASCADE,
  valor_anterior NUMERIC(18,4) NOT NULL,
  valor_novo NUMERIC(18,4) NOT NULL,
  progresso_anterior NUMERIC(7,4) NOT NULL,
  progresso_novo NUMERIC(7,4) NOT NULL,
  origem VARCHAR(24) NOT NULL,
  alterado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_historico_okr_origem CHECK (origem IN ('MANUAL','CASCATA'))
);
CREATE INDEX IF NOT EXISTS ix_historico_okr_objetivo ON historico_progresso_okr (objetivo_id,criado_em DESC);

CREATE OR REPLACE FUNCTION impedir_ciclo_okr() RETURNS trigger AS $$
DECLARE encontrado BOOLEAN;
BEGIN
  IF NEW.objetivo_pai_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE ancestrais AS (
    SELECT id,objetivo_pai_id FROM objetivos_okr WHERE id=NEW.objetivo_pai_id
    UNION ALL
    SELECT o.id,o.objetivo_pai_id FROM objetivos_okr o JOIN ancestrais a ON o.id=a.objetivo_pai_id
  ) SELECT EXISTS(SELECT 1 FROM ancestrais WHERE id=NEW.id) INTO encontrado;
  IF encontrado THEN RAISE EXCEPTION 'Dependencia circular de OKR detectada' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_impedir_ciclo_okr ON objetivos_okr;
CREATE TRIGGER trg_impedir_ciclo_okr BEFORE INSERT OR UPDATE OF objetivo_pai_id
ON objetivos_okr FOR EACH ROW EXECUTE FUNCTION impedir_ciclo_okr();

-- A view e a unica superficie de leitura de texto usada pela aplicacao. O HAVING
-- aplica k-anonimato conforme a configuracao de cada ciclo.
CREATE OR REPLACE VIEW vw_feedback_qualitativo_anonimo AS
SELECT r.ciclo_id,r.avaliado_id,r.pergunta_id,p.enunciado,
       count(*)::integer AS quantidade,jsonb_agg(r.comentario ORDER BY r.criado_em) AS comentarios
FROM respostas_qualitativas_anonimas r
JOIN perguntas_avaliacao p ON p.id=r.pergunta_id
JOIN ciclos_avaliacao c ON c.id=r.ciclo_id
GROUP BY r.ciclo_id,r.avaliado_id,r.pergunta_id,p.enunciado,c.minimo_anonimato
HAVING count(*) >= c.minimo_anonimato;

INSERT INTO ciclos_avaliacao (nome,descricao,inicio_em,fim_em,status)
VALUES ('Ciclo anual de talentos','Avaliacao 360 e calibracao de sucessao',date_trunc('year',now())::date,
        (date_trunc('year',now())+interval '1 year - 1 day')::date,'CALIBRACAO')
ON CONFLICT (nome,inicio_em,fim_em) DO NOTHING;

INSERT INTO perguntas_avaliacao (ciclo_id,enunciado,dimensao,tipo_resposta,peso,ordem)
SELECT c.id,v.enunciado,v.dimensao,v.tipo,v.peso,v.ordem
FROM ciclos_avaliacao c
CROSS JOIN (VALUES
 ('Entrega resultados consistentes e sustentaveis?','DESEMPENHO','ESCALA',1.5,1),
 ('Demonstra dominio das competencias atuais?','DESEMPENHO','ESCALA',1.0,2),
 ('Aprende rapidamente e lida bem com maior complexidade?','POTENCIAL','ESCALA',1.5,3),
 ('Demonstra capacidade para assumir responsabilidades ampliadas?','POTENCIAL','ESCALA',1.0,4),
 ('Que comportamento deve ser mantido ou desenvolvido?','QUALITATIVA','TEXTO',1.0,5)
) AS v(enunciado,dimensao,tipo,peso,ordem)
WHERE c.nome='Ciclo anual de talentos'
  AND NOT EXISTS (SELECT 1 FROM perguntas_avaliacao p WHERE p.ciclo_id=c.id);

INSERT INTO resultados_talento
  (ciclo_id,colaborador_id,desempenho_calculado,potencial_calculado,quadrante_x,quadrante_y,total_avaliacoes)
SELECT c.id,col.id,
       (35+mod(col.id*31,64))::numeric(5,2),(35+mod(col.id*23,64))::numeric(5,2),
       least(3,greatest(1,ceil((35+mod(col.id*23,64))/33.333)))::smallint,
       least(3,greatest(1,ceil((35+mod(col.id*31,64))/33.333)))::smallint,4
FROM ciclos_avaliacao c CROSS JOIN colaboradores col
WHERE c.nome='Ciclo anual de talentos' AND col.status='ATIVO'
ON CONFLICT (ciclo_id,colaborador_id) DO NOTHING;

INSERT INTO objetivos_okr
  (ciclo_id,nivel,titulo,descricao,unidade,valor_inicial,valor_atual,valor_meta,peso,progresso)
SELECT c.id,'CORPORATIVO','Elevar a excelência organizacional',
       'Objetivo corporativo desdobrado em resultados departamentais e individuais.',
       'PERCENTUAL',0,46,100,1,46
FROM ciclos_avaliacao c WHERE c.nome='Ciclo anual de talentos'
  AND NOT EXISTS (SELECT 1 FROM objetivos_okr o WHERE o.ciclo_id=c.id AND o.nivel='CORPORATIVO');

INSERT INTO objetivos_okr
  (ciclo_id,objetivo_pai_id,nivel,titulo,departamento_id,unidade,valor_inicial,valor_atual,valor_meta,peso,progresso)
SELECT corp.ciclo_id,corp.id,'DEPARTAMENTO','Aumentar impacto de '||d.nome,d.id,
       'PERCENTUAL',0,(35+mod(d.id*13,40))::numeric,100,1,(35+mod(d.id*13,40))::numeric
FROM objetivos_okr corp CROSS JOIN departamentos d
WHERE corp.nivel='CORPORATIVO' AND corp.titulo='Elevar a excelência organizacional'
  AND NOT EXISTS (SELECT 1 FROM objetivos_okr o WHERE o.objetivo_pai_id=corp.id AND o.departamento_id=d.id);

INSERT INTO objetivos_okr
  (ciclo_id,objetivo_pai_id,nivel,titulo,departamento_id,colaborador_id,unidade,
   valor_inicial,valor_atual,valor_meta,peso,progresso)
SELECT dept.ciclo_id,dept.id,'INDIVIDUAL','KR de impacto — '||COALESCE(col.nome_social,col.nome_completo),
       col.departamento_id,col.id,'PERCENTUAL',0,(30+mod(col.id*17,60))::numeric,100,1,
       (30+mod(col.id*17,60))::numeric
FROM objetivos_okr dept JOIN colaboradores col ON col.departamento_id=dept.departamento_id
WHERE dept.nivel='DEPARTAMENTO' AND col.status='ATIVO'
  AND NOT EXISTS (SELECT 1 FROM objetivos_okr o WHERE o.objetivo_pai_id=dept.id AND o.colaborador_id=col.id);

COMMIT;
