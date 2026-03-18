

## Visualizar Story Mentions do Instagram no Chat

### Problema
Quando alguém menciona sua conta no Story do Instagram, o webhook da Meta envia um evento com `attachments[].type = "story_mention"` e a URL CDN do story. Atualmente, o `mapAttachmentType` no `ig-test` não reconhece `story_mention`, tratando-o como arquivo genérico. A URL do story (CDN temporária) não é persistida corretamente e não há indicação visual de que se trata de uma menção em story.

### Solução

**1. Backend: `supabase/functions/ig-test/index.ts`**

Adicionar `story_mention` ao `mapAttachmentType`:
```typescript
case 'story_mention': return { mimePrefix: 'image/jpeg', messageType: 'story_mention', label: '📸 Menção no Story' };
```

Na lógica de processamento de attachments (linhas 383-406), tratar `story_mention` especificamente:
- Baixar e persistir a mídia CDN no storage (já acontece via `persistMedia`)
- Marcar o `messageType` como `story_mention` para o frontend saber renderizar diferente
- Incluir flag `isStoryMention: true` no JSON do attachment

**2. Frontend: `src/components/chat/MessageAttachment.tsx`**

Adicionar renderização especial para story mentions:
- Detectar `isStoryMention` no attachment ou `story_mention` no type
- Renderizar com um badge/label "📸 Menção no Story" sobre a imagem/vídeo
- Usar o mesmo `ImagePreview` para imagens de story, com um wrapper visual distinto (borda gradiente estilo Instagram)

**3. Frontend: `src/components/chat/ChatPanel.tsx`**

Garantir que `message_type === 'story_mention'` seja tratado como mídia (attachment) na renderização de mensagens, parseando o JSON do content normalmente.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/ig-test/index.ts` | Adicionar `story_mention` ao map de tipos e persistir mídia do story |
| `src/components/chat/MessageAttachment.tsx` | Renderização visual especial para story mentions |
| `src/components/chat/ChatPanel.tsx` | Tratar `story_mention` como tipo de mídia na renderização |

### Nota sobre URLs de Story
As URLs de story CDN da Meta são temporárias (expiram em ~24h). O sistema já faz download e upload para o storage próprio via `persistMedia`, então a visualização continuará funcionando após a expiração da URL original.

