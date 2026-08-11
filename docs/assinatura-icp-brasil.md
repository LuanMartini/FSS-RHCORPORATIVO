# Assinatura digital com certificados ICP-Brasil

Atualizado em 16 de julho de 2026.

## Decisao tecnica

A implementacao combina duas pecas maduras e com responsabilidades pequenas:

- [`@signpdf/signpdf`](https://github.com/vbuch/node-signpdf), com `pdf-lib`, cria o campo de assinatura, calcula o `ByteRange` e incorpora ao PDF uma assinatura destacada com `/SubFilter /ETSI.CAdES.detached`;
- [OpenSSL CMS](https://docs.openssl.org/master/man1/openssl-cms/) produz o CMS/CAdES-BES DER com SHA-256. A opcao `-cades` inclui o atributo ESS `signingCertificate` ou `signingCertificateV2`, e a assinatura preserva o atributo assinado `signingTime`;
- para A3, o OpenSSL 3 usa uma chave identificada por URI PKCS#11 por meio de um provider, como o [`pkcs11-provider`](https://github.com/openssl-projects/pkcs11-provider). A chave privada nunca sai do token/HSM.

O servico plugavel esta em `backend/src/security/icpBrasilSigner.ts` e expoe:

```ts
assinarPAdES(pdfBuffer, certificado?) => Promise<Buffer>
assinarCAdES(payload, certificado?) => Promise<Buffer>
```

O parametro opcional existe para injecao controlada e testes. Nos processos reais, a configuracao vem das variaveis de ambiente descritas em `DEPLOY.md`.

### Opcoes avaliadas

| Opcao | Avaliacao |
| --- | --- |
| `@signpdf/signpdf` + OpenSSL CMS | Escolhida. O primeiro resolve corretamente a estrutura incremental do PDF e aceita um `Signer` externo; o segundo cobre CAdES-BES, PFX/P12 e chaves por URI/provider PKCS#11 sem implementar ASN.1 criptografico no projeto. |
| `@signpdf/signer-p12` isolado | Bom para P12 e PAdES basico, mas acopla a chave a um arquivo e nao cobre A3/HSM. |
| [PKI.js](https://pkijs.org/docs/examples/signing-and-encryption-with-CMS/) | Biblioteca CMS ativa e flexivel, mas exigiria implementar e manter o motor de chave externa PKCS#11 e a montagem dos atributos CAdES no aplicativo. |
| `cadesjs` | Tem API CAdES em JavaScript, mas a publicacao do pacote esta antiga e a adocao e baixa; risco de manutencao maior. |
| Integracao direta com `pkcs11js` | Da acesso ao token, mas deixaria toda a construcao CMS/CAdES e interoperabilidade sob responsabilidade deste repositorio. |

## Modos e garantias

### `simulado`

E o padrao quando `NODE_ENV` nao e `production`. Usa HMAC-SHA256 deterministico e um envelope identificado explicitamente como `FSS-RHCORP-SIMULATED-SIGNATURE`.

- CAdES simulado retorna um envelope binario verificavel por `verifySimulatedCAdES`.
- PAdES simulado acrescenta ao PDF um comentario pos-`%%EOF`, verificavel por `verifySimulatedPAdES`.
- O resultado nao e, nem se apresenta como, assinatura qualificada ICP-Brasil.
- Mesmo que `ICP_BRASIL_MODE=simulado` seja informado, `NODE_ENV=production` recusa a inicializacao.

### `producao`

E o padrao implicito quando `NODE_ENV=production`. A API e o worker de folha validam a configuracao antes de acessar o banco. Ausencia do certificado, OpenSSL, provider ou segredo produz erro HTTP 500 com codigo seguro e nenhum documento e persistido como assinado.

No A1, certificado e chave sao extraidos do PFX apenas em diretorio temporario privado. A senha chega ao subprocesso por variavel de ambiente, nunca por argumento de linha de comando, e os arquivos temporarios sao removidos em `finally`.

No A3, o certificado publico fica em arquivo PEM e a chave privada e referenciada por `pkcs11:`. O PIN tambem e entregue por variavel de ambiente ao subprocesso.

## Integracoes

### Contracheque

O PDF assinado, e nao a versao anterior a assinatura, e criptografado no storage. `pdf_sha256` passa a representar o arquivo final. Os estados persistidos sao:

- `ASSINADO_SIMULADO` em desenvolvimento/teste;
- `ASSINADO_PADES_ICP_BRASIL` em producao.

`assinatura_base64` permanece nulo porque a assinatura esta incorporada ao PDF; algoritmo e perfil ficam em `assinatura_algoritmo`.

### Ponto e jornada

Cada comprovante assina de forma destacada os bytes exatos de `PONTO_FSS_V1`. O JSONB armazena:

- `valorBase64`: CMS/CAdES ou envelope simulado;
- `conteudoBase64`: bytes exatos necessários para verificacao, sem depender da ordenacao de chaves do JSONB;
- SHA-256, perfil, algoritmo, modo e regra de canonicalizacao;
- marcadores explicitos de que AFD e AEJ ainda nao foram implementados.

Em producao, o CMS inclui `signingTime`. Isso nao equivale a um carimbo do tempo RFC 3161 emitido por uma Autoridade de Carimbo do Tempo (ACT). PAdES-T/CAdES-T, LTV, AFD/AEJ e o Atestado Tecnico/Termo de Responsabilidade permanecem fora desta entrega.

## Conformidade e validacao

O [guia do desenvolvedor do VALIDAR](https://validar.iti.gov.br/guia-desenvolvedor.html) orienta priorizar PAdES e usar as politicas ICP-Brasil RB ou RT. O [DOC-ICP-15.01](https://www.gov.br/iti/pt-br/assuntos/legislacao/instrucoes-normativas/IN012021_DOC_15.01_assinada.pdf) tambem exige cadeia, estado de revogacao, politica e, nos perfis aplicaveis, carimbo de tempo.

Esta camada entrega o encapsulamento PAdES/CAdES e o uso real de chave A1/A3. Antes de declarar um documento fiscalmente valido, RH/Seguranca/DBA deve homologar o certificado, a cadeia, a politica de assinatura aplicavel, a revogacao e o relatorio de conformidade do ITI. O perfil tecnico basico nao substitui essa homologacao regulatoria.

Nao foi localizado certificado de assinatura de homologacao com chave privada publica do ITI. Isso e esperado: cadeias e certificados publicos podem ser distribuidos, mas a credencial privada de assinatura nao pode ser publica. A suite gera um A1 autoassinado e descartavel para provar o fluxo criptografico; a conformidade ICP-Brasil deve ser testada com uma credencial de homologacao controlada pela organizacao.

### Verificacao automatizada local

Para um CAdES destacado:

```bash
openssl cms -verify -cades -binary -inform DER \
  -in assinatura.p7s -content payload.bin \
  -CAfile cadeia-confiavel.pem -out payload-verificado.bin
```

O teste `backend/test/icpBrasilSigner.test.ts` executa essa verificacao para CAdES e para o CMS extraido do PAdES quando OpenSSL esta disponivel.

### Homologacao manual com ITI

1. Use certificado ICP-Brasil de homologacao sob controle da empresa, nunca uma chave real de producao.
2. Gere um contracheque e extraia um comprovante de ponto no ambiente de homologacao.
3. Submeta o PDF e, para assinatura destacada, o `.p7s` junto do conteudo original ao [VALIDAR do ITI](https://validar.iti.gov.br/).
4. Arquive o relatorio de conformidade e confirme titular, integridade, cadeia, politica, revogacao e horario.
5. Repita com A1 e com cada modelo/provider A3 que sera usado em producao.

## Fora de escopo

- geracao e transmissao de AFD/AEJ;
- Atestado Tecnico e Termo de Responsabilidade do REP-P;
- biometria facial certificada;
- integracao do certificado ao transporte eSocial;
- ACT/RFC 3161 e perfis de longo prazo PAdES-T/LT/LTA ou CAdES-T/LT/LTA.
