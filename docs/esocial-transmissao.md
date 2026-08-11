# Transmissao eSocial da folha

## Escopo e fontes normativas

O adapter implementa S-1200, S-1210 e S-1299 no leiaute **eSocial S-1.3,
consolidado ate a NT 06/2026**, usando os XSD publicados para CNPJ alfanumerico
com entrada em producao em 01/07/2026. O pacote oficial usado como referencia e:

- [pagina de documentacao tecnica](https://www.gov.br/esocial/pt-br/documentacao-tecnica/documentacao-tecnica/);
- [XSD S-1.3 de 01/07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/2026-07-01_esquemas_xsd_v_s_01_03_00.zip), SHA-256 `32535dba33d0470cf44afce410840af450028fd32d3df9123f601c45cf9af8e`;
- [Manual de Orientacao do Desenvolvedor v1.15](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/manualorientacaodesenvolvedoresocialv1-15.pdf);
- [Pacote de Comunicacao v1.6](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/pacote-de-comunicacao-esocial-v1-6.zip), SHA-256 `8f1ed77472df9ee749b489bd981443d89664ea164f1ad24e8beeedb2f1fb5996`.

Os eventos usam XMLDSig enveloped com RSA-SHA256, SHA-256 e C14N 1.0. O lote
usa SOAP 1.1 e mTLS. Envio e consulta sao conexoes separadas e a consulta usa o
mesmo certificado da transmissao, como determina o manual.

## Contrato encontrado

A migration `004_folha_pagamento.sql` criou `eventos_esocial_folha` com os
campos `id`, `folha_id`, `contracheque_id`, `tipo_evento`,
`chave_idempotencia`, `payload`, `status`, `protocolo`, `resposta`, `criado_em`
e `enviado_em`. O contrato historico de estados e preservado:

| Estado persistido | Significado operacional |
| --- | --- |
| `PRONTO_ENVIO` | pendente, ainda sem protocolo |
| `ENVIANDO` | lote recebido e aguardando/realizando consulta |
| `ACEITO` | evento processado com codigo 201/202 e recibo |
| `REJEITADO` | validacao local/XSD ou eSocial recusou o evento |
| `CANCELADO` | cancelamento administrativo; bloqueia S-1299 |

A migration aditiva `016_esocial_transmissao.sql` acrescenta `event_id`,
`recibo`, contadores, agendamento e lease do worker. Nenhum nome ou estado da
outbox original foi removido. `FOR UPDATE SKIP LOCKED` continua sendo a base do
claim; a chamada de rede ocorre fora da transacao e o `event_id` deterministico
torna uma retransmissao recuperavel.

O contrato REST completo esta em `backend/openapi/payroll.yaml`. Alem das rotas
existentes, ha leitura do estado eSocial e solicitacao idempotente de S-1299.

## Campos dos eventos

### S-1200

O payload antigo tinha `competencia`, `cpf`, `ideDmDev` e rubricas com codigo e
valor. Isso nao bastava para o XSD. Novos snapshots e eventos incluem:

- `matricula` e `codCateg`, vindos de `perfis_folha_colaboradores`;
- `estabelecimentoTpInsc`, `estabelecimentoNrInsc` e `codLotacao`;
- `ideTabRubr` correspondente ao S-1010;
- `indApurIR=0` por rubrica para a apuracao normal.

Os dados cadastrais devem refletir S-1000, S-1005, S-1010, S-1020 e o cadastro
do vinculo ja aceitos no RET. O sistema nao cria esses eventos de tabela nesta
entrega e nao inventa codigos ausentes. Um registro antigo/incompleto e rejeitado
localmente com `ESOCIAL_INVALID_PAYLOAD` e uma auditoria, antes de qualquer envio.

### S-1210

O payload antigo tinha somente data, demonstrativo e liquido. Novos eventos
tambem levam CPF e a competencia remuneratoria. `perApur` e o mes do pagamento;
`perRef` aponta para a competencia do S-1200.

### S-1299

`evtRemun` e `evtPgtos` sao calculados a partir dos eventos `ACEITO` do periodo
fiscal: competencia no S-1200 e mes de `dataPagamento` no S-1210, mesmo quando o
pagamento pertence a outra `folha_id`. Um advisory lock por periodo serializa os
produtores da outbox com o fechamento. O endpoint recusa criar o fechamento se
qualquer S-1200/S-1210 daquele periodo estiver `PRONTO_ENVIO`,
`ENVIANDO`, `REJEITADO` ou `CANCELADO` e devolve cada bloqueador.

Como este modulo nao gera S-1260, S-1270 nem S-1280, o RH precisa declarar
explicitamente `evtComProd`, `evtContratAvNP` e `evtInfoComplPer`. Um valor `N`
nunca e presumido pelo backend.

## Fluxo do worker

1. Com `ESOCIAL_TRANSMISSION_ENABLED=false` (padrao), nada consulta ou altera a
   outbox eSocial; o processamento local segue igual.
2. Com a opcao ligada, a inicializacao falha se ICP-Brasil real, XSD ou validador
   estiverem ausentes.
3. O worker monta e assina um evento por lote, valida o XML assinado no XSD e
   envia por mTLS.
4. Uma recepcao 201/202 grava protocolo e muda para `ENVIANDO`.
5. Consultas com codigo 101 respeitam `tempoEstimadoConclusao`. Resultado de
   evento 201/202 com `nrRecibo` muda para `ACEITO`; os demais vao para
   `REJEITADO`.
6. Rejeicoes e sucessos entram em `audit_outbox` na mesma transacao da mudanca
   de estado. XML bruto, CPF, senha e chave nao sao gravados na auditoria.

Falhas de transporte recebem backoff. Depois do limite, uma submissao sem
protocolo vira rejeicao auditavel. Uma consulta com protocolo nao e descartada
por timeout e continua sendo consultada, evitando retransmitir um lote ja aceito.

## Homologacao obrigatoria

Antes de habilitar producao:

1. baixe o pacote XSD oficial acima em um volume somente leitura, confira o
   SHA-256 e aponte `ESOCIAL_XSD_DIR` para a pasta que contem `evtRemun.xsd`,
   `evtPgtos.xsd`, `evtFechaEvPer.xsd`, `tipos.xsd` e
   `xmldsig-core-schema.xsd`;
2. cadastre matricula, categoria, estabelecimento, lotacao e tabela de rubricas
   de cada colaborador e compare com o RET;
3. valide A1 e A3 separadamente no ambiente de producao restrita, incluindo
   assinatura XML, mTLS, procuracao e renovacao do token;
4. envie casos de sucesso e rejeicao e confira protocolo/recibo no portal;
5. somente depois altere `ESOCIAL_ENVIRONMENT=producao`.

Testes automatizados nunca usam os endpoints governamentais. Eles exercitam XML,
XMLDSig, maquina de estados e fechamento contra um transporte SOAP em memoria.
Esta entrega nao implementa eventos S-1000/S-1005/S-1010/S-1020, totalizadores
S-5001/S-5002/S-5011, reabertura S-1298 nem conciliacao com DCTFWeb.
