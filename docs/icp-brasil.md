# Assinatura digital PAdES/CAdES

## Decisao tecnica

O backend usa a familia [`@signpdf`](https://github.com/vbuch/node-signpdf) para
preparar PDFs com placeholder e aplicar uma assinatura destacada. Ela oferece
um assinador A1 para arquivos `.pfx`/`.p12` e uma interface de assinador que
permite acrescentar um adaptador de token ou HSM. A implementacao atual entrega
o caminho A1; A3/PKCS#11 continua deliberadamente bloqueado ate que o adaptador
do dispositivo contratado seja instalado e homologado.

Foram avaliadas duas abordagens:

- `@signpdf`: encaixa no backend Node, assina PDF com o subfiltro
  `ETSI.CAdES.detached` e usa CMS/PKCS#7 destacado para o payload de ponto.
- chamada direta a ferramenta PKCS#11: e necessaria para A3/HSM, mas depende do
  driver e middleware do token de cada autoridade/dispositivo e nao pode ser
  configurada com seguranca apenas por variaveis genericas.

## Modos

`ICP_BRASIL_MODE=simulado` e o padrao fora de producao. Ele gera HMAC-SHA-256
deterministico somente para testes e desenvolvimento. O resultado e marcado
como `ASSINATURA_SIMULADA` e **nao tem valor de assinatura digital**.

Em producao, `ICP_BRASIL_MODE=producao` exige:

```env
ICP_BRASIL_SIGNER=p12
ICP_BRASIL_P12_PATH=/run/secrets/rhcorp-certificado.pfx
ICP_BRASIL_P12_PASSWORD=<fornecida-por-secret-do-orquestrador>
```

O arquivo PFX deve ser montado como segredo/arquivo protegido. Nunca o inclua
em imagem Docker, Git, backups de codigo ou variaveis `VITE_*`. A ausencia,
falha de leitura ou modo invalido bloqueia a assinatura. Para A3, configurar
`ICP_BRASIL_SIGNER=pkcs11` sem um adaptador efetivamente instalado tambem falha
fechado com `ICP_BRASIL_PKCS11_NOT_CONFIGURED`.

`ICP_BRASIL_SIGNATURE_LENGTH` controla a reserva do PDF (padrao `16384`, entre
8192 e 65536). Aumente-a somente se o certificado A1 homologado exceder a
reserva; teste a assinatura depois da mudanca.

## Pontos integrados

- Contracheques: o arquivo criptografado no storage e o PDF ja assinado PAdES
  quando o modo de producao esta ativo. O hash persistido e do arquivo final.
- Ponto: o comprovante JSON possui `assinaturaCades`, `assinaturaStatus` e
  `assinaturaAlgoritmo`. O CMS destacado assina o JSON canonico que tambem gera
  o hash do registro; isso prepara os dados para os leiautes AFD/AEJ futuros.

## Limites regulatorio-operacionais

Esta camada aplica a assinatura criptografica; ela nao declara, por si so,
conformidade de um documento ou REP-P. Antes de uso regulatorio e necessario
homologar o certificado e a cadeia, politica de assinatura, revogacao
(CRL/OCSP), carimbo do tempo quando aplicavel, retencao e o fluxo A3/HSM. A
validacao manual pode ser feita com as ferramentas e orientacoes do
[ITI](https://h-validar.iti.gov.br/guia-desenvolvedor.html). A emissao de
AFD/AEJ, Atestado Tecnico e Termo de Responsabilidade permanece fora deste
escopo.
