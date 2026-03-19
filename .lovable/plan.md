

## Painel de detalhes do contato fechado por padrão

Mudança simples: alterar o estado inicial de `showContactDetails` de `true` para `false` em `src/pages/Conversations.tsx` (linha 16).

O botão de toggle que já existe continuará funcionando normalmente para abrir/fechar manualmente.

### Arquivo modificado
- `src/pages/Conversations.tsx` — linha 16: `useState(true)` → `useState(false)`

