# Cobertura de testes

Data de referência: 2026-08-09.

## Execução local

Com PostgreSQL e Redis disponíveis e as variáveis de teste configuradas:

```powershell
$env:RUN_DB_INTEGRATION='1'; npm --prefix backend run test:coverage
npm --prefix frontend run test:coverage
```

Os relatórios legíveis ficam em `backend/coverage/index.html` e `frontend/coverage/index.html`. Os arquivos LCOV, produzidos no mesmo diretório, permitem futura integração com uma ferramenta de qualidade sem expor dados de produção. Relatórios de cobertura são ignorados pelo Git.

## Baseline e porta de qualidade

O baseline aferido com a suíte completa e infraestrutura real foi:

| Aplicação | Linhas | Funções | Branches | Statements |
| --- | ---: | ---: | ---: | ---: |
| Backend | 46,12% | 44,15% | 64,96% | 46,12% |
| Frontend | 46,41% | 37,00% | 25,59% | 41,88% |

Os limites iniciais aplicados no CI são deliberadamente graduais para impedir regressões sem fingir maturidade que a suíte ainda não tem:

| Aplicação | Linhas | Funções | Branches | Statements |
| --- | ---: | ---: | ---: | ---: |
| Backend (c8) | 42% | 42% | 62% | 42% |
| Frontend (Vitest V8) | 35% | 30% | 20% | 35% |

O workflow do GitHub Actions executa ambos os gates e conserva os relatórios como artefato por 14 dias.

## Riscos prioritários e próximos testes

1. `payrollBatchProcessor.ts`: o cálculo de benefícios possui teste unitário para valores fixos e percentuais, mas o processamento de lote, PDF, assinatura e persistência ainda requer testes de integração por cenário.
2. `journeyService.ts`: testes de validação cobrem rejeições antes de gravar; faltam cenários de geofence, biometria e aprovação de ajustes com repositório real.
3. `auditService.ts`: consultas sem identidade são bloqueadas por teste; faltam cenários completos de âncora, reconstrução de ledger e dashboard analítico.
4. Frontend: os fluxos de ponto, férias e holerite, além do foco de diálogos, possuem testes; os módulos de auditoria e jornada avançada continuam as maiores prioridades de interface.

O próximo aumento de metas deve ocorrer após esses cenários, primeiro para 50% de linhas no backend e 50% no frontend, sempre com baseline aferido no CI.
