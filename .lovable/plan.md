

## Correção: Campo errado na verificação de permissão de finalização

### Problema
Em `supabase/functions/sync-robot-schedules/index.ts` (linha 636), o guard verifica `robotTools?.finalize_conversations`, mas o campo real no objeto `tools` dos robôs se chama `canFinalize`. Resultado: a condição nunca é `true`, e robôs com o toggle ativo também não finalizam — ou, dependendo do fluxo, todos finalizam incorretamente.

### Correção
**Arquivo:** `supabase/functions/sync-robot-schedules/index.ts`
- Trocar `robotTools?.finalize_conversations` por `robotTools?.canFinalize` na linha 636.

Isso garante que apenas robôs com o toggle "Finalizar conversas" ativado na UI terão suas conversas auto-finalizadas por inatividade.

