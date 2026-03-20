

## Acelerar resposta da Delma na triagem

### Problema identificado

A Delma demora para responder porque o código aplica delays excessivos:

1. **Delay inicial de 3s** (linha 733) — aceitável, serve para evitar duplicação
2. **Agrupamento de mensagens: 40s** (padrão `groupMessagesTime`) — muito lento para triagem
3. **Delay fixo de 30s** quando agrupamento está desativado (linha 984) — desnecessário para triage

Resultado: mesmo quando o cliente já mandou o assunto, Delma espera 40s antes de ler e responder.

### Correções

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Reduzir delay padrão sem agrupamento**: Trocar o fallback de 30s para 5s (linha 984). Quando `groupMessages` está desativado, não faz sentido esperar 30s.

2. **Modo triagem inteligente**: Quando `groupMessages` está ativado, verificar se a primeira mensagem do cliente já contém conteúdo substantivo (mais de 15 caracteres ou mais de 2 palavras). Se sim, reduzir o tempo de agrupamento pela metade (ex: 40s → 20s), pois o cliente provavelmente já relatou o assunto. Se a mensagem é curta (tipo "oi", "olá"), manter o delay normal para aguardar o assunto completo.

3. **Reduzir delay de transferência**: O delay de 30s para transferências é importante para feedback visual, mas pode ser reduzido para 15s para agilizar a resposta do especialista.

### Mudança no código (linha ~984)

```text
ANTES:
  effectiveDelay = isFromTransfer ? max(30, groupTime) : (groupMessages ? groupTime : 30)

DEPOIS:
  Se isFromTransfer → 15s (ou groupTime, o que for maior)
  Se groupMessages:
    - última msg do cliente > 15 chars → groupTime / 2 (mínimo 10s)
    - última msg curta → groupTime normal
  Se !groupMessages → 5s
```

### Impacto
- Delma responde em ~8s quando o cliente já disse o assunto (ao invés de 43s)
- Delma responde em ~43s quando o cliente manda só "oi" (mantém agrupamento para esperar o assunto)
- Especialistas (Júlia/Sebastião) respondem em ~18s após transferência (ao invés de 33s)
- Nenhuma mudança nas instruções do robô — a lógica de triagem já está no prompt

