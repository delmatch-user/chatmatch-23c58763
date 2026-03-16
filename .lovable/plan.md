

## Diagnóstico

O gráfico "Atividade por Hora" busca **todos** os `conversation_logs` sem filtro de data (linha 151-153). O Supabase tem limite padrão de **1000 linhas** por query. Com o acúmulo de logs históricos, a query retorna apenas os 1000 mais antigos, e os logs de **hoje** ficam fora do resultado. Por isso o gráfico parou de atualizar.

O mesmo problema afeta a query de métricas de tempo (linhas 144-148) — sem filtro de data, ela também pode perder logs recentes.

## Solução

### Arquivo: `src/pages/admin/AdminDashboard.tsx`

Adicionar filtro `.gte('started_at', today.toISOString())` nas duas queries dentro de `fetchTimeMetrics`:

1. **Query `allLogs`** (gráfico horário) — filtrar por `started_at >= hoje 00:00`
2. **Query `onlineLogs`** (métricas TMA/TME) — filtrar por `started_at >= hoje 00:00` (já que o dashboard mostra dados do dia)

Isso elimina a necessidade do filtro client-side `if (logDate >= today)` e garante que a query sempre retorne os dados de hoje, independente do volume total de logs.

