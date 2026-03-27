

# Corrigir contagem de Erros & Gaps no Cérebro

## Problema
A Edge Function `brain-analysis` tem um `.slice(0, 50)` hardcoded na linha 275 que limita os errorLogs a no máximo 50. Isso explica por que sempre mostra "50 conversas problemáticas" — o número real pode ser muito maior, mas é cortado antes de chegar na UI.

O mesmo problema afeta os sub-grupos (estabelecimento/motoboy/outros): eles são calculados sobre os 50 logs já cortados, não sobre o total real.

## Correção

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/brain-analysis/index.ts` | Remover `.slice(0, 50)` dos errorLogs. Calcular contagem total real. Aplicar slice apenas nos logs enviados para a UI (limitar a 200 para não estourar payload), mas enviar `totalErrorCount` separado com o número real |
| 2 | `src/pages/admin/AdminBrain.tsx` | Usar `metrics.totalErrorCount` (quando disponível) em vez de `metrics.errorLogs.length` para exibir a contagem total de conversas problemáticas |

### Detalhes técnicos

**brain-analysis/index.ts (linha 272-275)**:
- Manter o filtro de classificação (urgent/high/tags com erro/reclamação)
- Computar `totalErrorCount = errorLogs.length` antes de qualquer slice
- Aplicar `.slice(0, 200)` apenas para o payload de logs detalhados
- Fazer a classificação por tipo (estabelecimento/motoboy/outros) sobre TODOS os errorLogs, não os sliced
- Adicionar `totalErrorCount`, `totalEstabelecimento`, `totalMotoboy`, `totalOutros` no objeto metrics

**AdminBrain.tsx**:
- Na aba Erros & Gaps, usar `metrics.totalErrorCount || metrics.errorLogs.length` para o badge "Todos"
- Usar `metrics.totalEstabelecimento`, `metrics.totalMotoboy`, `metrics.totalOutros` para os badges de sub-categoria

