BEGIN;

CREATE TABLE IF NOT EXISTS trilhas_aprendizagem (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(180) NOT NULL UNIQUE,
  descricao TEXT,
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  ativa BOOLEAN NOT NULL DEFAULT true,
  xp_conclusao INTEGER NOT NULL DEFAULT 100,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_trilha_xp CHECK (xp_conclusao>=0)
);

CREATE TABLE IF NOT EXISTS cursos (
  id BIGSERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  categoria VARCHAR(64) NOT NULL DEFAULT 'ONBOARDING',
  imagem_url TEXT,
  carga_minutos INTEGER NOT NULL,
  nota_minima NUMERIC(5,2) NOT NULL DEFAULT 80,
  percentual_video_minimo NUMERIC(5,2) NOT NULL DEFAULT 90,
  xp_conclusao INTEGER NOT NULL DEFAULT 100,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_cursos_titulo UNIQUE (titulo),
  CONSTRAINT ck_curso_nota CHECK (nota_minima BETWEEN 0 AND 100),
  CONSTRAINT ck_curso_video CHECK (percentual_video_minimo BETWEEN 0 AND 100),
  CONSTRAINT ck_curso_carga_xp CHECK (carga_minutos>0 AND xp_conclusao>=0)
);

CREATE TABLE IF NOT EXISTS trilhas_cursos (
  trilha_id BIGINT NOT NULL REFERENCES trilhas_aprendizagem(id) ON DELETE CASCADE,
  curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  curso_pre_requisito_id BIGINT REFERENCES cursos(id) ON DELETE RESTRICT,
  PRIMARY KEY (trilha_id,curso_id),
  CONSTRAINT ux_trilha_ordem UNIQUE (trilha_id,ordem),
  CONSTRAINT ck_trilha_ordem CHECK (ordem>0),
  CONSTRAINT ck_trilha_sem_auto_dependencia CHECK (curso_pre_requisito_id IS NULL OR curso_pre_requisito_id<>curso_id)
);
CREATE INDEX IF NOT EXISTS ix_trilhas_cursos_dependencia ON trilhas_cursos (curso_pre_requisito_id);

CREATE TABLE IF NOT EXISTS aulas (
  id BIGSERIAL PRIMARY KEY,
  curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL,
  tipo VARCHAR(24) NOT NULL DEFAULT 'VIDEO_LOCAL',
  video_url TEXT NOT NULL,
  duracao_segundos INTEGER NOT NULL,
  obrigatoria BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ux_aula_ordem UNIQUE (curso_id,ordem),
  CONSTRAINT ck_aula_tipo CHECK (tipo IN ('VIDEO_LOCAL','VIMEO','YOUTUBE')),
  CONSTRAINT ck_aula_duracao CHECK (duracao_segundos>0)
);

