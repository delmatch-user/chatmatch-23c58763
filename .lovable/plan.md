

## Injetar resumo de triagem na transferência robot-to-robot

### Problema
Quando Delma transfere para Júlia ou Sebastião via `transfer_to_robot`, o campo `reason` pode conter apenas uma frase genérica. Os robôs especialistas precisam de um resumo detalhado da conversa/triagem para dar continuidade sem desviar o assunto.

### Análise
O mecanismo já funciona parcialmente:
- O `transfer_to_robot` salva `args.reason` no `transfer_logs`
- O robô receptor busca o último `transfer_logs` e injeta o `reason` como contexto de prioridade máxima no prompt

O problema está em **dois pontos**:
1. A instrução no prompt do robô triador não exige que o `reason` contenha um resumo completo da conversa
2. A descrição do parâmetro `reason` na tool definition é vaga ("Motivo da transferência e contexto para o agente destino")

### Correção

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Melhorar instrução no prompt** (linha ~151): Adicionar instrução explícita de que ao usar `transfer_to_robot`, o campo `reason` DEVE conter um resumo completo da conversa até o momento, incluindo: o que o cliente quer, informações já coletadas, e qual a necessidade específica.

2. **Melhorar descrição do parâmetro `reason`** na tool definition (linha ~258): Tornar a descrição mais prescritiva, exigindo resumo da triagem.

Mudanças mínimas e cirúrgicas — sem alterar fluxo, apenas reforçar as instruções para que a IA gere um `reason` mais completo.

