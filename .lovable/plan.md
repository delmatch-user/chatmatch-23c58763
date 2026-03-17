

## Mover conversa para o topo ao receber nova mensagem

### Diagnóstico

A página `/conversas` já ordena por `updatedAt` desc e atualiza esse campo no realtime — isso funciona. Os pontos onde a ordenação pode falhar:

1. **`/conversas` — ConversationList não re-ordena independentemente**: A ordenação vem do `useMemo` no `Conversations.tsx`, que depende de `[conversations]`. Quando chega mensagem, `updatedAt` é atualizado e o array é recriado via `prev.map(...)`, re-triggerando o sort. Isso **já funciona**.

2. **`/interno` — InternalChat.tsx**: Os canais e DMs são ordenados por `lastActivityDetails` do `useUnreadMessages`. O realtime listener atualiza esse estado no INSERT. **Já funciona**.

3. **`FranqueadoPanel.tsx`**: Busca conversas e faz `filteredConversations` por search, mas **não ordena por última mensagem**. Quando chega mensagem nova via realtime, ele chama `fetchConversations()` inteiro, que retorna na ordem do banco sem sort explícito por `updated_at`.

4. **`Queue.tsx`**: Ordena por `waitTime` (tempo de espera), o que faz sentido para fila.

### Alterações

**1. `src/pages/FranqueadoPanel.tsx`** — Adicionar sort por `updatedAt` desc na lista de conversas filtradas, garantindo que a conversa com mensagem mais recente fique no topo.

**2. `src/contexts/AppContext.tsx`** — Garantir que o `setConversations` no handler de realtime messages re-ordene o array (não apenas atualize o item no lugar). Após o `.map()`, adicionar um `.sort()` por `updatedAt` para que a conversa com nova mensagem suba para o topo imediatamente, sem depender do `useMemo` downstream.

### Arquivos editados
- `src/contexts/AppContext.tsx` — sort após atualizar conversa no realtime handler
- `src/pages/FranqueadoPanel.tsx` — sort na lista filtrada

