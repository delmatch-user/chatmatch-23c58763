

## Colar imagens (Ctrl+V) no chat interno

### Diagnóstico

| Arquivo | onPaste | Status |
|---------|---------|--------|
| `ChatPanel.tsx` | ✅ Já tem | OK |
| `InternalChatPanel.tsx` | ✅ Já tem | OK |
| `InternalChat.tsx` (página `/interno`) | ❌ Faltando | **Precisa adicionar** |

O único arquivo sem suporte a `Ctrl+V` para colar imagens é `src/pages/InternalChat.tsx`. Ele já possui `useFileUpload`, `uploadFile`, `setPendingFiles` e `user` — só falta adicionar o handler `onPaste` no `<Textarea>` (linha 776-784).

### Alteração

**`src/pages/InternalChat.tsx`** — Adicionar `onPaste` ao `<Textarea>` na linha ~781:

```tsx
<Textarea
  value={message}
  onChange={handleMessageChange}
  placeholder="Digite / para mensagens rápidas..."
  className="flex-1 input-search min-h-[40px] max-h-[120px] resize-none overflow-y-auto py-2"
  onKeyDown={handleKeyDown}
  onPaste={async (e) => {
    const items = e.clipboardData?.items;
    if (!items || !user) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const namedFile = new File([file], `screenshot-${Date.now()}.png`, { type: file.type });
          const uploaded = await uploadFile(namedFile, user.id);
          if (uploaded) setPendingFiles(prev => [...prev, uploaded]);
        }
      }
    }
  }}
  disabled={uploading}
  rows={1}
/>
```

Apenas 1 arquivo editado, padrão idêntico ao que já existe em `ChatPanel.tsx` e `InternalChatPanel.tsx`.

