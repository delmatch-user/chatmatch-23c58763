

# Tornar o Dialog de Avisos do Suporte Responsivo com Scroll

## Problema
Mensagens longas no alerta do canal Suporte podem ultrapassar a altura da tela (especialmente mobile 393x587), escondendo o botão "Entendi" e impedindo a confirmação.

## Solução
No componente `AnnouncementDialog` dentro de `ChannelAnnouncementOverlay.tsx`:

1. Envolver o conteúdo da mensagem em um `ScrollArea` com `max-h` responsivo (`max-h-[40vh] sm:max-h-[50vh]`)
2. Garantir que o `DialogContent` tenha `max-h-[85vh] flex flex-col` para não ultrapassar a tela
3. O `DialogFooter` com o botão "Entendi" fica fixo embaixo, sempre visível

### Arquivo: `src/components/chat/ChannelAnnouncementOverlay.tsx`

- Importar `ScrollArea` de `@/components/ui/scroll-area`
- No `DialogContent`: adicionar `max-h-[85vh] flex flex-col`
- Envolver o bloco da mensagem (div com avatar + conteúdo) em `ScrollArea` com `max-h-[40vh] sm:max-h-[50vh]` e `overflow-y-auto`
- `DialogFooter` permanece fora do scroll, sempre acessível

