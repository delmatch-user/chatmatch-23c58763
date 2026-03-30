

# Ordenar leads por data (mais recentes primeiro)

## Situação atual
A API já busca os deals com `.order('created_at', { ascending: false })`, mas o campo `createdAt` não é mapeado para o objeto `SDRDeal`, então não há garantia de ordenação client-side após atualizações em tempo real.

## Mudanças

### 1. `src/services/sdrApi.ts` — Mapear `createdAt` no SDRDeal
- Adicionar `createdAt?: string` na interface `SDRDeal`
- No `fetchPipeline`, mapear `createdAt: d.created_at`

### 2. `src/pages/sdr/SDRPipelinePage.tsx` — Ordenar explicitamente por data
- No render de cada coluna, ordenar `colDeals` por `createdAt` descendente:
```typescript
const colDeals = filteredDeals
  .filter(d => d.stageId === col.id)
  .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
```

Isso garante que mesmo após drag-and-drop ou atualização em tempo real, os leads mais recentes sempre aparecem no topo de cada coluna.

