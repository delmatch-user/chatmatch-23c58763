
Objetivo: fazer o preview da conversa realmente rolar até o fim, inclusive em conversas longas dentro do pipeline.

Diagnóstico
- O problema não parece ser falta de altura apenas; isso já foi aumentado para `90vh` no dialog e `60vh` no `ScrollArea`.
- O ponto mais provável é estrutural:
  1. `DialogContent` usa `grid`, o que costuma exigir `min-h-0` explícito nos blocos internos para permitir overflow real.
  2. O `ScrollAreaPrimitive.Viewport` não recebe `overflow-y-auto` explicitamente no wrapper customizado.
  3. O conteúdo das mensagens não reserva espaço lateral/inferior para a scrollbar, então pode parecer “travado” ou cortar o fim visual.
- No chat interno do sistema, o scroll funciona porque usa um container simples com `flex-1 overflow-y-auto`, sem a camada do Radix `ScrollArea`.

Mudanças
1. Ajustar o wrapper `src/components/ui/scroll-area.tsx`
- Adicionar overflow explícito no viewport:
```tsx
className="h-full w-full rounded-[inherit] overflow-y-auto overflow-x-hidden"
```
- Manter o `viewportRef` como está para o scroll programático até o fim.

2. Ajustar a estrutura do dialog em `src/components/queue/ConversationPreviewDialog.tsx`
- Garantir que o container principal permita contração correta:
  - `DialogContent`: manter `flex flex-col`, adicionar `overflow-hidden`
  - `DialogHeader`: adicionar `shrink-0`
  - Footer: adicionar `shrink-0`
  - `ScrollArea`: manter `flex-1 min-h-0`, remover dependência de `max-h` fixo se necessário
- Estrutura alvo:
```tsx
<DialogContent className="sm:max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
  <DialogHeader className="shrink-0 ..." />
  <ScrollArea className="flex-1 min-h-0" ...>
  <div className="shrink-0 ..." />
</DialogContent>
```

3. Melhorar a área interna das mensagens
- Adicionar `pr-3` ou `pr-4` no conteúdo do `ScrollArea` para não colar na scrollbar.
- Adicionar `pb-2`/`pb-4` para a última mensagem não ficar visualmente “cortada” junto ao rodapé.

4. Refinar o autoscroll
- Manter o `scrollToBottom`, mas disparar também quando `realMessages` mudar após carregamento:
```tsx
useEffect(() => {
  if (open && !isLoadingMessages) {
    requestAnimationFrame(() => scrollToBottom());
  }
}, [open, isLoadingMessages, realMessages, scrollToBottom]);
```
- Isso evita o caso em que o scroll roda antes do layout final do dialog.

Resultado esperado
- O preview abre ocupando a altura útil da tela.
- A lista de mensagens vira a única área rolável entre cabeçalho e rodapé.
- Dá para arrastar a scrollbar até o fim e visualizar toda a conversa sem trocar de tela.

Detalhes técnicos
- A correção principal é de layout/overflow, não de dados.
- Se após isso ainda houver travamento em casos específicos, o próximo fallback mais robusto é trocar só este preview de `ScrollArea` para um `div` simples com `flex-1 min-h-0 overflow-y-auto`, seguindo o padrão do `InternalChatPanel`.
