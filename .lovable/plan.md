

## Plano: Mostrar nome do atendente ao buscar número já em atendimento

### Problema
Quando um atendente busca um número que já está em atendimento com outro agente, aparece apenas "Conversa ativa encontrada" — sem informar quem está atendendo. O usuário quer ver: **"Essa conversa está com o Fabio"**.

### Alteração

**Arquivo: `src/components/chat/ConversationList.tsx`** (linhas 317-356)

Na verificação de conversa ativa existente:

1. Alterar o `select` de `'id'` para `'id, assigned_to'`
2. Após encontrar `activeConv`, verificar `assigned_to`:
   - Se `assigned_to === user.id` → `toast.info("Você já possui uma conversa ativa com este contato")` e abrir a conversa normalmente
   - Se `assigned_to` é outro usuário → buscar nome em `profiles` → `toast.warning("Essa conversa está com o Fabio")` e **não abrir/selecionar** a conversa
   - Se `assigned_to` é `null` (em fila) → `toast.info("Este contato já está na fila de atendimento")` e abrir normalmente

Isso é uma mudança de ~15 linhas no bloco `if (activeConv)`, sem criar tabelas nem alterar outros arquivos.

