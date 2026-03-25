

# Filtrar Cérebro exclusivamente para membros do Suporte

## Problema
O gráfico "Comparativo de TMA por Atendente" e outras seções do Cérebro mostram pessoas de outros departamentos (ex: Castanheira) que atenderam conversas transferidas do Suporte mas não pertencem ao departamento. O Cérebro deve mostrar apenas membros efetivos do Suporte.

## Solução

### 1. Edge Function `brain-analysis/index.ts`
- Após buscar os logs, consultar `profile_departments` + `departments` para obter a lista de `user_id`s que pertencem ao departamento Suporte
- Consultar `profiles` para mapear `user_id` → `name`
- Filtrar `suporteLogs` (linha 187) para incluir apenas agentes cujo nome está na lista de membros do Suporte
- Mesmo filtro no `prevAgentStats` (linha 235)

### 2. Frontend `AdminBrain.tsx` — `loadAgentLiveStatus`
- Na função `loadAgentLiveStatus` (linha 459), buscar `profile_departments` filtrando pelo `department_id` do Suporte
- Filtrar `profiles` para incluir apenas os membros do Suporte no status ao vivo

### 3. Edge Function `delma-autonomous-analysis/index.ts`
- Na função `analyzeAgentGoals`, após buscar os logs, filtrar por membros do Suporte usando `profile_departments`
- Na função `storeDataSignals`, filtrar `agentMetrics` para incluir apenas membros do Suporte

### Detalhes técnicos
```text
brain-analysis/index.ts:
  1. Buscar dept Suporte: departments.select('id').ilike('name', '%suporte%')
  2. Buscar membros: profile_departments.select('profile_id').eq('department_id', suporteDeptId)
  3. Buscar nomes: profiles.select('id, name').in('id', memberIds)
  4. Criar Set<string> com nomes de membros
  5. Filtrar suporteLogs: l.assigned_to_name IN memberNames

AdminBrain.tsx loadAgentLiveStatus:
  1. Buscar dept Suporte por nome
  2. Buscar profile_departments para aquele dept
  3. Filtrar profiles para incluir apenas membros

delma-autonomous-analysis/index.ts:
  1. Mesmo padrão: buscar dept → membros → filtrar logs
```

### Arquivos a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Filtrar agentStats por membros do Suporte |
| `src/pages/admin/AdminBrain.tsx` | Filtrar loadAgentLiveStatus por membros do Suporte |
| `supabase/functions/delma-autonomous-analysis/index.ts` | Filtrar analyzeAgentGoals e storeDataSignals por membros |

