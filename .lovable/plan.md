

## Plano: Garantir que IAs Entendam e Ajam com Base no Motivo da Transferência

### Problema
Ambas as Edge Functions (`robot-chat` e `sdr-robot-chat`) já buscam o motivo da transferência de `transfer_logs` e injetam como mensagem de sistema. Porém, essa mensagem é colocada **após** o histórico de conversa, onde LLMs tendem a depriorizá-la. A IA pode ignorar a instrução e dar uma resposta genérica em vez de seguir o motivo.

### Solução
Mover o contexto da transferência para **imediatamente após o system prompt principal**, antes do histórico de conversa, onde a IA dará máxima atenção.

### Alterações

**1. `supabase/functions/robot-chat/index.ts` (~linha 1165)**
- Mover o bloco `lastTransfer?.reason` de depois do `conversationHistory` para logo após o system prompt
- Estrutura: `[systemPrompt, transferContext, ...conversationHistory]`

**2. `supabase/functions/sdr-robot-chat/index.ts` (~linha 887)**
- Mesma mudança: mover `lastTransfer?.reason` para antes do histórico
- Reforçar a instrução para que o Arthur aja imediatamente com base no motivo (ex: enviar simulação)

### Exemplo da mudança
```text
ANTES:
  messages: [systemPrompt, ...history, transferContext]

DEPOIS:
  messages: [systemPrompt, transferContext, ...history]
```

Isso garante que a IA processe o motivo como contexto prioritário antes de ver as mensagens, resultando em respostas alinhadas com a instrução do atendente.

