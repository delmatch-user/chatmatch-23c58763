

## Plano: Sincronizar Ranking do Dashboard com a Página de Ranking

### Problema
O ranking no AdminDashboard e a página Ranking usam queries e lógicas diferentes:

| Aspecto | Dashboard | Ranking |
|---------|-----------|---------|
| Filtro `reset_at` | Nenhum | `IS NULL` |
| Filtro de data | Nenhum (all-time) | Apenas hoje |
| Ordenação | Total de conversas | Score ponderado (conversas + TMA + TME) |

### Solução
Alterar `fetchAgentRanking` no `AdminDashboard.tsx` para usar os mesmos filtros e cálculos da página Ranking:

1. Adicionar `.is('reset_at', null)` na query
2. Adicionar `.gte('finalized_at', today.toISOString())` para filtrar apenas hoje
3. Buscar `ranking_config` do departamento Suporte para obter os pesos e metas
4. Calcular score ponderado igual ao Ranking (conversas vs meta, TMA score, TME score)
5. Ordenar por score em vez de total de conversas

### Arquivo
- `src/pages/admin/AdminDashboard.tsx` — alterar `fetchAgentRanking` e adicionar fetch de `ranking_config`