CREATE TABLE IF NOT EXISTS matriculas_cursos (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'NAO_INICIADO',
  progresso_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  nota_final NUMERIC(5,2),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  versao INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT ux_matricula_curso UNIQUE (colaborador_id,curso_id),
  CONSTRAINT ck_matricula_status CHECK (status IN ('NAO_INICIADO','EM_ANDAMENTO','AGUARDANDO_PROVA','CONCLUIDO','REPROVADO')),
  CONSTRAINT ck_matricula_progresso CHECK (progresso_percentual BETWEEN 0 AND 100),
  CONSTRAINT ck_matricula_nota CHECK (nota_final IS NULL OR nota_final BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS aulas_progresso (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  aula_id BIGINT NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
  ultimo_segundo NUMERIC(12,3) NOT NULL DEFAULT 0,
  maximo_segundo_assistido NUMERIC(12,3) NOT NULL DEFAULT 0,
  tempo_valido_segundos NUMERIC(12,3) NOT NULL DEFAULT 0,
  percentual NUMERIC(7,4) NOT NULL DEFAULT 0,
  concluida BOOLEAN NOT NULL DEFAULT false,
  ultima_sincronizacao TIMESTAMPTZ,
  versao INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT ux_aula_progresso UNIQUE (colaborador_id,aula_id),
  CONSTRAINT ck_aula_progresso_valores CHECK (ultimo_segundo>=0 AND maximo_segundo_assistido>=0 AND tempo_valido_segundos>=0 AND percentual BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_aulas_progresso_colaborador ON aulas_progresso (colaborador_id,concluida,aula_id);

CREATE TABLE IF NOT EXISTS aulas_eventos_presenca (
  id UUID PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  aula_id BIGINT NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
  chave_idempotencia UUID NOT NULL UNIQUE,
  sequencia INTEGER NOT NULL,
  segundo_inicial NUMERIC(12,3) NOT NULL,
  segundo_final NUMERIC(12,3) NOT NULL,
  delta_valido NUMERIC(8,3) NOT NULL,
  aba_ativa BOOLEAN NOT NULL,
  visibilidade VARCHAR(16) NOT NULL,
  user_agent_hash CHAR(64),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_evento_video_sequencia CHECK (sequencia>=0),
  CONSTRAINT ck_evento_video_delta CHECK (delta_valido BETWEEN 0 AND 7.5),
  CONSTRAINT ck_evento_video_posicao CHECK (segundo_inicial>=0 AND segundo_final>=0)
);
CREATE INDEX IF NOT EXISTS ix_evento_video_sequencia ON aulas_eventos_presenca (colaborador_id,aula_id,sequencia);
CREATE INDEX IF NOT EXISTS ix_eventos_presenca_auditoria ON aulas_eventos_presenca (colaborador_id,aula_id,criado_em);

CREATE TABLE IF NOT EXISTS questionarios_provas (
  id BIGSERIAL PRIMARY KEY,
  curso_id BIGINT NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  quantidade_questoes INTEGER NOT NULL DEFAULT 5,
  nota_minima NUMERIC(5,2) NOT NULL DEFAULT 80,
  tempo_limite_minutos INTEGER NOT NULL DEFAULT 20,
  maximo_tentativas INTEGER NOT NULL DEFAULT 3,
  ativo BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ux_questionario_curso UNIQUE (curso_id),
  CONSTRAINT ck_questionario_config CHECK (quantidade_questoes>0 AND nota_minima BETWEEN 0 AND 100 AND tempo_limite_minutos>0 AND maximo_tentativas>0)
);

CREATE TABLE IF NOT EXISTS questionarios_questoes (
  id BIGSERIAL PRIMARY KEY,
  questionario_id BIGINT NOT NULL REFERENCES questionarios_provas(id) ON DELETE CASCADE,
  enunciado TEXT NOT NULL,
  explicacao TEXT,
  dificuldade SMALLINT NOT NULL DEFAULT 1,
  ativa BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ck_questao_dificuldade CHECK (dificuldade BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS questionarios_alternativas (
  id BIGSERIAL PRIMARY KEY,
  questao_id BIGINT NOT NULL REFERENCES questionarios_questoes(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  correta BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ix_alternativas_questao ON questionarios_alternativas (questao_id);

CREATE TABLE IF NOT EXISTS provas_tentativas (
  id UUID PRIMARY KEY,
  questionario_id BIGINT NOT NULL REFERENCES questionarios_provas(id) ON DELETE CASCADE,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  numero_tentativa INTEGER NOT NULL,
  questoes_snapshot JSONB NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'EM_ANDAMENTO',
  nota NUMERIC(5,2),
  aprovada BOOLEAN,
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  finalizada_em TIMESTAMPTZ,
  CONSTRAINT ux_tentativa_numero UNIQUE (questionario_id,colaborador_id,numero_tentativa),
  CONSTRAINT ck_tentativa_status CHECK (status IN ('EM_ANDAMENTO','FINALIZADA','EXPIRADA')),
  CONSTRAINT ck_tentativa_nota CHECK (nota IS NULL OR nota BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS provas_respostas (
  tentativa_id UUID NOT NULL REFERENCES provas_tentativas(id) ON DELETE CASCADE,
  questao_id BIGINT NOT NULL REFERENCES questionarios_questoes(id) ON DELETE CASCADE,
  alternativa_id BIGINT NOT NULL REFERENCES questionarios_alternativas(id) ON DELETE RESTRICT,
  correta BOOLEAN NOT NULL,
  respondida_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tentativa_id,questao_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(64) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NOT NULL,
  cor_primaria CHAR(7) NOT NULL DEFAULT '#10B981',
  icone VARCHAR(32) NOT NULL DEFAULT 'star',
  criterio JSONB NOT NULL DEFAULT '{}'::jsonb,
  xp_bonus INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ck_badge_cor CHECK (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_badge_xp CHECK (xp_bonus>=0)
);

CREATE TABLE IF NOT EXISTS badges_conquistados (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  badge_id BIGINT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  curso_id BIGINT REFERENCES cursos(id) ON DELETE SET NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  conquistado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_badge_colaborador_curso UNIQUE NULLS NOT DISTINCT (colaborador_id,badge_id,curso_id)
);

CREATE TABLE IF NOT EXISTS xp_eventos (
  id UUID PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pontos INTEGER NOT NULL,
  origem VARCHAR(32) NOT NULL,
  referencia_tipo VARCHAR(32) NOT NULL,
  referencia_id VARCHAR(80) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_xp_referencia UNIQUE (colaborador_id,origem,referencia_tipo,referencia_id),
  CONSTRAINT ck_xp_pontos CHECK (pontos>0),
  CONSTRAINT ck_xp_origem CHECK (origem IN ('AULA','CURSO','TRILHA','BADGE','BONUS'))
);
CREATE INDEX IF NOT EXISTS ix_xp_eventos_periodo ON xp_eventos (criado_em,colaborador_id);

CREATE TABLE IF NOT EXISTS tabela_lideranca (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo_periodo VARCHAR(16) NOT NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_lideranca_periodo UNIQUE (colaborador_id,tipo_periodo,periodo_inicio),
  CONSTRAINT ck_lideranca_tipo CHECK (tipo_periodo IN ('SEMANAL','MENSAL')),
  CONSTRAINT ck_lideranca_periodo CHECK (periodo_fim>=periodo_inicio AND xp>=0)
);
CREATE INDEX IF NOT EXISTS ix_lideranca_ranking ON tabela_lideranca (tipo_periodo,periodo_inicio,xp DESC,colaborador_id);

CREATE OR REPLACE FUNCTION atualizar_lideranca_xp() RETURNS trigger AS $$
BEGIN
  INSERT INTO tabela_lideranca (colaborador_id,tipo_periodo,periodo_inicio,periodo_fim,xp)
  VALUES (NEW.colaborador_id,'SEMANAL',date_trunc('week',NEW.criado_em)::date,(date_trunc('week',NEW.criado_em)+interval '6 days')::date,NEW.pontos)
  ON CONFLICT (colaborador_id,tipo_periodo,periodo_inicio) DO UPDATE SET xp=tabela_lideranca.xp+EXCLUDED.xp,atualizado_em=now();
  INSERT INTO tabela_lideranca (colaborador_id,tipo_periodo,periodo_inicio,periodo_fim,xp)
  VALUES (NEW.colaborador_id,'MENSAL',date_trunc('month',NEW.criado_em)::date,(date_trunc('month',NEW.criado_em)+interval '1 month - 1 day')::date,NEW.pontos)
  ON CONFLICT (colaborador_id,tipo_periodo,periodo_inicio) DO UPDATE SET xp=tabela_lideranca.xp+EXCLUDED.xp,atualizado_em=now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_atualizar_lideranca_xp ON xp_eventos;
CREATE TRIGGER trg_atualizar_lideranca_xp AFTER INSERT ON xp_eventos FOR EACH ROW EXECUTE FUNCTION atualizar_lideranca_xp();

INSERT INTO trilhas_aprendizagem (nome,descricao,xp_conclusao)
VALUES ('Onboarding Essencial','Trilha obrigatória para integração, cultura e conformidade.',250)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO cursos (titulo,descricao,carga_minutos,nota_minima,percentual_video_minimo,xp_conclusao)
VALUES
 ('Boas-vindas e Cultura','Conheça a empresa, seus princípios e formas de trabalho.',15,80,90,120),
 ('Segurança e LGPD','Práticas essenciais para proteção de dados e segurança.',20,80,90,180),
 ('Ética e Conduta','Decisões responsáveis no ambiente corporativo.',20,80,90,220)
ON CONFLICT (titulo) DO NOTHING;

INSERT INTO trilhas_cursos (trilha_id,curso_id,ordem,curso_pre_requisito_id)
SELECT t.id,c.id,v.ordem,pre.id FROM trilhas_aprendizagem t
JOIN (VALUES ('Boas-vindas e Cultura',1,NULL),('Segurança e LGPD',2,'Boas-vindas e Cultura'),('Ética e Conduta',3,'Segurança e LGPD')) v(titulo,ordem,pre_titulo) ON true
JOIN cursos c ON c.titulo=v.titulo LEFT JOIN cursos pre ON pre.titulo=v.pre_titulo
WHERE t.nome='Onboarding Essencial' ON CONFLICT (trilha_id,curso_id) DO NOTHING;

INSERT INTO aulas (curso_id,titulo,descricao,ordem,tipo,video_url,duracao_segundos)
SELECT c.id,'Aula principal — '||c.titulo,c.descricao,1,'VIDEO_LOCAL','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',5
FROM cursos c WHERE c.titulo IN ('Boas-vindas e Cultura','Segurança e LGPD','Ética e Conduta')
ON CONFLICT (curso_id,ordem) DO NOTHING;

INSERT INTO questionarios_provas (curso_id,titulo,quantidade_questoes,nota_minima,tempo_limite_minutos,maximo_tentativas)
SELECT id,'Avaliação — '||titulo,2,80,10,3 FROM cursos
WHERE titulo IN ('Boas-vindas e Cultura','Segurança e LGPD','Ética e Conduta')
ON CONFLICT (curso_id) DO NOTHING;

INSERT INTO questionarios_questoes (questionario_id,enunciado,explicacao,dificuldade)
SELECT q.id,q.titulo||' | '||v.enunciado,v.explicacao,v.dificuldade FROM questionarios_provas q
CROSS JOIN (VALUES
 ('Qual é a conduta mais adequada diante de uma dúvida de conformidade?','Consultar a política e escalar ao canal responsável.',1),
 ('Como informações corporativas devem ser tratadas?','Somente para a finalidade autorizada e com controles adequados.',2),
 ('O que caracteriza conclusão válida do conteúdo?','Presença ativa, vídeo assistido e aprovação na avaliação.',1)
) v(enunciado,explicacao,dificuldade)
WHERE NOT EXISTS (SELECT 1 FROM questionarios_questoes qq WHERE qq.questionario_id=q.id);

INSERT INTO questionarios_alternativas (questao_id,texto,correta)
SELECT q.id,v.texto,v.correta FROM questionarios_questoes q
CROSS JOIN (VALUES ('Seguir o procedimento e buscar orientação',true),('Ignorar e decidir sem consultar',false),('Compartilhar dados livremente',false),('Pular diretamente para o próximo módulo',false)) v(texto,correta)
WHERE NOT EXISTS (SELECT 1 FROM questionarios_alternativas a WHERE a.questao_id=q.id);

INSERT INTO matriculas_cursos (colaborador_id,curso_id)
SELECT col.id,c.id FROM colaboradores col CROSS JOIN cursos c
WHERE col.status='ATIVO' AND c.titulo IN ('Boas-vindas e Cultura','Segurança e LGPD','Ética e Conduta')
ON CONFLICT (colaborador_id,curso_id) DO NOTHING;

INSERT INTO badges (codigo,nome,descricao,cor_primaria,icone,criterio,xp_bonus)
VALUES
 ('PRIMEIRO_PASSO','Primeiro Passo','Concluiu o primeiro curso da trilha.','#10B981','spark','{"cursos":1}',50),
 ('GUARDIAO_DADOS','Guardião de Dados','Concluiu o módulo de Segurança e LGPD.','#0EA5E9','shield','{"curso":"Segurança e LGPD"}',100),
 ('ONBOARDING_MASTER','Onboarding Master','Concluiu toda a trilha obrigatória.','#8B5CF6','trophy','{"trilha":"Onboarding Essencial"}',200)
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
