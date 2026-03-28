

# Corrigir primeira mensagem duplicada da Delma

## Causa raiz

Duas chamadas concorrentes ao `robot-chat` para a mesma conversa:

1. **webhook-machine** cria a conversa, atribui o robô, e chama `robot-chat` (fire-and-forget)
2. **sync-robot-schedules** (segunda varredura — "conversas travadas") encontra a mesma conversa com robô atribuído mas sem resposta do robô ainda (porque o robot-chat da etapa 1 ainda está processando com delays de 2s + agrupamento) e chama `robot-chat` novamente

A segunda varredura (linha 330-350) verifica se existe mensagem do robô **após** a última do cliente, mas como o primeiro `robot-chat` ainda está no delay de agrupamento, não há resposta do robô ainda → dispara segunda chamada.

O lock de 20s (`robot_lock_until`) deveria bloquear a segunda chamada, mas o sync-robot-schedules **não verifica o lock** antes de chamar robot-chat. Embora robot-chat tenha o guard na linha 960, a janela de timing entre o webhook-machine setando o lock e o sync rodando pode causar race conditions.

## Correção

### 1. `supabase/functions/sync-robot-schedules/index.ts` — Checar `robot_lock_until` antes de retry

Na segunda varredura (conversas travadas), adicionar `robot_lock_until` ao select (linha 282) e pular conversas com lock ativo antes de disparar robot-chat.

**Select (linha 282):** Adicionar `robot_lock_until` ao select
```typescript
.select("id, department_id, channel, contact_id, external_id, assigned_to_robot, sdr_deal_id, robot_transferred, robot_lock_until")
```

**Guard (após linha 306, antes de buscar última mensagem):** Pular se lock ativo
```typescript
if (conv.robot_lock_until && new Date(conv.robot_lock_until) > new Date()) {
  continue; // Lock ativo — robot-chat já está processando
}
```

### 2. `supabase/functions/webhook-machine/index.ts` — Setar lock antes de chamar robot-chat

Quando o webhook-machine atribui o robô e vai chamar robot-chat, setar `robot_lock_until` imediatamente na conversa para que o sync-robot-schedules não dispare uma segunda chamada.

**Após criação/atualização da conversa com robô atribuído (antes de chamar robot-chat, ~linha 484-497):**
```typescript
// Setar lock antes de chamar robot-chat para evitar que sync-robot-schedules duplique
await supabase.from('conversations').update({
  robot_lock_until: new Date(Date.now() + 30000).toISOString()
}).eq('id', conversationId);
```

Aplicar o mesmo na linha 106-113 (conversa existente que recebe robô).

### Resultado
- webhook-machine seta lock de 30s antes de chamar robot-chat
- sync-robot-schedules verifica o lock e pula conversas sendo processadas
- Elimina a janela de race condition que causa mensagem duplicada

