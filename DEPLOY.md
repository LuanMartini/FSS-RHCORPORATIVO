# Deploy

## Variaveis do backend

Configure estas variaveis no servidor do backend:

```env
NODE_ENV=production
PORT=3333
JWT_SECRET=gere-um-segredo-longo
JWT_ISSUER=rhcorp-api
JWT_AUDIENCE=rhcorp-web
JWT_ACCESS_TTL=10m
CORS_ORIGIN=https://seu-frontend.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
DB_CLIENT=postgres
PG_HOST=host-do-banco
PG_PORT=5432
PG_USER=usuario
PG_PASSWORD=senha
PG_DATABASE=rhcorp
PG_SSL=true
PG_SSL_REJECT_UNAUTHORIZED=true
PG_POOL_MAX=10
PG_STATEMENT_TIMEOUT_MS=30000
TRUST_PROXY_HOPS=1
SEED_ADMIN_EMAIL=admin@empresa.com
SEED_ADMIN_PASSWORD=troque-essa-senha
MALWARE_SCANNER_URL=https://scanner-interno.example/scan
MALWARE_SCANNER_TOKEN=segredo-fornecido-pelo-scanner
ICP_BRASIL_MODE=producao
ICP_BRASIL_PROVIDER=a1
ICP_BRASIL_OPENSSL_BIN=/usr/bin/openssl
ICP_BRASIL_OPENSSL_TIMEOUT_MS=30000
ICP_BRASIL_PFX_PATH=/run/secrets/certificado-icp-brasil.pfx
ICP_BRASIL_PFX_PASSWORD=fornecida-pelo-secret-manager
ICP_BRASIL_CERT_CHAIN_PATH=/run/secrets/cadeia-icp-brasil.pem
ICP_BRASIL_PDF_SIGNATURE_LENGTH=32768
ICP_BRASIL_SIGNER_NAME=Razao social da empresa
ICP_BRASIL_SIGNER_CONTACT=seguranca@example.com
ICP_BRASIL_SIGNER_LOCATION=Municipio-UF, Brasil
ICP_BRASIL_SIGNATURE_REASON=Emissao de documento trabalhista
ESOCIAL_TRANSMISSION_ENABLED=false
# Preencha as demais ESOCIAL_* somente ao habilitar; veja a secao Transmissao eSocial.
LEAVE_WORKER_INTERVAL_MS=300000
```

## Assinatura ICP-Brasil

API e worker de folha validam esta configuracao ao iniciar. Em `NODE_ENV=production`,
o modo implicito e `producao` e `ICP_BRASIL_MODE=simulado` e recusado. Certificado,
OpenSSL ou provider ausente impede a inicializacao; nao ha fallback para documento
simulado ou parcialmente assinado.

### Certificado A1

Monte o PFX/P12 como secret somente leitura fora da imagem e injete a senha pelo
secret manager da plataforma. Nunca grave a senha em arquivo versionado ou na
linha de comando. Durante a assinatura, a chave e extraida em diretorio temporario
privado e apagada ao final. Prefira HSM quando a politica da organizacao proibir
material privado temporario em disco.

PFX antigos que dependem dos algoritmos legados do OpenSSL podem exigir
`ICP_BRASIL_OPENSSL_PKCS12_LEGACY=true`; habilite somente apos homologacao e plano
de renovacao do certificado.

### Token/HSM A3 por PKCS#11

Use OpenSSL 3 com um provider PKCS#11 instalado e compativel com o fabricante do
token/HSM. O certificado publico fica em PEM; apenas a operacao de chave privada
ocorre no dispositivo.

```env
ICP_BRASIL_MODE=producao
ICP_BRASIL_PROVIDER=pkcs11
ICP_BRASIL_OPENSSL_BIN=/usr/bin/openssl
ICP_BRASIL_PKCS11_MODULE=/opt/vendor/lib/libpkcs11.so
ICP_BRASIL_PKCS11_KEY_URI=pkcs11:token=RH;object=assinatura;type=private
ICP_BRASIL_PKCS11_CERT_PATH=/run/secrets/certificado-publico.pem
ICP_BRASIL_PKCS11_PIN=fornecido-pelo-secret-manager
ICP_BRASIL_PKCS11_PROVIDER=pkcs11
ICP_BRASIL_PKCS11_PROVIDER_PATH=/usr/lib/ossl-modules
ICP_BRASIL_CERT_CHAIN_PATH=/run/secrets/cadeia-icp-brasil.pem
```

