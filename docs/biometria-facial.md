# Biometria facial de ponto

## Decisão de arquitetura

O sistema usa `@vladmandic/human` 3.3.6 com o modelo FaceRes e backend
WebAssembly. A foto é decodificada, processada e comparada dentro do backend; os
modelos são carregados do pacote instalado. Assim, nenhuma imagem, template ou
embedding é enviado a AWS, Azure, Google ou outro terceiro.

`FACIAL_MATCH_PROVIDER=local` é obrigatório para ativar o fluxo. Valor ausente ou
um provedor não implementado resulta em `FACIAL_PROVIDER_UNAVAILABLE` e bloqueia
cadastro e marcação. Não existe retorno para o simulador ou para hash.

O template armazenado é um vetor de 1.024 características normalizado, em JSONB,
com a versão `LOCAL-HUMAN-WASM-FACERES-V1`. A foto de referência e a de ponto
permanecem no armazenamento criptografado já usado pelo sistema. Banco, backups e
controles de acesso devem tratar ambos como dados biométricos sensíveis.

## Limiar

A comparação usa similaridade cosseno. O padrão `FACIAL_MATCH_THRESHOLD=0.82` é
conservador: nos fixtures sintéticos versionados, a mesma identidade sob iluminação
e ângulo diferentes obteve 0,915 e uma identidade distinta 0,359. O Human não
publica um FAR/FRR calibrado para esta implantação; por isso o valor não é uma
garantia de produção. Antes de ativar para colaboradores reais, RH/DPO deve validar
o limiar com conjunto público licenciado ou imagens sintéticas representativas,
medindo falsos positivos e falsos negativos. A documentação do CompreFace também
ressalta que o limiar é decisão de risco e que sistemas de maior segurança devem
usar valor conservador.

O fluxo não implementa prova de vida. Ele evita a falsa alegação de que um hash de
arquivo reconhece uma pessoa, mas não elimina ataques por apresentação de fotografia
ou vídeo. Essa camada deve ser tratada em trabalho próprio antes de qualquer alegação
de proteção contra spoofing.

## Migração e operação

A migration `016_real_face_embeddings.sql` torna todos os hashes SHA-256 antigos
inutilizáveis: limpa `template_hash`, desativa o cadastro e marca a versão
`INVALIDATED-SHA256-V1`. Nenhum colaborador existente pode registrar ponto facial
até recadastrar uma foto de referência e conceder a política `BIOMETRIA_V2`.

Planeje a comunicação de recadastro, o suporte temporário a um método alternativo
de marcação e a remoção dos arquivos de referência antigos após a janela operacional
aprovada pelo DPO. Não reutilize hashes ou fotos legadas para construir embeddings
sem novo consentimento informado.

## Privacidade e testes

Como referência externa de calibração, consulte o [guia de limiar do CompreFace](https://github.com/exadel-inc/CompreFace/blob/master/docs/Face-Recognition-Similarity-Threshold.md).

A política vigente é `BIOMETRIA_V2` e registra que o provedor é local. A mudança
para qualquer serviço externo exige nova avaliação de impacto, atualização do RAT,
revisão da base legal/consentimento e aprovação do DPO antes de implementação.

Os testes usam exclusivamente três retratos sintéticos gerados para o projeto: duas
capturas da mesma identidade fictícia e uma identidade fictícia distinta. Não há
fotos de colaboradores nem imagens de pessoas reais no repositório.
