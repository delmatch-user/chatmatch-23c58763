

# Corrigir Arthur (SDR) travado por lock atômico

## Diagnóstico confirmado

Os logs mostram claramente o problema: **dezenas de chamadas consecutivas ao `sdr-robot-chat` falhando com "Lock atômico NÃO conquistado"**. A conversa da Lilian Melo está travada desde 18:28 — o lock nunca é liberado porque:

1. O `sdr-robot-chat` **não lê `isRetry`** do body (diferente do `robot-chat` que já foi corrigido)
2. O cron `sync-robot-schedules` envia `isRetry: true`, mas o SDR ignora completamente
3. O `isTransfer` é lido mas **não é usado para bypass do lock**
4. Resultado: lock preso, cron retenta infinitamente, todas as tentativas rejeitadas

## Mudança (1 arquivo)

### `supabase/functions/sdr-robot-chat/index.ts`

**Passo 1** — Extrair `isRetry` do body (linha ~356):
```
const { conversationId, dealId, message, ..., isTransfer, isRetry } = body;
```

**Passo 2** — Bypass do lock quando `isRetry` ou `isTransfer` (antes do lock claim, linha ~522):
```
if (isRetry || isTransfer) {
  // Cron ou transferência: pular competição de lock, setar lock diretamente
  await supabase.from('conversations')
    .update({ robot_lock_until: immediateLockUntil })
    .eq('id', conversationId);
  console.log('[SDR-Robot-Chat] Lock bypass (isRetry/isTransfer)');
} else {
  // Lock atômico normal
  const { count } = await supabase...
  if (!count) return skipped;
}
```

**Passo 3** — Resetar o lock da conversa travada da Lilian Melo para que o próximo ciclo do cron a desbloqueie imediatamente.

## Resultado esperado
- Arthur responde imediatamente após retry do cron ou transferência
- O anti-duplicação continua funcionando para chamadas normais (webhook)
- Conversas travadas são recuperadas automaticamente

