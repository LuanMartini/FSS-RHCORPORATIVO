# Migração expand/contract: `funcionarios` para `colaboradores`

## Decisão e escopo desta etapa

`colaboradores` é a fonte canônica de pessoas. Nesta etapa não há remoção de
tabela, coluna, chave estrangeira, view ou trigger. Foram removidas as escritas
diretas da aplicação em `funcionarios`; a admissão e o desligamento já usam os
serviços canônicos. O teste `backend/test/noLegacyEmployeeWrites.test.js` falha
se uma rota, controller, serviço ou modelo voltar a executar `INSERT`, `UPDATE`
ou `DELETE` diretamente nessa tabela.

## Inventário atual

| Local | Classificação | Situação |
| --- | --- | --- |
| `frontend/App.tsx`, páginas e `Sidebar.tsx` | DTO/rota compatível | Usam o nome público “funcionários” e `/rh/funcionarios`; não acessam banco. Os IDs retornados são de `colaboradores`. |
| `routes/rhRoutes.js` e `controllers/rhController.js` | rota compatível | Mantêm URL e rótulos antigos. Admissão chama `admissionService.createAdmission` e desligamento chama `lifecycleService.terminateCollaborator`, ambos canônicos. |
| `models/rh.js:listFuncionariosScoped`, contagens, férias e holerite | leitura canônica | Consultam `colaboradores`; `getFuncionarioAtivo` foi migrado nesta etapa. |
| `models/rh.js:registros_ponto`, advertências, vínculo de benefício e matrícula de treinamento | compatibilidade legada ativa | As tabelas ainda têm `funcionario_id`. Advertências já resolve o nome pelo mapa `funcionarios_colaboradores` para evitar nova leitura da tabela de pessoas legada. A migração dessas relações é a Fase 2. |
| `payrollRepository.ts` e migrations 004/011/014 | compatibilidade de dados | Folha opera por `colaborador_id`, mas preserva `funcionario_id` e o mapa para históricos e chaves antigas. |
| `schema.js` | bootstrap de schema legado | Mantém definições de tabelas antigas para instalações existentes; o seed PostgreSQL agora cria colaboradores canônicos, não linhas novas em `funcionarios`. |
| `db/verify.js` e teste de hardening | verificação | Confirmam que cada registro legado existente possui mapa para um colaborador canônico. |
| `backend/openapi/` | não aplicável | Não há diretório ou contrato OpenAPI versionado neste repositório no momento da auditoria. |

As ocorrências em migrations são histórico do schema e não devem ser reescritas:
alterar migration já aplicada quebraria sua verificação de checksum.

## Fases para remoção controlada

1. **Concluída — interromper escritas em `funcionarios`.** A API cria, lista e
   desliga pessoas por `colaboradores`; o teste estático impede regressão.
2. **Migrar relações remanescentes.** Adicionar `colaborador_id` às relações
   `registros_ponto`, `advertencias`, `funcionario_beneficio` e
   `funcionario_treinamento`; preencher pelo mapa e mover leitores/escritores
   das rotas compatíveis. A URL pública pode manter o termo “funcionário” até a
   próxima versão de API, mas o ID deve continuar canônico.
3. **Observar produção.** Por no mínimo 30 dias, comparar diariamente:

   ```sql
   SELECT count(*) FROM funcionarios;
   SELECT count(*) FROM funcionarios_colaboradores;
   SELECT count(*) FROM funcionarios f
   LEFT JOIN funcionarios_colaboradores m ON m.funcionario_id = f.id
   WHERE m.colaborador_id IS NULL;
   ```

   Além das contagens, comparar por CPF com hash/contagem por status e verificar
   que não há rota ou integração externa usando ID legado. RH e DBA devem
   aprovar o resultado desse período.
4. **Release contract revisada por humanos.** Somente após a Fase 3, criar uma
   migration nova e revisada para remover FKs/colunas/tabelas legadas. Não faça
   `DROP` automático nem altere migrations 002–016 já aplicadas.

## Riscos conhecidos

As rotas compatíveis de ponto, advertências, benefícios e treinamentos ainda
referenciam relações com `funcionario_id`; por isso a tabela legada não pode ser
removida agora. Uma instalação nova em PostgreSQL passa a ter colaboradores
canônicos no seed. Antes de habilitar qualquer uma dessas rotas compatíveis para
novos dados, conclua a Fase 2 ou mantenha o mapa de compatibilidade preenchido
por migração controlada.
