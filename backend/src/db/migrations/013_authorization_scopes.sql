BEGIN;

INSERT INTO permissoes (codigo,descricao,classificacao) VALUES
  ('employee.read.basic','Consultar dados cadastrais basicos no escopo autorizado','INTERNA'),
  ('employee.read.sensitive','Consultar identificadores pessoais sensiveis','SENSIVEL'),
  ('employee.read.salary','Consultar remuneracao individual','FINANCEIRA'),
  ('employee.read.all','Consultar colaboradores fora da propria hierarquia','SENSIVEL'),
  ('time.manage.team','Consultar e aprovar jornada da propria equipe','SENSIVEL'),
  ('time.manage.all','Consultar e aprovar jornada de toda a organizacao','SENSIVEL'),
  ('performance.manage.team','Consultar desempenho da propria equipe','SENSIVEL'),
  ('performance.manage.all','Consultar desempenho de toda a organizacao','SENSIVEL'),
  ('lms.admin','Administrar trilhas e consultar progresso corporativo','SENSIVEL')
ON CONFLICT (codigo) DO UPDATE SET
  descricao=EXCLUDED.descricao,classificacao=EXCLUDED.classificacao;

INSERT INTO perfis_permissoes (perfil,permissao)
SELECT 'ADMINISTRADOR',codigo FROM permissoes
ON CONFLICT DO NOTHING;

INSERT INTO perfis_permissoes (perfil,permissao) VALUES
  ('RH','employee.read.basic'),('RH','employee.read.sensitive'),
  ('RH','employee.read.salary'),('RH','employee.read.all'),
  ('RH','time.manage.all'),('RH','performance.manage.all'),('RH','lms.admin'),
  ('GESTOR','employee.read.basic'),('GESTOR','time.manage.team'),
  ('GESTOR','performance.manage.team')
ON CONFLICT DO NOTHING;

DELETE FROM perfis_permissoes
 WHERE perfil='GESTOR' AND permissao IN ('employee.read','time.manage','performance.read');

COMMIT;
