

# Melhorar mensagem de erro ao iniciar conversa com contato já ativo

## Problema
Quando um atendente tenta iniciar conversa com um numero que ja tem conversa ativa (com outro atendente), o sistema as vezes cai no erro generico do banco de dados (`duplicate key value violates unique constraint "conversations_unique_active_contact"`) em vez de mostrar quem esta com a conversa.

Isso acontece porque a verificacao previa (linhas 318-324) pode falhar em condicoes de corrida — entre o check e o insert, outro webhook pode ter criado a conversa.

## Solucao
No bloco `catch` da funcao `createConversation`, detectar o erro de unique constraint e buscar quem esta com a conversa ativa, exibindo uma mensagem amigavel.

## Mudanca

### `src/components/chat/ConversationList.tsx`
No `catch` (linha 404-410):
- Verificar se `error?.code === '23505'` ou `error?.message` contem `conversations_unique_active_contact`
- Se sim, buscar a conversa ativa do contato com `assigned_to` e o nome do agente via `profiles`
- Exibir toast amigavel: "Este contato ja esta em atendimento com [Nome]" ou "Este contato ja esta na fila"
- Se o atendente for o proprio usuario, abrir a conversa diretamente
- Caso contrario, manter o toast generico atual

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `src/components/chat/ConversationList.tsx` | Tratar unique constraint no catch com mensagem amigavel mostrando nome do agente |

