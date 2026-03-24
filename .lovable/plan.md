

# Plano: Atualizar dados em tempo real ao trocar filtro de período

## Problema

Ao mudar o filtro de período (ex: de 7 dias para 30 dias), as métricas principais (TMA/TME) atualizam porque `fetchMetrics` depende de `getEffectivePeriod`. Porém, `loadAgentLiveStatus`, `loadAgentNotifications`, `loadReportHistory` e `loadMaturityHistory` rodam apenas uma vez (dependency array `[]`), ficando desatualizados.

## Solução

Alterar o `useEffect` na linha 560-566 para incluir `getEffectivePeriod` como dependência, garantindo que **tudo** recarregue ao trocar o período:

```typescript
useEffect(() => {
  loadReportHistory();
  loadMaturityHistory();
  loadScheduleConfig();
  loadAgentLiveStatus();
  loadAgentNotifications();
}, [getEffectivePeriod, loadAgentLiveStatus, loadAgentNotifications]);
```

## Arquivo editado

- `src/pages/admin/AdminBrain.tsx` — apenas o `useEffect` com array de dependências vazio.

