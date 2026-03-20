

## Mostrar histórico completo na fila antes do atendente assumir

### Problema

As mensagens do robô ficam salvas no banco corretamente durante transferências, mas o **preview da fila** (`ConversationPreviewDialog`) usa apenas a mensagem sintética do `last_message_preview` — ou seja, mostra somente a última mensagem. O atendente humano não vê o contexto completo (interação com Delma/Sebastião) antes de assumir, e ao abrir a conversa recebe ela "picada".

### Correção

**Arquivo: `src/components/queue/ConversationPreviewDialog.tsx`**

Ao abrir o dialog de preview, carregar as mensagens reais do banco (tabela `messages`) ao invés de usar apenas `conversation.messages` (sintético).

1. Adicionar state `realMessages` e um `useEffect` que dispara ao abrir o dialog:
   - Faz `supabase.from('messages').select('*').eq('conversation_id', conversation.id).order('created_at', { ascending: true })`
   - Mapeia para o formato `Message[]`
   - Usa `realMessages` (se carregadas) no lugar de `conversation.messages` para renderizar

2. Adicionar indicador de loading enquanto as mensagens são buscadas

3. Manter fallback para `conversation.messages` caso a busca falhe

### Impacto
- Atendente vê TODO o histórico (mensagens do cliente + respostas dos robôs + mensagens de sistema) antes de assumir
- Contexto completo visível sem precisar assumir primeiro
- Nenhuma mudança no fluxo de banco de dados ou no robot-chat

