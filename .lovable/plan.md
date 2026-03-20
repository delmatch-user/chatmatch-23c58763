

## ✅ Corrigir histórico incompleto em conversas abertas

### Problema
Conversas abertas perdiam histórico porque o sistema usava `messages.length <= 1` para decidir se carregava o histórico completo. Se mensagens chegavam via realtime antes de abrir a conversa, a contagem passava de 1 e o carregamento completo era pulado permanentemente.

### Solução implementada
- Adicionado flag `historyLoaded: boolean` ao tipo `Conversation`
- `loadConversationMessages` marca `historyLoaded = true` após carga completa
- ChatPanel usa `!conversation.historyLoaded` como gatilho (em vez de contagem)
- `fetchConversations` preserva `historyLoaded` e `messages` ao atualizar metadata
- Polling incremental só roda quando `historyLoaded === true`
- Adicionado botão "Recarregar histórico" no menu de ações da conversa
