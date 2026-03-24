

# Plano: Filtrar Matteus e Mayara do Cérebro

Alteração simples na função `filterMetrics` em `src/pages/admin/AdminBrain.tsx` (linha 118).

## Mudança

Adicionar `matteus` e `mayara` à lista de nomes filtrados no `filterMetrics`, que já exclui "fábio" e "arthur":

```typescript
agentStats: (raw.agentStats || []).filter((a: AgentStat) =>
  !a.name.toLowerCase().includes('fábio') &&
  !a.name.toLowerCase().includes('fabio') &&
  !a.name.toLowerCase().includes('arthur') &&
  !a.name.toLowerCase().includes('matteus') &&
  !a.name.toLowerCase().includes('mayara')
),
```

Nenhuma outra alteração necessária — o filtro já se aplica em todos os locais onde `filterMetrics` é chamado (métricas rápidas e relatório completo).

