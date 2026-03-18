

## Correção: Buscar nome e @username do Instagram nos contatos

### Problema
Todos os contatos do Instagram aparecem como "Instagram XXXXXX" (fallback) sem foto de perfil. A função `fetchIGProfile` não está retornando dados reais.

### Causa raiz (2 problemas)

1. **URL da API incorreta**: O código usa `graph.facebook.com` para buscar perfis de usuários do Instagram Messaging. A documentação oficial da Meta indica que para o Messenger Platform/Instagram, o endpoint correto é `graph.facebook.com` mas com os campos certos e o token de página. No entanto, o campo `username` não está sendo solicitado.

2. **Campo `username` não solicitado**: A chamada usa `fields=name,profile_pic` mas não inclui `username` (o @handle do Instagram).

### Correção

**Arquivo: `supabase/functions/ig-test/index.ts`**

1. Adicionar `username` aos campos solicitados na chamada da Graph API (linha 88):
```
fields=name,username,profile_pic
```

2. Retornar o `username` na resposta do `fetchIGProfile`:
```typescript
return { name: data.name, username: data.username, profilePic: data.profile_pic };
```

3. Usar o `username` como `@handle` no nome do contato e salvar no campo `notes` para exibição:
```typescript
const displayName = profile.name || (profile.username ? `@${profile.username}` : `Instagram ${senderId.slice(-6)}`);
// Salvar username no notes para exibição do @
const contactNotes = profile.username ? `ig_username:${profile.username}` : null;
```

4. Ao criar/atualizar contato, persistir o `username` no campo `notes`

5. No frontend (`phoneUtils.ts`), adicionar lógica para extrair e exibir o `@username` do Instagram a partir do campo `notes`

6. Atualizar contatos existentes sem nome: executar SQL para marcar contatos que precisam de re-fetch na próxima mensagem

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ig-test/index.ts` | Adicionar `username` nos fields da API, retornar e persistir username |
| `src/lib/phoneUtils.ts` | Extrair e exibir `@username` do Instagram |
| SQL migration | Resetar `name_edited` dos contatos Instagram com nome fallback para permitir re-fetch |

