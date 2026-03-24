

# Corrigir cálculo de datas no filtro do Cérebro

## Problema raiz

A função `getEffectiveDateRange()` no frontend calcula as datas de forma errada:

```typescript
// BUGADO: toLocaleString retorna string "3/24/2026, 12:00:00 PM"
// new Date() interpreta como horário LOCAL do browser, não UTC-3
const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
const todayMidnight = new Date(spNow);
todayMidnight.setHours(0, 0, 0, 0);
// Resultado: 2026-03-24T00:00:00.000Z (= 21h do dia anterior em SP!)
```

A meia-noite de São Paulo é **03:00 UTC**, não 00:00 UTC. Isso faz com que o período "Hoje" inclua dados do dia anterior e exclua dados das últimas 3 horas.

## Solução

**Arquivo**: `src/pages/admin/AdminBrain.tsx` — reescrever `getEffectiveDateRange()` com cálculo correto de timezone:

```typescript
const getEffectiveDateRange = useCallback(() => {
  const now = new Date();
  
  // Calcular meia-noite de SP corretamente:
  // Pegar a data atual em SP, depois construir meia-noite em UTC
  const spFormatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/Sao_Paulo', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  });
  const spDateStr = spFormatter.format(now); // "2026-03-24"
  // Meia-noite de SP = dia + "T03:00:00.000Z" (UTC-3)
  const todayMidnightUTC = new Date(spDateStr + 'T03:00:00.000Z');

  if (period === 'today') {
    return { start: todayMidnightUTC.toISOString(), end: now.toISOString(), days: 1 };
  }
  if (period === 'yesterday') {
    const yesterdayMidnight = new Date(todayMidnightUTC.getTime() - 24*60*60*1000);
    return { start: yesterdayMidnight.toISOString(), end: todayMidnightUTC.toISOString(), days: 1 };
  }
  if (period === 'custom' && customDateRange.from && customDateRange.to) {
    // from/to são datas do calendário, converter para UTC com offset SP
    const fromStr = customDateRange.from.toISOString().substring(0, 10);
    const toStr = customDateRange.to.toISOString().substring(0, 10);
    const fromUTC = new Date(fromStr + 'T03:00:00.000Z');
    const toUTC = new Date(new Date(toStr + 'T03:00:00.000Z').getTime() + 24*60*60*1000);
    const days = Math.max(1, differenceInDays(customDateRange.to, customDateRange.from) + 1);
    return { start: fromUTC.toISOString(), end: toUTC.toISOString(), days };
  }
  const days = parseInt(period);
  const startDate = new Date(todayMidnightUTC.getTime() - days * 24*60*60*1000);
  return { start: startDate.toISOString(), end: now.toISOString(), days };
}, [period, customDateRange]);
```

Isso garante que "Hoje" = 00:00 BRT (03:00 UTC) até agora, "Ontem" = dia anterior completo em horário de Brasília, e períodos numéricos/custom também respeitem o fuso correto.

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Reescrever `getEffectiveDateRange()` com cálculo correto de UTC-3 |

