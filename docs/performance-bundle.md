# Code splitting do frontend

## Diagnóstico

O build anterior mantinha quase todas as páginas de RH como imports estáticos de
`App.tsx`. Isso fazia o mapa de jornada e suas dependências entrarem no carregamento
inicial. A rota de auditoria já era lazy, mas carregava o pacote de gráficos junto
com o seu código de página.

## Alteração

- Todas as páginas autenticadas agora usam `React.lazy`; Login e cadastro continuam
  no carregamento inicial.
- CSS e dependências de Leaflet são carregados apenas ao abrir Espelho de ponto.
- O Vite separa React, mapas, gráficos, tempo real e lista virtual em chunks de
  fornecedor estáveis para cache de longo prazo.
- O orçamento de 300 KiB protege os chunks de rota `index` e
  `AuditoriaAnalytics`; `npm run check` o executa depois do build. O limite nativo
  do Vite também avisa sobre fornecedores acima de 300 KiB.

## Resultado medido

Medição com `npm --prefix frontend run build`, em agosto de 2026:

| Entrega | Antes (raw / gzip) | Depois (raw / gzip) | Resultado |
| --- | ---: | ---: | --- |
| Chunk `index` | 445,9 / 131,7 KiB | 20,5 / 7,2 KiB | -95% no chunk de rota |
| Carga inicial (`index` + React) | 445,9 / 131,7 KiB | 199,4 / 63,8 KiB | -55% antes de autenticar |
| Chunk `AuditoriaAnalytics` | 408,7 / 116,1 KiB | 15,9 / 5,2 KiB | -96% no chunk de rota |

Os gráficos permanecem em `vendor-charts` (404,1 KiB raw / 114,8 KiB gzip), mas só
são baixados ao navegar para Auditoria e podem ser reutilizados pelo cache do
navegador. O aviso do Vite para esse fornecedor é intencional e visível no CI; o
orçamento estrito protege os chunks de rota que regressariam o carregamento normal.

## Verificação manual

Após `npm run dev`, entre no sistema e abra cada item do menu. Na primeira visita
a uma página deve aparecer brevemente a mensagem “Carregando tela…”, seguida pela
tela sem erro de chunk. Teste em especial Espelho de ponto, ATS e Auditoria.
