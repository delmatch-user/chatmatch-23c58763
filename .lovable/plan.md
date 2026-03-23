

## Plano: Padronizar diálogo de mensagens do Logs IA com o Histórico

### Problema
O diálogo de mensagens em `AILogs.tsx` (linhas 472-505) usa uma lógica simplificada: `msg.sender_id ? ml-auto : items-start`, sem tratar mensagens de sistema nem usar o mesmo layout de bolhas do Histórico. O `ConversationPreviewDialog` já foi corrigido anteriormente.

### Correção

**Arquivo:** `src/pages/AILogs.tsx` (linhas 472-505)

Substituir o bloco de renderização de mensagens para usar o mesmo padrão do `History.tsx`:

1. **Extrair campos normalizados** — `senderId`, `senderName`, `msgType`, `msgTimestamp` (suportando ambos os formatos camelCase e snake_case)
2. **Detectar mensagens de sistema** — `msgType === 'system'` ou `senderName === 'SYSTEM'`/`'[SISTEMA]'` → centralizar com estilo discreto
3. **Separar contato vs agente/robô** — `isContact = senderId === 'contact' || !senderId` (sem ser system) → esquerda (bg-muted); caso contrário → direita (bg-primary)
4. **Layout de bolhas** — `max-w-[80%] rounded-2xl px-4 py-2` com `rounded-bl-md` (contato) ou `rounded-br-md` (agente), nome do remetente, conteúdo, e timestamp
5. **Suporte a mídia** — manter indicadores `[audio]`, `[image]`, `[file]` para tipos de mídia
6. **ScrollArea** — já está usando `ScrollArea`, manter `flex-1 max-h-[60vh]`

### Resultado
O Logs IA terá o mesmo visual de bolhas separadas (esquerda/direita) com scroll, idêntico ao Histórico e ao Preview da fila.

