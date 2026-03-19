

## Impedir Delma de reassumir conversas de Júlia/Sebastião

### Causa raiz

Quando Delma transfere para Júlia via `transfer_to_robot`, o código de Delma continua executando após a transferência e **limpa o `robot_lock_until`** (linha 1538 do robot-chat). Isso cria uma janela onde:

1. O lock que Júlia definiu é sobrescrito
2. `sync-robot-schedules` pode re-disparar robot-chat prematuramente
3. Se o robot-chat de Júlia falhar no retry, a conversa pode voltar para `em_fila` e Delma reassume

### Correções

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Pular cleanup pós-transferência**: Quando uma ação de transferência (`transfer_to_robot`, `transfer_to_department`, `transfer_to_human`) foi executada, NÃO executar o bloco final que atualiza `robot_lock_until = null` e `last_message_preview`. Adicionar flag `skipPostProcessing = true` nesses handlers e usar no bloco final.

2. **Proteger contra race condition**: Na cleanup final (linhas 1532-1540), adicionar condição `if (!skipPostProcessing)` para que o robô originador não interfira no estado definido pelo robô destino.

**Arquivo: `supabase/functions/sync-robot-schedules/index.ts`**

3. **Ignorar conversas com transferência recente no segundo pass**: Antes de retry de "conversa travada", verificar `transfer_logs` para ver se houve transferência nos últimos 3 minutos. Se sim, pular — o robô destino pode estar processando a resposta.

### Impacto
- Júlia e Sebastião não terão seus locks limpos por Delma após transferência
- sync-robot-schedules dará mais tempo para especialistas processarem após transferência
- Sem impacto no fluxo normal de atendimento

