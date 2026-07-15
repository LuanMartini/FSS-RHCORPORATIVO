# Arquitetura e decisoes de seguranca

## Identidade e autorizacao

JWT e apenas a credencial de acesso. Perfil, vinculo com colaborador, permissoes
e `session_version` sao recarregados do banco. Operacoes self-service derivam o
colaborador do principal autenticado; IDs enviados pelo navegador nao concedem
acesso. Gestores recebem escopo de hierarquia, enquanto RH e administradores
usam permissoes explicitas `*.all`.

## Fonte canonica

`colaboradores` e a fonte canonica. `funcionarios` e seus relacionamentos sao
legados e devem ser removidos por expand/contract: interromper escritas, migrar
leitores, comparar contagens e somente entao remover colunas/tabelas em release
posterior.

## Dados sensiveis e auditoria

Arquivos sao cifrados com AES-256-GCM e validados por tamanho, MIME e assinatura
binaria. Em producao, uploads falham se o scanner antimalware externo nao estiver
configurado. O ledger armazena metadados, classificacao, finalidade e hashes, nao
o conteudo pessoal. Mutacoes criticas devem gravar `audit_outbox` na mesma
transacao do negocio.

## Ferias

Solicitacoes usam periodo aquisitivo, saldo, versao e transacoes com bloqueio.
Estados: `PENDENTE`, `APROVADA`, `REPROVADA`, `CANCELADA`, `EM_GOZO` e
`ENCERRADA`. O worker aplica transicoes por vigencia de forma idempotente.

## Multiempresa

O produto permanece single-tenant por implantacao. Adicionar `empresa_id` apenas
em parte das tabelas seria inseguro. A migracao SaaS deve ocorrer separadamente:
inventario integral, backfill obrigatorio, chaves compostas, contexto de tenant,
PostgreSQL RLS com `FORCE ROW LEVEL SECURITY` e testes de acesso cruzado. Ate
essa entrega, cada empresa deve usar banco e storage dedicados.

## Retencao e direitos do titular

As tabelas `finalidades_tratamento`, `politicas_retencao`,
`consentimentos_dados`, `bloqueios_legais_dados` e `solicitacoes_titulares`
formam a base tecnica. Prazos e bases legais dependem de validacao do DPO/juridico
e nao representam certificacao LGPD.
