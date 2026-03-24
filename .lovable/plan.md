

# Remover limite de 1000 registros nas consultas do Cérebro

## Problema

O Supabase tem um limite padrão de **1000 linhas por requisição** (configuração do PostgREST). Mesmo com `.limit(5000)`, o máximo retornado é 1000. Por isso o dashboard mostra "Total Conversas: 1000" — não porque há exatamente 1000, mas porque é o teto da query.

## Solução

Implementar **paginação** na edge function `brain-analysis` para buscar **todos** os registros do período, sem limite artificial.

**Arquivo**: `supabase/functions/brain-analysis/index.ts`

1. Criar uma função helper `fetchAllLogs` que pagina em blocos de 1000 usando `.range(from, to)` até não haver mais dados:

```typescript
async function fetchAllLogs(supabase, table, filters, selectColumns = '*') {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  while (true) {
    const query = supabase.from(table).select(selectColumns)
      // apply filters
      .range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    allData = allData.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}
```

2. Substituir as duas queries existentes (linhas 73-91) por chamadas à função paginada — uma para `currentLogs` (com `select("*")`) e outra para `prevLogs` (com select parcial).

3. Remover os `.limit(5000)` que não funcionavam.

Isso garante que independente de quantas conversas existam no período (1000, 3000, 10000+), **todas** serão contabilizadas nas métricas.

