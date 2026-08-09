# OCR local de documentos

## Decisão de arquitetura

Admissão digital e reembolsos usam `tesseract.js` 7.0.0 com o modelo de
português `@tesseract.js-data/por`. A imagem é lida no backend e o modelo de
idioma é instalado junto com as dependências; o arquivo não é enviado a serviços
externos. PDFs são renderizados localmente (até as duas primeiras páginas) antes
do reconhecimento.

Essa escolha preserva RG, CPF, PIS, comprovantes, diplomas e recibos dentro do
perímetro da empresa. `aws`, `azure` e outros provedores não estão implementados:
uma configuração dessas, ou `OCR_PROVIDER` ausente em produção, retorna
`OCR_PROVIDER_UNAVAILABLE` e bloqueia o envio. Qualquer mudança para um provedor
externo exige avaliação de impacto, atualização do RAT e aprovação prévia do DPO.

## Configuração

```env
OCR_PROVIDER=tesseract
OCR_MANUAL_REVIEW_THRESHOLD=85
```

`OCR_PROVIDER=simulado` só é aceito fora de produção, emite um aviso e devolve
confiança zero sem preencher campos inventados. Ele existe apenas para fluxos de
desenvolvimento e teste; não é um OCR e nunca é habilitado em produção.

O campo de confiança vem diretamente da leitura do Tesseract (0 a 100). Ele não
é uma garantia de autenticidade do documento. Valores abaixo de
`OCR_MANUAL_REVIEW_THRESHOLD`, campos ausentes ou divergência entre o valor de um
recibo e o valor informado pelo colaborador exigem revisão humana. A aprovação de
documentos e reembolsos continua sendo uma decisão humana auditável.

## Dados armazenados

Os arquivos originais permanecem no armazenamento criptografado AES-256-GCM. O
banco persiste apenas os campos estruturados necessários, a confiança, o
identificador do algoritmo e a indicação de revisão obrigatória; o texto bruto da
leitura não é armazenado. Faça a calibração com documentos sintéticos ou conjuntos
públicos licenciados antes de ajustar o limiar para produção.

## Limites conhecidos

OCR reconhece texto, não prova legitimidade, autoria ou ausência de adulteração.
Ele pode falhar com fotos desfocadas, manuscritos, reflexos, layouts incomuns ou
PDFs escaneados de baixa resolução. O [Tesseract.js](https://github.com/naptha/tesseract.js)
executa um port WebAssembly do mecanismo Tesseract; a documentação do
[Tesseract](https://tesseract-ocr.github.io/tessdoc/InputFormats.html) esclarece
que PDFs precisam ser convertidos em imagem para reconhecimento. Por isso o
serviço limita a renderização a duas páginas e falha com erro claro quando um PDF
não pode ser preparado.
