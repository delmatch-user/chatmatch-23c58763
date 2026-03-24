

# Corrigir timestamps para formato brasileiro (BRT) no Cérebro

## Problema

Todas as datas e horários no bloco de conversas detalhadas são exibidos em formato ISO/UTC (ex: `2026-03-24T21:58:24.546Z`). O gestor espera formato brasileiro: `24/03/2026 18:58` (horário de Brasília, UTC-3).

## Mudança

**Arquivo**: `supabase/functions/brain-analysis/index.ts`

1. Criar uma função helper `formatBR(isoString)` que converte qualquer timestamp ISO para `DD/MM/YYYY HH:mm` no fuso `America/Sao_Paulo`
2. Aplicar nos seguintes pontos:
   - **Linha 411**: timestamps das mensagens (`m.created_at || m.timestamp`)
   - **Linha 415**: `l.started_at` e `l.finalized_at`
   - **Linha 362**: datas dos buckets diários por agente (converter `YYYY-MM-DD` para `DD/MM/YYYY`)
   - **Linha 370**: datas das tendências diárias globais

```typescript
function formatBR(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
```

Aplicações:
- Mensagens: `[${formatBR(m.created_at || m.timestamp)}]`
- Conversas: `Início: ${formatBR(l.started_at)} | Fim: ${formatBR(l.finalized_at)}`
- Daily buckets: `${formatDateBR(day)}: ${d.count} conversas...`
- Tendências: `${formatDateBR(d.date)}: TMA...`

