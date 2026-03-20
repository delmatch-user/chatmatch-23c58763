

## Corrigir Delma assumindo conversas de outros robôs IA

### Problema identificado

Quando um robô especialista (Júlia, Sebastião) usa a ferramenta `transfer_to_department` para transferir uma conversa de volta ao departamento de Suporte, o código busca **qualquer robô ativo** naquele departamento (linha 1271-1281 de `robot-chat/index.ts`). Como Delma é o robô de triagem ativo no Suporte, ela é selecionada automaticamente como `targetRobot` — mesmo que a intenção fosse transferir para um humano ou outro robô específico.

Esse bloco de código **ignora** a restrição `transferToAgentIds` configurada no painel administrativo, que deveria limitar para quais robôs a transferência é permitida.

Além disso, `transfer_to_department` não filtra por `auto_assign`, então Delma (com `auto_assign: true`) é sempre a primeira escolhida.

### Solução

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. **Aplicar filtro `transferToAgentIds` no `transfer_to_department`**: Quando o robô tem restrições de transferência configuradas (`transferToAgentsMode === 'select'`), o `targetRobot` encontrado pelo `transfer_to_department` deve respeitar essa lista. Se Delma não estiver na lista, a conversa vai para a fila sem robô.

2. **Respeitar `auto_assign` no `transfer_to_department`**: Só selecionar como `targetRobot` robôs que tenham `auto_assign: true`, evitando atribuir robôs especialistas que só devem receber transferências diretas.

3. **Usar a lista `availableRobotsForTransfer` já filtrada** ao invés de fazer uma query separada, garantindo consistência com as mesmas regras do `transfer_to_robot`.

```text
Antes:
  transfer_to_department → query TODOS os robôs ativos → pega Delma

Depois:
  transfer_to_department → usa availableRobotsForTransfer (já filtrada)
                         → filtra por dept destino + canal
                         → se nenhum robô permitido, vai pra fila
```

### Impacto
- Delma só assumirá conversas transferidas por departamento se estiver na lista de robôs permitidos do robô que transfere
- Robôs especialistas poderão transferir para departamentos sem que Delma recapture automaticamente
- A flag `robot_transferred` será corretamente setada quando não houver robô destino permitido

