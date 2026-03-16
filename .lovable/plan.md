

## Corrigir envio Instagram e nome do contato

### Problema raiz
O Instagram e o WhatsApp estão em **Apps diferentes** na Meta. O `appsecret_proof` exige o App Secret do app correto, mas o codigo usa `META_WHATSAPP_APP_SECRET` (do WhatsApp) para o Instagram -- gerando um hash invalido.

Alem disso, a funcao `fetchIGProfile` no webhook tambem falha pelo mesmo motivo (precisa de `appsecret_proof` na URL), resultando em nomes genericos como "Instagram 172275" ao inves do nome real do usuario.

### Solucao

**1. Novo secret: `META_INSTAGRAM_APP_SECRET`**
- Solicitar ao usuario o App Secret do app Instagram (Meta Developer Dashboard → Settings → Basic)
- As edge functions usarao este secret com fallback para `META_WHATSAPP_APP_SECRET`

**2. Atualizar `instagram-send/index.ts`**
- Trocar `META_WHATSAPP_APP_SECRET` por `META_INSTAGRAM_APP_SECRET` (com fallback)
- Garantir que o `appsecret_proof` usa o secret correto

**3. Atualizar `ig-test/index.ts`**
- Trocar `META_WHATSAPP_APP_SECRET` por `META_INSTAGRAM_APP_SECRET` (com fallback) no envio de respostas do robo
- Adicionar `appsecret_proof` na chamada de `fetchIGProfile` (que tambem falha sem ele), para corrigir o nome do contato
- Criar helper local `generateAppSecretProof` para reutilizacao

**4. Atualizar `instagram-oauth/index.ts`**
- Trocar `META_WHATSAPP_APP_SECRET` por `META_INSTAGRAM_APP_SECRET` (com fallback) na troca de token

### Fluxo corrigido
```text
instagram-send / ig-test
  ├── Ler META_INSTAGRAM_APP_SECRET (novo)
  ├── Fallback: META_WHATSAPP_APP_SECRET (se mesmo app)
  └── Gerar appsecret_proof com o secret correto
       ├── Enviar mensagem via Graph API ✓
       └── Buscar perfil do usuario (nome + foto) ✓
```

### Arquivos alterados
- `supabase/functions/instagram-send/index.ts` -- trocar secret
- `supabase/functions/ig-test/index.ts` -- trocar secret + adicionar proof no fetchIGProfile
- `supabase/functions/instagram-oauth/index.ts` -- trocar secret

