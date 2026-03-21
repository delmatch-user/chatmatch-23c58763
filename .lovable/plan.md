

## Plano: Sincronizar Dashboard com o Sistema de Chat

### Problemas Identificados

1. **TMA/TME sem filtro de data no banco** — `fetchTimeMetrics` busca TODOS os `conversation_logs` sem filtrar por hoje nem por `reset_at IS NULL`. Isso pode bater no limite de 1000 linhas do Supabase e retornar dados antigos/resetados.

2. **"Finalizadas" conta do lugar errado** — Usa `conversations.filter(c => c.status === 'finalizada')`, mas conversas finalizadas são deletadas da tabela `conversations` e movidas para `conversation_logs`. O valor será sempre ~0.

3. **Gráfico "Atividade por Hora" filtra client-side** — Busca ALL logs e filtra por `startedAt >= today` no JavaScript. Com muitos logs, o limite de 1000 linhas omite dados recentes.

### Solução

Alterar `src/pages/admin/AdminDashboard.tsx`:

**1. `fetchTimeMetrics` — adicionar filtros de banco**
- Query de logs online: adicionar `.is('reset_at', null)` e `.gte('started_at', today.toISOString())`
- Query de todos logs (gráfico): adicionar `.gte('started_at', today.toISOString())` para filtrar no banco em vez de client-side
- Remover filtro client-side `if (logDate >= today)` que fica redundante

**2. "Finalizadas" — contar de `conversation_logs`**
- Adicionar novo state `todayFinalized` e buscar count de `conversation_logs` filtrado por `finalized_at >= today` e `reset_at IS NULL`
- Usar esse valor no MiniStat "Finalizadas" em vez de `completed`

**3. Realtime listener — adicionar `profiles` para status online**
- Adicionar listener de `profiles` para atualizar status online/away em tempo real

### Arquivo
- `src/pages/admin/AdminDashboard.tsx`

