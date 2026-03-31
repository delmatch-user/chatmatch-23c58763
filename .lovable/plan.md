

# Melhorar recebimento e exibição de documentos via WhatsApp

## Situação atual
O backend (Baileys server + webhook) **já suporta** todos os tipos de arquivo (xlsx, pdf, doc, txt, etc.) — faz download, upload para Storage e salva na mensagem. O que precisa melhorar:

1. **Preview na lista de conversas**: quando o Baileys faz upload direto (caminho principal), o preview mostra o conteúdo bruto em vez de "📎 Documento", porque a condição só verifica `mediaBase64` e ignora `mediaUrl`.
2. **Download de documentos**: o link do documento abre em nova aba (`target="_blank"`) sem atributo `download`, o que não funciona bem para .xlsx/.doc.
3. **Ícones por tipo de arquivo**: todos os documentos mostram o mesmo ícone genérico `FileText`.

## Mudanças

### 1. `supabase/functions/whatsapp-webhook/index.ts` — Corrigir preview para mediaUrl
Linha ~1594: expandir a condição do preview para cobrir `mediaUrl` além de `mediaBase64`:
```typescript
if (mediaBase64 || mediaUrl) {
  if (mimeType?.startsWith('image/')) messagePreview = '📷 Imagem';
  else if (mimeType?.startsWith('audio/')) messagePreview = '🎵 Áudio';
  else if (mimeType?.startsWith('video/')) messagePreview = '🎬 Vídeo';
  else messagePreview = `📎 ${fileName || 'Documento'}`;
}
```

### 2. `src/components/chat/MessageAttachment.tsx` — Adicionar download + ícones por tipo
- Adicionar atributo `download` no link de documentos para forçar download direto.
- Adicionar ícones específicos por extensão (xlsx → tabela, pdf → FileText, etc.).
- Importar `Download` e `Table` do lucide-react.

```tsx
// Ícone por extensão
const getDocIcon = (name: string) => {
  const ext = name?.split('.').pop()?.toLowerCase();
  if (['xlsx','xls','csv'].includes(ext)) return <Table />;
  if (['pdf'].includes(ext)) return <FileText />;
  return <FileText />;
};

// No link do documento:
<a href={url} download={attachment.name} ...>
```

### 3. Redeployar a Edge Function `whatsapp-webhook`
Para que o fix de preview entre em vigor.

## Resultado
- Documentos xlsx, pdf, doc, txt recebidos via WhatsApp aparecem com preview correto na lista de conversas
- Clicando no arquivo no chat, faz download direto com o nome original
- Ícones diferenciados por tipo de arquivo

