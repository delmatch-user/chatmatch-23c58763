

# Filtrar notificações por atendente logado

## Problema
A query na página de Notificações busca **todas** as notificações sem filtrar por `agent_id`. Isso faz com que cada atendente veja as notificações de todos os outros. A RLS já protege via `agent_id = auth.uid()`, mas o código também deve filtrar explicitamente para clareza e para evitar erros silenciosos.

## Mudança

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Notifications.tsx` | Adicionar `.eq('agent_id', user.id)` na query e no canal realtime |

## Detalhes técnicos

1. **Query principal (linha 30-32)**: Adicionar `.eq('agent_id', user.id)` antes do `.order()`
2. **Canal realtime (linha 66-70)**: Adicionar filtro `filter: 'agent_id=eq.' + user.id` no subscribe para receber apenas INSERTs do próprio agente
3. **Guard clause**: Não executar fetch se `user` for null

A RLS já garante que apenas o próprio agente vê seus registros (`agent_id = auth.uid()`), mas o filtro explícito no código evita queries desnecessárias e torna a intenção clara.

