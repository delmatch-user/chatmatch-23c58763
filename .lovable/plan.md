

## Adicionar campo Access Token na integração Instagram

### Problema
O formulário de integração do Instagram não possui um campo para inserir/atualizar o Access Token manualmente. Quando o token expira (como o erro 401 relatado), o usuário não tem como atualizá-lo sem refazer todo o fluxo OAuth pelo Facebook.

### Solução
Adicionar um campo `accessToken` ao estado `instagramCredentials` e ao formulário do Instagram, similar ao que já existe na aba API do WhatsApp. Incluir também a lógica de persistência condicional (só salvar se preenchido, para não sobrescrever o existente).

### Alterações em `src/pages/admin/AdminIntegrations.tsx`

1. **Estado**: Adicionar `accessToken: ''` ao `instagramCredentials` inicial (linha 69)
2. **Carregamento do DB**: Carregar `igConn.access_token` no estado (linha 126), sem sobrescrever valor digitado
3. **Salvar conexão**: Incluir `access_token` no `connectionData` do `handleConnectInstagram` apenas se preenchido (linha 442)
4. **UI**: Adicionar campo Input com toggle show/hide para o Access Token no formulário Instagram, posicionado após o campo Nome/Departamento e antes do botão "Conectar com Facebook"

