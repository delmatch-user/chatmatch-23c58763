

# Corrigir "Status do Suporte" — Filtrar Apenas Departamento Suporte

## Problema
A funcao `handleQuery` no `status_suporte` busca TODOS os profiles online/busy e TODAS as conversas ativas, sem filtrar por departamento Suporte nem por role atendente.

## Solucao
Reescrever o bloco `status_suporte` dentro de `handleQuery` (linhas 232-251 de `supabase/functions/delma-chat-command/index.ts`) para:

### 1. Buscar o department_id do Suporte
```sql
departments.select("id").ilike("name", "%suporte%").limit(1)
```

### 2. Buscar apenas atendentes do Suporte
- Buscar `profile_departments` filtrado pelo `department_id` do Suporte
- Buscar `user_roles` com `role = 'atendente'` para esses user_ids
- Buscar `profiles` com status `online` ou `busy` apenas para esses user_ids filtrados

### 3. Conversas ativas filtradas
- Buscar `conversations` com status `em_atendimento` ou `em_fila` onde `department_id` = Suporte dept id

### 4. TMA e TME do dia
- Buscar `conversation_logs` de hoje filtrados por `department_id` do Suporte
- Calcular TMA e TME

### 5. Formato de resposta
```
📊 Status do Suporte

• X conversas ativas no suporte
• X atendentes do suporte online: [nomes]
• X atendentes ocupados (em atendimento ativo)
• X conversas na fila aguardando atendimento
• TMA atual: X min
• TME atual: X min
```

## Arquivo a editar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/delma-chat-command/index.ts` | Reescrever bloco `status_suporte` (linhas 232-251) com queries filtradas por dept Suporte + role atendente + formato expandido |

Nenhuma outra funcionalidade do chat alterada.