Nao inclua `pin-value` em `ICP_BRASIL_PKCS11_KEY_URI`. O PIN e a senha A1 sao
passados ao OpenSSL por variavel de ambiente do subprocesso, sem interpolacao de
shell. Valide a URI e o provider para cada modelo de dispositivo.

Em desenvolvimento e teste, `ICP_BRASIL_MODE=simulado` usa HMAC deterministico e
nao precisa de OpenSSL. Esse resultado e marcado como simulado e nao possui valor
de assinatura ICP-Brasil. Detalhes da escolha, limites e homologacao estao em
[docs/assinatura-icp-brasil.md](docs/assinatura-icp-brasil.md).

## Transmissao eSocial

A transmissao fica desabilitada por padrao e nao toca a outbox nesse estado.
Habilite primeiro em producao restrita. API e worker falham na inicializacao se
certificado real, XSD ou validador estiverem ausentes; nao ha envio sem assinatura
nem fallback para o modo simulado.

```env
ESOCIAL_TRANSMISSION_ENABLED=true
ESOCIAL_ENVIRONMENT=restrita
ESOCIAL_EMPLOYER_TP_INSC=1
ESOCIAL_EMPLOYER_NR_INSC=12345678
ESOCIAL_TRANSMITTER_TP_INSC=1
ESOCIAL_TRANSMITTER_NR_INSC=12345678000195
ESOCIAL_APP_VERSION=FSS-RHCORP-1.0
ESOCIAL_XSD_DIR=/opt/esocial/xsd/2026-07-01
ESOCIAL_XSD_VALIDATOR_BIN=/usr/bin/xmllint
ESOCIAL_REQUEST_TIMEOUT_MS=30000
ESOCIAL_POLLING_INTERVAL_MS=15000
# Overrides opcionais; omita para usar os endpoints oficiais do ambiente.
# ESOCIAL_SEND_URL=https://...
# ESOCIAL_QUERY_URL=https://...
```

Baixe o [pacote XSD S-1.3 de 01/07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/2026-07-01_esquemas_xsd_v_s_01_03_00.zip)
em um volume somente leitura e confira SHA-256
`32535dba33d0470cf44afce410840af450028fd32d3df9123f601c45cf9af8e`.
A pasta configurada deve conter, juntos, `evtRemun.xsd`, `evtPgtos.xsd`,
`evtFechaEvPer.xsd`, `tipos.xsd` e `xmldsig-core-schema.xsd`. Instale `xmllint`
(normalmente fornecido por `libxml2-utils`) na imagem do worker e da API.

Para A3/HSM, alem do provider OpenSSL usado na assinatura XML, o mTLS do Node
precisa do ENGINE PKCS#11 do fabricante/libp11 configurado no host:

```env
ESOCIAL_PKCS11_TLS_ENGINE=pkcs11
PKCS11_MODULE_PATH=/opt/vendor/lib/libpkcs11.so
```

O PIN continua vindo de `ICP_BRASIL_PKCS11_PIN`; ele nao deve ser incluido na URI
versionada. Homologue ENGINE, provider, token e renovacao com o mesmo certificado
no envio e na consulta. Se a plataforma desabilitar OpenSSL ENGINE, forneca um
transport adapter mTLS aprovado antes de usar A3; nao reverta para A1 sem decisao
de seguranca.

Antes de ligar, preencha em `perfis_folha_colaboradores` os campos
`matricula_esocial`, `categoria_esocial`, `estabelecimento_tp_insc`,
`estabelecimento_nr_insc`, `lotacao_esocial` e `tabela_rubricas_esocial`. Eles
devem coincidir com S-1005/S-1010/S-1020 e com o vinculo existente no RET. Eventos
antigos sem esses campos sao rejeitados localmente e precisam ser saneados ou
recriados de forma controlada.

