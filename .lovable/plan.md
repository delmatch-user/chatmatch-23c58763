

# Filtrar Treinamento apenas para Robôs do Suporte (Júlia e Sebastião)

## Problema
A Edge Function `brain-train-robots` busca **todos** os robôs com status active/paused, incluindo o Arthur (que pertence ao departamento Comercial/SDR). O treinamento deve ser exclusivo para robôs do Suporte.

## Solução

### Arquivo: `supabase/functions/brain-train-robots/index.ts`

Na query de robôs (linha 21-24), adicionar filtro pelo departamento Suporte:

1. Buscar o ID do departamento Suporte: `departments.select('id').ilike('name', '%suporte%').maybeSingle()`
2. Após buscar os robôs, filtrar apenas os que têm o `department_id` do Suporte no array `departments`, **ou** que não têm departamentos definidos (robôs globais que atendem Suporte)
3. Alternativamente, como a coluna `departments` na tabela `robots` armazena IDs de departamentos como array de strings, filtrar com `.contains('departments', [suporteDeptId])`

Mudança concreta — substituir:
```typescript
const { data: robots } = await supabase
  .from("robots")
  .select("id, name, instructions, qa_pairs, tone, reference_links")
  .in("status", ["active", "paused"]);
```

Por:
```typescript
// Buscar dept Suporte
const { data: suporteDept } = await supabase
  .from("departments").select("id").ilike("name", "%suporte%").maybeSingle();
const suporteDeptId = suporteDept?.id;

// Buscar robôs e filtrar por Suporte
const { data: allRobots } = await supabase
  .from("robots")
  .select("id, name, instructions, qa_pairs, tone, reference_links, departments")
  .in("status", ["active", "paused"]);

const robots = (allRobots || []).filter(r => {
  const deps = r.departments || [];
  return deps.length === 0 || (suporteDeptId && deps.includes(suporteDeptId));
});
```

Isso garante que apenas Júlia e Sebastião (vinculados ao Suporte) recebam sugestões de treinamento, excluindo o Arthur.

### Arquivo único a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-train-robots/index.ts` | Filtrar robôs pelo departamento Suporte |

