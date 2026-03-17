

## Plano: Otimização Mobile/iOS + Notificações em Background + Pipeline Comercial

### 1. Otimizar carregamento de mensagens no mobile

**Problema**: O `fetchConversations` (AppContext linha 219-222) faz uma query de até 1000 mensagens só para pegar previews. No mobile com conexão lenta, isso trava o boot.

**Correção** em `src/contexts/AppContext.tsx`:
- Remover a query `supabase.from('messages')` do `Promise.all` no `fetchConversations`
- Usar exclusivamente `conv.last_message_preview` (que já existe na tabela `conversations`) para construir o preview sintético
- As mensagens completas continuam sendo lazy-loaded ao selecionar uma conversa — nenhuma mensagem é removida

### 2. Corrigir Service Worker para notificações em background

**Problema**: O `main.tsx` (linhas 5-14) está **desregistrando todos os service workers e limpando caches** no boot. Isso mata a capacidade de receber notificações com o app fechado no iOS/Android PWA.

**Correção** em `src/main.tsx`:
- Remover o bloco que desregistra service workers e limpa caches
- O VitePWA com `registerType: "autoUpdate"` já gerencia atualizações automaticamente

### 3. Notificações nativas com app fechado (iOS 16.4+ PWA)

O sistema já usa `ServiceWorkerRegistration.showNotification()` em `src/lib/notifications.ts`, que é o método correto para background. O problema era apenas o service worker sendo desregistrado no boot (item 2 acima).

Além disso, no `vite.config.ts` o PWA já está configurado corretamente com `registerType: "autoUpdate"`. Após remover o desregistro forçado, as notificações via SW voltarão a funcionar em background.

### 4. Corrigir acesso ao Pipeline Comercial (SDRRoute)

**Problema**: O `SDRRoute` verifica `useApp().user` que carrega assincronamente. Quando `isLoading` do auth é `false` mas o `user` do AppContext ainda é `null`, redireciona para `/fila` antes de avaliar permissões.

**Correção** em `src/components/sdr/SDRRoute.tsx`:
- Importar `loading` do `useApp()`
- Adicionar guard: se `loading` é true ou `user` é null (mas auth está autenticado), mostrar spinner

### Resumo de arquivos

| Arquivo | Mudança |
|---|---|
| `src/contexts/AppContext.tsx` | Remover query de mensagens do boot; usar `last_message_preview` direto |
| `src/main.tsx` | Remover desregistro forçado de service workers |
| `src/components/sdr/SDRRoute.tsx` | Aguardar AppContext carregar antes de decidir acesso |

