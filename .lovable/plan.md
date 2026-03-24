

# Corrigir: Filtros do Cérebro devem ser 100% fiéis ao período selecionado

## Problemas identificados

1. **"Hoje" e "Ontem" são idênticos** — ambos enviam `period=1` para a edge function, que calcula `now - 1 dia`. Não há como distinguir.
2. **Janela rolante em vez de dias calendário** — "Hoje" deveria ser meia-noite até agora, não "últimas 24h". "7 dias" deveria ser os últimos 7 dias completos a partir de meia-noite.
3. **Custom range não envia datas reais** — envia apenas a quantidade de dias, então um range personalizado de 1-5 março é igual a "últimos 5 dias".
4. **Limite de 1000 registros** pode truncar dados em períodos maiores (15/30 dias).

## Solução

### 1. Frontend (`src/pages/admin/AdminBrain.tsx`)

- Alterar `fetchMetrics` e `fetchReport` para enviar `periodStart` e `periodEnd` como datas ISO explícitas em vez de apenas `period` numérico.
- Calcular as datas corretamente:
  - **Hoje**: meia-noite de hoje (timezone SP) → agora
  - **Ontem**: meia-noite de ontem → meia-noite de hoje
  - **7/15/30 dias**: meia-noite de N dias atrás → agora
  - **Custom**: data início → fim do dia final
- Continuar enviando `period` (numérico) para compatibilidade com o cálculo do período anterior.

```text
getEffectiveDateRange() → { start: ISO string, end: ISO string, days: number }
  "today"     → [hoje 00:00 BRT, agora]
  "yesterday" → [ontem 00:00, hoje 00:00]
  "7"         → [7 dias atrás 00:00, agora]
  "custom"    → [from 00:00, to 23:59:59]
```

### 2. Edge Function (`supabase/functions/brain-analysis/index.ts`)

- Aceitar novos parâmetros opcionais `periodStart` e `periodEnd` (ISO strings).
- Se presentes, usar essas datas diretamente nas queries em vez de calcular `now - period * 24h`.
- Calcular o período anterior automaticamente com base na diferença de dias.
- Aumentar o limite de 1000 para 5000 registros para suportar períodos maiores.
- Adicionar paginação caso necessário (buscar em batches se houver mais de 5000).

```text
Lógica:
  if (periodStart && periodEnd fornecidos) {
    usar diretamente nas queries
    calcular prevPeriod = mesmo intervalo antes do periodStart
  } else {
    manter cálculo atual (fallback)
  }
```

### Mudanças resumidas

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Nova função `getEffectiveDateRange()` que calcula datas exatas. `fetchMetrics` e `fetchReport` enviam `periodStart`/`periodEnd` no body. |
| `supabase/functions/brain-analysis/index.ts` | Aceitar `periodStart`/`periodEnd`, usar nas queries, aumentar limit para 5000, calcular período anterior baseado no intervalo real. |

Isso garante que cada filtro retorne dados exatamente do período selecionado, sem sobreposição ou dados faltantes.

