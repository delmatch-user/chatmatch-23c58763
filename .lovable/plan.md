

# Finalizar 119 conversas do Suporte como Delma (erro)

## Situação atual
Existem **119 conversas** ativas no departamento de Suporte (em_fila, em_atendimento, pendente) que precisam ser finalizadas imediatamente como robô Delma, indicando que ocorreu um erro.

## Solução
Criar uma **edge function temporária** `bulk-finalize` que será executada uma única vez para:

1. Buscar todas as 119 conversas do Suporte (status em_fila/em_atendimento/pendente)
2. Para cada conversa:
   - Buscar mensagens existentes
   - Salvar log no `conversation_logs` com `finalized_by_name: "Delma [ERRO]"` e robot ID `e0886607-cf54-4687-a440-4fa334085606`
   - Deletar mensagens da conversa
   - Deletar a conversa
3. **Não enviar protocolo/mensagem** ao cliente (muitas passaram de 24h e dariam erro Meta)

## Arquivo

| Arquivo | Ação |
|---------|------|
| `supabase/functions/bulk-finalize/index.ts` | Criar edge function para finalização em massa |

## Após execução
Invocar a função uma vez via `supabase.functions.invoke('bulk-finalize')` e depois remover o arquivo.