Os endpoints padrao sao os publicados no Manual do Desenvolvedor v1.15:

- restrita, envio e consulta: `webservices.producaorestrita.esocial.gov.br`;
- producao, envio: `webservices.envio.esocial.gov.br`;
- producao, consulta: `webservices.consulta.esocial.gov.br`.

Nunca aponte testes automatizados para esses enderecos. O roteiro de homologacao,
campos da outbox e funcionalidades deliberadamente fora de escopo estao em
[docs/esocial-transmissao.md](docs/esocial-transmissao.md).

## Variaveis do frontend

Configure no provedor do frontend:

```env
VITE_API_URL=https://sua-api.com
VITE_ADMIN_REGISTRATION_ENABLED=false
```

## Sugestao de hospedagem

- Banco: PostgreSQL gerenciado.
- Backend: Render, Railway, Fly.io, VPS ou container Node.
- Frontend: Vercel, Netlify ou hospedagem estatica.

## Comandos de build

Backend:

```bash
npm --prefix backend ci
npm --prefix backend run db:migrate
npm --prefix backend run db:verify
npm --prefix backend start
```

`db:migrate` deve ser um job unico anterior ao deploy da API. A API apenas
valida os checksums de `schema_migrations` e recusa iniciar quando existe
migracao pendente ou alterada.

Workers independentes:

```bash
npm --prefix backend run worker
npm --prefix backend run worker:audit
npm --prefix backend run worker:leave
```

Frontend:

```bash
npm --prefix frontend install
npm --prefix frontend run build
```

Pasta publicada do frontend: `frontend/dist`.

## Checklist antes de publicar

- Trocar `JWT_SECRET`.
- Trocar `SEED_ADMIN_PASSWORD`.
- Manter `VITE_ADMIN_REGISTRATION_ENABLED=false`; o bootstrap da API retorna 404 em producao.
- Apontar `CORS_ORIGIN` para o dominio real do frontend.
- Ajustar `RATE_LIMIT_MAX` conforme o volume real de usuarios.
- Apontar `VITE_API_URL` para a URL publica da API.
- Confirmar backup do banco.
- Restaurar o backup em um banco separado e executar `db:migrate` nele.
- Confirmar que `schema_migrations` nao possui checksum divergente.
- Executar o worker de folha e o worker de auditoria separados da API.
- Executar o worker de ferias e configurar scanner antimalware real; uploads falham sem scanner em producao.
- Confirmar OpenSSL 3, certificado A1 ou provider A3 e permissoes dos secrets antes do rollout.
- Gerar um PAdES e um CAdES em homologacao e arquivar o relatorio do VALIDAR/ITI.
- Manter `ESOCIAL_TRANSMISSION_ENABLED=false` ate validar XSD, cadastros S-1005/S-1010/S-1020, XMLDSig e mTLS em producao restrita.
- Confirmar que nenhum S-1299 foi solicitado com eventos pendentes/rejeitados e arquivar os protocolos/recibos da homologacao.
- Sincronizar o relogio dos hosts; `signingTime` nao substitui carimbo RFC 3161 de uma ACT.
- Validar TLS `verify-full` no PostgreSQL e Redis privado/autenticado.
- Garantir que nenhum segredo foi publicado como variavel `VITE_*`.

## Estrategia de migracao e rollback

1. Gere um backup/PITR e valide a restauracao antes do deploy.
2. Execute migracoes aditivas no job exclusivo de migracao.
3. Se o job falhar, bloqueie o deploy; migracoes transacionais fazem rollback.
4. Publique a API em canario e execute smoke tests de login, RBAC, ponto e folha.
5. Se a aplicacao falhar, reverta somente a imagem. O schema deve permanecer
   retrocompativel pelo padrao expand/contract.
6. Nao execute down migration destrutiva automaticamente. Em corrupcao logica,
   restaure o PITR em cluster novo, valide e troque o trafego.

A remocao de colunas legadas `funcionarios`/`funcionario_id` pertence a uma
release contract posterior, somente depois de confirmar que nao ha leitores
legados em producao.
