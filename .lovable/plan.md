

## Plano: Melhorar scroll e separação de mensagens no ConversationPreviewDialog

### Problema
O diálogo de preview na fila usa um `div` com `overflow-y-auto` simples, sem a estilização de scroll consistente com o Histórico. As mensagens também não têm separadores de data nem nomes de remetente no lado do contato.

### Correções

**Arquivo:** `src/components/queue/ConversationPreviewDialog.tsx`

1. **Substituir div de scroll pelo componente `ScrollArea`** (já importado mas não usado na área de mensagens) — trocar o `div ref={scrollRef}` por `ScrollArea` com altura adequada para garantir scrollbar estilizada.

2. **Adicionar separadores de data** entre mensagens de dias diferentes (padrão "Hoje", "Ontem", "dd/MM/yyyy"), igual ao Histórico e ao ChatPanel.

3. **Mostrar nome do remetente** nas mensagens do contato (lado esquerdo) para paridade com as mensagens de agente/robô (lado direito) que já exibem `senderName`.

4. **Ajustar scroll ref** para funcionar com `ScrollArea` (usar ref no viewport interno).

### Resultado
O preview terá scrollbar estilizada, separação visual por datas e identificação clara de quem enviou cada mensagem — consistente com a tela de Histórico.

