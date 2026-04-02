
## Corrigir duplicação de mensagens em todos os robôs

### Objetivo
Garantir que nenhum robô envie a mesma resposta duas vezes, tanto no Machine quanto no WhatsApp, com um delay seguro e consistente.

### Diagnóstico
Hoje a duplicação não depende só do “delay”. O problema está na combinação de:
- múltiplos gatilhos para a mesma conversa (`webhook-machine`, `whatsapp-webhook`, `sync-robot-schedules`);
- lock de concorrência inconsistente entre quem dispara e quem responde;
- proteção de saída incompleta: `robot-chat` já tem dedupe de resposta, mas `sdr-robot-chat` ainda não;
- no WhatsApp, ainda falta uma trava equivalente antes de disparar o robô.

Ou seja: aumentar o delay sozinho não resolve. Precisa unificar lock + delay + dedupe de saída.

### O que vou implementar
1. **Centralizar a proteção anti-duplicação nos robôs**
   - Ajustar `robot-chat` e `sdr-robot-chat` para usar uma tomada de lock realmente atômica antes de processar.
   - Se outro processo já estiver atendendo a mesma conversa, a nova execução será abortada sem responder.

2. **Padronizar um delay mínimo seguro**
   - Manter o `groupMessagesTime` configurado por robô.
   - Aplicar um piso mínimo de delay/lock para evitar que o lock expire antes do envio terminar.
   - Transferências continuam com delay menor, mas ainda protegido.

3. **Aplicar dedupe de saída em todos os robôs**
   - Replicar no `sdr-robot-chat` a mesma proteção que já existe no `robot-chat`.
   - Antes de salvar/enviar, verificar se conteúdo idêntico já foi enviado há poucos segundos naquela conversa.
   - Se já foi, abortar envio e limpar lock.

4. **Corrigir os disparadores**
   - Revisar `webhook-machine`, `whatsapp-webhook` e `sync-robot-schedules` para não competirem entre si.
   - Eles devem respeitar lock ativo e evitar re-disparar o mesmo robô para a mesma conversa.

5. **Fechar a lacuna do WhatsApp**
   - Adicionar no fluxo do `whatsapp-webhook` a mesma proteção de concorrência já pensada para Machine.
   - Isso cobre os casos em que a mensagem chega uma vez, mas o robô é acionado mais de uma vez.

### Arquivos envolvidos
- `supabase/functions/robot-chat/index.ts`
- `supabase/functions/sdr-robot-chat/index.ts`
- `supabase/functions/webhook-machine/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/sync-robot-schedules/index.ts`

### Detalhes técnicos
- Vou usar o campo existente `robot_lock_until`, sem criar nova estrutura.
- A correção principal será:
  - **claim atômico do lock** no início do processamento;
  - **delay alinhado com o lock**;
  - **dedupe de saída** imediatamente antes do insert/envio;
  - **respeito ao lock** em todos os pontos que chamam `robot-chat` e `sdr-robot-chat`.
- Também vou garantir que o fluxo SDR siga exatamente a mesma regra anti-duplicação do robô normal, para não existir “robô protegido” e “robô sem proteção”.

### Resultado esperado
Depois disso:
- Delma, Júlia, Sebastião, Arthur e demais robôs não respondem duas vezes à mesma mensagem;
- Machine e WhatsApp passam a ter o mesmo padrão de proteção;
- cron, webhook e retries deixam de disputar a mesma conversa;
- o delay continua adequado para agrupamento, mas sem abrir brecha para envio duplicado.

### Validação
Vou validar estes cenários na implementação:
1. mesma mensagem chegando duas vezes no Machine;
2. mesma conversa recebendo webhook + retry;
3. mensagem no WhatsApp com disparo repetido do robô;
4. conversa SDR com resposta única;
5. transferência entre robôs sem duplicação;
6. conversa normal ainda respondendo no tempo esperado.
