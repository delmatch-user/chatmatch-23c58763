## Impedir Delma de reassumir conversa após transferência — IMPLEMENTADO ✅

### Correções aplicadas em `supabase/functions/robot-chat/index.ts`:

1. **Robot Ownership Guard**: Adicionado `assigned_to_robot` ao SELECT inicial + guard que aborta se a conversa pertence a outro robô
2. **Recent Transfer Guard**: Verifica `transfer_logs` dos últimos 120s para a conversa — se houver transferência recente, o robô não reassume
3. Ambos guards são ignorados quando `isTransfer = true` (transferências legítimas)

## Triagem Contextual da Delma — IMPLEMENTADO ✅

### Correção aplicada em `supabase/functions/robot-chat/index.ts`:

- Injetadas **Regras de Triagem Contextual** no system prompt quando `availableRobots.length > 0`
- Delma agora lê a mensagem do cliente antes de responder
- Se o assunto já está claro, transfere direto sem perguntar
- Só questiona se a mensagem for saudação genérica
