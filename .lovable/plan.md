

# Melhorar scroll do preview de conversa no lead

## Problema
O `ScrollArea` tem `max-h-[45vh]` e o `DialogContent` tem `max-h-[80vh]`, o que pode estar limitando a área visível das mensagens. O scroll existe mas a área é pequena demais para conversas longas.

## Mudança

**`src/components/queue/ConversationPreviewDialog.tsx`**:
- Aumentar `max-h` do `DialogContent` de `80vh` para `90vh`
- Aumentar `max-h` do `ScrollArea` de `45vh` para `60vh`
- Adicionar `overflow-y-auto` explícito no viewport para garantir scroll funcional

Linha 284:
```tsx
// De:
<DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
// Para:
<DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
```

Linha 355:
```tsx
// De:
<ScrollArea className="flex-1 min-h-0 max-h-[45vh]" viewportRef={scrollViewportRef}>
// Para:
<ScrollArea className="flex-1 min-h-0 max-h-[60vh]" viewportRef={scrollViewportRef}>
```

Isso dá mais espaço vertical para as mensagens e garante que o scroll funcione adequadamente para conversas longas.

