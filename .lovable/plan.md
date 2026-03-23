

## Plano: Corrigir separação de mensagens enviadas/recebidas no Preview

### Problema
O `ConversationPreviewDialog` usa uma lógica simplificada para determinar se a mensagem é do contato: `!message.senderId || message.senderId === 'contact'`. Isso não funciona porque mensagens de robôs podem ter `sender_id` como `'robot'` ou um UUID de atendente — a lógica atual trata tudo que não é exatamente `'contact'` como mensagem do sistema, mas o fallback `|| 'contact'` no mapeamento (linha 105) faz com que mensagens com `sender_id = null` (que podem ser do robô) sejam tratadas como do contato.

O ChatPanel usa uma lógica mais robusta: verifica se o `senderId` pertence a um usuário do sistema (`users.some(u => u.id === msg.senderId)`) e também verifica marcadores como `[ROBOT]` e `(IA)` no `senderName`.

### Correção

**Arquivo:** `src/components/queue/ConversationPreviewDialog.tsx`

1. **Corrigir o mapeamento de `senderId`** — não forçar `'contact'` como fallback quando `sender_id` é null. Manter null/undefined para diferenciação posterior.

2. **Adotar a mesma lógica do ChatPanel** para identificar mensagens do contato vs agente/robô:
   - Mensagem do contato: `senderId === 'contact'`
   - Mensagem de robô: `senderName` contém `[ROBOT]` ou `(IA)`, ou `senderId === 'robot'`
   - Mensagem de agente: qualquer outro `senderId` (UUID)
   - `isFromContact` = NÃO é robô E NÃO é agente (UUID) — ou seja, `senderId === 'contact'` apenas

3. **Manter o layout visual existente** (esquerda para contato, direita para agente/robô) que já está correto no JSX.

### Resultado
Mensagens do cliente aparecerão à esquerda (fundo cinza) e mensagens de robôs/agentes à direita (fundo primário), igual ao ChatPanel e ao screenshot de referência.

