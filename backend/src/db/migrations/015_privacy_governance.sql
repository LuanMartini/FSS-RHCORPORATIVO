BEGIN;

INSERT INTO permissoes (codigo,descricao,classificacao) VALUES
 ('privacy.self','Exercer direitos sobre os proprios dados','SENSIVEL'),
 ('privacy.manage','Administrar solicitacoes de titulares e retencao','SENSIVEL')
ON CONFLICT (codigo) DO UPDATE SET descricao=EXCLUDED.descricao,classificacao=EXCLUDED.classificacao;
INSERT INTO perfis_permissoes (perfil,permissao)
SELECT perfil,'privacy.self' FROM (VALUES ('ADMINISTRADOR'),('RH'),('GESTOR'),('COLABORADOR')) x(perfil)
ON CONFLICT DO NOTHING;
INSERT INTO perfis_permissoes (perfil,permissao) VALUES ('ADMINISTRADOR','privacy.manage'),('RH','privacy.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS finalidades_tratamento (
 codigo VARCHAR(80) PRIMARY KEY,descricao TEXT NOT NULL,base_legal VARCHAR(120) NOT NULL,
 categoria_dado VARCHAR(40) NOT NULL,ativa BOOLEAN NOT NULL DEFAULT TRUE,versao INTEGER NOT NULL DEFAULT 1,
 atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO finalidades_tratamento (codigo,descricao,base_legal,categoria_dado) VALUES
 ('EXECUCAO_CONTRATO','Administracao do vinculo de trabalho','EXECUCAO_DE_CONTRATO','CADASTRAL'),
 ('OBRIGACAO_TRABALHISTA','Cumprimento de obrigacoes trabalhistas e previdenciarias','OBRIGACAO_LEGAL','FINANCEIRA'),
 ('CONTROLE_JORNADA','Registro e comprovacao da jornada','OBRIGACAO_LEGAL','SENSIVEL'),
 ('BIOMETRIA_PONTO','Verificacao biometrica opcional para marcacao','CONSENTIMENTO','BIOMETRICA')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS politicas_retencao (
 id BIGSERIAL PRIMARY KEY,categoria_dado VARCHAR(40) NOT NULL,finalidade_codigo VARCHAR(80) REFERENCES finalidades_tratamento(codigo),
 meses_retencao INTEGER NOT NULL CHECK(meses_retencao>0),acao_final VARCHAR(20) NOT NULL CHECK(acao_final IN('ELIMINAR','ANONIMIZAR','REVISAR')),
 fundamento TEXT NOT NULL,ativa BOOLEAN NOT NULL DEFAULT TRUE,versao INTEGER NOT NULL DEFAULT 1,UNIQUE(categoria_dado,finalidade_codigo,versao)
);

CREATE TABLE IF NOT EXISTS consentimentos_dados (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
 finalidade_codigo VARCHAR(80) NOT NULL REFERENCES finalidades_tratamento(codigo),politica_versao VARCHAR(40) NOT NULL,
 concedido BOOLEAN NOT NULL,registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),ip INET,user_agent TEXT,
 revoga_consentimento_id UUID REFERENCES consentimentos_dados(id),metadados JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_consentimentos_colaborador ON consentimentos_dados(colaborador_id,finalidade_codigo,registrado_em DESC);

CREATE TABLE IF NOT EXISTS bloqueios_legais_dados (
 id BIGSERIAL PRIMARY KEY,colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
 motivo TEXT NOT NULL,inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),fim_em TIMESTAMPTZ,criado_por INTEGER REFERENCES usuarios(id),
 CHECK(fim_em IS NULL OR fim_em>inicio_em)
);

CREATE TABLE IF NOT EXISTS solicitacoes_titulares (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),colaborador_id BIGINT NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
 tipo VARCHAR(24) NOT NULL CHECK(tipo IN('EXPORTACAO','CORRECAO','ANONIMIZACAO','ELIMINACAO')),
 status VARCHAR(24) NOT NULL DEFAULT 'RECEBIDA' CHECK(status IN('RECEBIDA','EM_ANALISE','ATENDIDA','NEGADA','PARCIAL')),
 detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,chave_idempotencia UUID NOT NULL UNIQUE,solicitado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
 decidido_em TIMESTAMPTZ,decidido_por INTEGER REFERENCES usuarios(id),justificativa_decisao TEXT
);
CREATE INDEX IF NOT EXISTS ix_solicitacoes_titulares_esteira ON solicitacoes_titulares(status,solicitado_em);

COMMIT;
