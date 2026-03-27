

# Fazer gap card sumir após treinamento

## Problema
Quando você clica em "Treinar" e salva a nota, o `saveTrainNote` apenas grava um log em `app_settings` (`brain_training_log`). Os cards de gap são recalculados toda vez por `computeKnowledgeData` a partir das métricas — nunca consultam esse log, então o card treinado reaparece.

## Correção

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `src/pages/admin/AdminBrain.tsx` | Carregar `brain_training_log` no state, filtrar gaps treinados na última semana, e após `saveTrainNote` atualizar o state local para remoção imediata do card |

### Detalhes

1. **Novo state** `trainedTags`: `Set<string>` com tags treinadas nos últimos 7 dias, carregado de `app_settings` key `brain_training_log` no `useEffect` inicial.

2. **Filtrar gaps**: Na renderização dos `knowledgeData.gaps`, filtrar com `.filter(gap => !trainedTags.has(extractTag(gap.title)))` — onde `extractTag` extrai o texto entre aspas do título.

3. **Atualizar imediatamente**: No `saveTrainNote`, após salvar, adicionar `trainModalTag` ao `trainedTags` no state local para que o card suma instantaneamente sem precisar recarregar.

