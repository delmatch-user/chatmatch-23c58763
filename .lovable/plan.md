

## Impedir Delma de reassumir conversa após transferência

### Problema

Quando Delma transfere para Sebastião via `transfer_to_robot`, a conversa fica com `assigned_to_robot = Sebastião` e `robot_transferred = false` (intencional para robot-to-robot). Porém, se `sync-robot-schedules` ou um webhook re-dispara `robot-chat` com o ID da Delma, os guards iniciais não verificam se a conversa ainda pertence à Delma:

- `robot_transferred` = false (pass)
- `assigned_to` = null (pass)
- `robot_lock_until` = null (pass, pois transfer_to_robot limpa o lock)

Resultado: Delma processa novamente, responde com mensagem de transferência duplicada.

### Correção

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Adicionar `assigned_to_robot` ao SELECT inicial** (linha 687): incluir o campo no query da conversa.

2. **Novo guard: verificar ownership do robô** (após linha 698): Se `convData.assigned_to_robot` existe e é diferente do `robotId` atual, e não é uma transferência explícita (`isTransfer`), abortar imediatamente.

```text
// Logo após o ROBOT_TRANSFERRED GUARD (linha 698):
if (convData?.assigned_to_robot && convData.assigned_to_robot !== robotId && !isTransfer) {
  console.log(`[Robot-Chat Auto] Conversa ${conversationId} pertence ao robô ${convData.assigned_to_robot}, não ao ${robotId}. Ignorando.`);
  return { skipped: true, reason: 'assigned_to_different_robot' };
}
```

3. **Adicionar guard de transferência recente FROM this robot** (antes do lock): Verificar se este robô já transferiu esta conversa nos últimos 120 segundos. Se sim, abortar.

```text
// Antes do lock imediato (linha 727):
const { data: recentOutboundTransfer } = await supabase
  .from('transfer_logs')
  .select('id')
  .eq('conversation_id', conversationId)
  .eq('from_robot_id', robotId)
  .gte('created_at', new Date(Date.now() - 120000).toISOString())
  .limit(1)
  .maybeSingle();

if (recentOutboundTransfer && !isTransfer) {
  return { skipped: true, reason: 'robot_recently_transferred_out' };
}
```

### Impacto
- Delma nunca mais reassume uma conversa que já transferiu para outro robô
- Nenhuma mudança no fluxo normal: transferências legítimas (com `isTransfer: true`) continuam funcionando
- Dupla proteção: ownership check + outbound transfer check

