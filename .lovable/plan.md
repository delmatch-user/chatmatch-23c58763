

## Impedir Delma de enviar mensagem duplicada após transfer_to_robot

### Problema

Quando Delma executa `transfer_to_robot` para transferir ao Sebastião, o código:
1. Limpa `aiResponse` (linha 1254) ✅
2. Mas **redefine** `aiResponse = args.message_to_client` na linha 1443 ❌
3. Define `skipSending = true` (não envia via WhatsApp) ✅
4. Mas ainda **salva a mensagem no banco** como "Delma [ROBOT]" (linhas 1550-1558) ❌

Resultado: Delma insere sua mensagem no banco E Sebastião também responde, gerando duplicação visível no chat.

### Correção

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Criar flag `skipDBSave`**: Quando `transfer_to_robot` é executado, marcar que a resposta da Delma NÃO deve ser salva no banco (nem enviada). O robô destino (Sebastião) é quem responde.

2. **Aplicar no bloco `transfer_to_robot`** (linha ~1443): Definir `aiResponse = ''` ao invés de usar `args.message_to_client`, e adicionar flag para pular salvamento no DB.

3. **Condicionar o bloco de salvamento** (linha ~1546-1558): Pular inserção de mensagens quando a flag estiver ativa.

### Mudança concreta

```text
Linha ~1443:
  ANTES: aiResponse = args.message_to_client || '';
  DEPOIS: aiResponse = ''; // Robô destino responde, não a Delma

Linha ~1546 (bloco de salvamento):
  ANTES: for (let i = 0; i < messageParts.length; i++) { ... insert ... }
  DEPOIS: if (!hasTransferTool) { for (let i = 0; ...) { ... } }
```

### Impacto
- Delma transfere sem enviar mensagem duplicada
- Sebastião responde como único interlocutor após a transferência
- Mensagem de sistema "🤖 Sebastião assumiu a conversa" continua aparecendo normalmente
- Nenhuma mudança nos outros fluxos de transferência (department/human)

