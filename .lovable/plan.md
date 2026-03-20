## Impedir Delma de reassumir conversa após transferência — IMPLEMENTADO ✅

### Correções aplicadas em `supabase/functions/robot-chat/index.ts`:

1. **Robot Ownership Guard**: Adicionado `assigned_to_robot` ao SELECT inicial + guard que aborta se a conversa pertence a outro robô
2. **Recent Transfer Guard**: Verifica `transfer_logs` dos últimos 120s para a conversa — se houver transferência recente, o robô não reassume
3. Ambos guards são ignorados quando `isTransfer = true` (transferências legítimas)
