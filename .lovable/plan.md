

# Corrigir Botões da Central de Sugestões da Delma (sempre 0)

## Problemas identificados

### 1. CORS Headers incompletos em `brain-learn-from-conversations`
O header CORS inclui apenas `"authorization, x-client-info, apikey, content-type"`, mas o Supabase JS client envia headers adicionais (`x-supabase-client-platform`, etc.). Isso faz o preflight CORS falhar silenciosamente — a função nunca executa.

### 2. Deduplicação agressiva demais (linhas 401-412)
O filtro usa `existing.includes(titleLower) || titleLower.includes(existing)` — substring match bidirecional. Qualquer título que contenha uma palavra em comum com outro título existente é descartado. Com títulos em português genéricos, isso elimina quase tudo.

### 3. Funções possivelmente não deployadas
Os logs das Edge Functions estão vazios, indicando que as edições recentes podem não ter sido deployadas.

## Dados confirmados
- **2680 conversas do Suporte** nos últimos 7 dias — dados abundantes
- Banco tem apenas sugestões `report_schedule` — nenhuma `aprendizado_humano` ou `aprendizado_robo` existe

## Correções

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/brain-learn-from-conversations/index.ts` | Corrigir CORS headers (adicionar headers completos do Supabase client). Substituir deduplicação por substring por comparação de similaridade mais estrita (igualdade exata apenas). |
| 2 | `supabase/functions/brain-learn-instruction-patterns/index.ts` | Verificar e corrigir mesma deduplicação agressiva se existente |
| 3 | `supabase/functions/brain-train-robots/index.ts` | Verificar CORS headers |

### Detalhes técnicos

**CORS (todas as 3 funções):**
```
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

**Deduplicação (brain-learn-from-conversations, linha 401-412):**
Substituir substring match por igualdade exata:
```typescript
const filtered = suggestions.filter(s => {
  const titleLower = s.title?.toLowerCase();
  if (!titleLower) return false;
  if (rejectedTitles.has(titleLower)) return false;
  if (approvedTitles.has(titleLower)) return false;
  return !existingTitles.some(existing => existing === titleLower);
});
```

As funções serão re-deployadas automaticamente após a edição.

