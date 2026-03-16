

## Melhorias no Instagram Webhook: Nome do usuário, mídias e emojis

### Problemas atuais

1. **Nome do contato**: Quando um novo contato envia mensagem pelo Instagram, o sistema salva como `Instagram XXXXXX` (últimos 6 dígitos do ID). A API do Instagram Graph permite buscar o nome real via `GET /{user_id}?fields=name,profile_pic`.

2. **Fotos/Vídeos**: O webhook recebe attachments com URLs temporárias da Meta, mas o código atual apenas salva a URL raw como `content`. Essas URLs expiram. Precisa fazer download e upload para o Storage (`chat-uploads`), igual ao WhatsApp webhook.

3. **Emojis**: Emojis em texto já funcionam (são UTF-8 puro). O que falta é tratar **reações** (emoji reactions) que vêm como um evento separado no payload do Instagram.

### Correções no `ig-test/index.ts`

**1. Buscar nome real do Instagram via Graph API**
- Após receber `senderId`, chamar `GET https://graph.facebook.com/v18.0/{senderId}?fields=name,profile_pic&access_token={token}`
- Usar o nome retornado ao criar o contato (em vez de `Instagram XXXXXX`)
- Atualizar o nome do contato existente se ainda tiver o nome genérico e `name_edited` for `false`
- Salvar `profile_pic` como `avatar_url` no contato

**2. Download e persistência de mídias**
- Quando `message.attachments` estiver presente, fazer download da URL da mídia
- Upload para o bucket `chat-uploads` no Storage
- Salvar como JSON array no `content` (mesmo formato do WhatsApp): `[{"name":"...", "url":"public_url", "type":"image/jpeg", "size":...}]`
- Mapear `att.type` corretamente: `image` → `image`, `video` → `video`, `audio` → `audio`, `share`/`story_mention` → `file`

**3. Preview de mídia na lista de conversas**
- Atualizar `last_message_preview` com labels amigáveis: `📷 Imagem`, `🎬 Vídeo`, `🎤 Áudio` (mesmo padrão do WhatsApp)

### Detalhes técnicos

```text
Fluxo de mídia:
  Webhook recebe attachment
    → Download da URL da Meta (com access_token)
    → Upload para chat-uploads bucket
    → Gerar publicUrl
    → Salvar content como JSON [{name, url, type, size}]
    → message_type = tipo da mídia
```

Nenhuma alteração de banco de dados é necessária — os campos `avatar_url`, `name`, `name_edited` já existem na tabela `contacts`.

**Arquivo alterado:** `supabase/functions/ig-test/index.ts`

