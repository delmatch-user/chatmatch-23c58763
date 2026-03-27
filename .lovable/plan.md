

# Atualizar Logs IA para mostrar conversas finalizadas por robôs de qualquer departamento

## Problema atual
A página Logs IA (`src/pages/AILogs.tsx`) está hardcoded para buscar apenas do `SUPORTE_DEPARTMENT_ID`. Precisa mostrar conversas finalizadas por robôs filtradas pelo departamento do usuário logado.

## Mudanças

### 1. `src/pages/AILogs.tsx` — Remover filtro hardcoded e usar departamentos do usuário

**Query (linhas 185-189):**
- Remover `.eq('department_id', SUPORTE_DEPARTMENT_ID)`
- Filtrar por departamentos do usuário: `.in('department_id', user.departments)` (para atendentes/supervisores)
- Admin vê todos os departamentos
- Manter filtro de `finalized_by is null` (robô finalizou)

**Adicionar filtro de departamento na UI:**
- Adicionar um select de departamento nos filtros existentes (ao lado de canal/período)
- Se o usuário tem apenas 1 departamento, pré-selecionar automaticamente

### 2. `supabase/functions/ai-logs-report/index.ts` — Aceitar departmentId dinâmico

- Aceitar `departmentId` no body em vez de usar `SUPORTE_DEPARTMENT_ID` hardcoded
- Fallback para Suporte se não informado (compatibilidade)

### Detalhes técnicos

**AILogs.tsx fetchLogs:**
```typescript
// Admin vê tudo, outros veem só seus departamentos
let query = supabase
  .from('conversation_logs')
  .select('*')
  .order('finalized_at', { ascending: false });

if (!isAdmin) {
  query = query.in('department_id', user.departments || []);
}

// + filtro departamento selecionado na UI
if (selectedDept !== 'all') {
  query = query.eq('department_id', selectedDept);
}
```

**Filtro robô mantido:** `!log.finalized_by || !log.finalized_by_name` (identifica conversas finalizadas por robô).

**Report:** Passar `departmentId` selecionado para a edge function.

