

## Diagnóstico

O sistema **não usa a Web Notifications API** em nenhum lugar. Todas as "notificações" atuais são:
1. **Toasts in-app** (sonner) -- só aparecem com o app visível em foreground
2. **AudioContext / oscillator** -- não toca em background nem no iOS
3. **`new Audio()` com base64** -- bloqueado no iOS sem interação do usuário

Isso significa: **nenhuma notificação aparece quando o app está minimizado, em background, ou na tela bloqueada** -- nem no navegador desktop, nem no mobile, nem na PWA iOS.

## Plano de Correção

### 1. Criar utilitário de notificações nativas (`src/lib/notifications.ts`)

- `requestNotificationPermission()`: solicita permissão via `Notification.requestPermission()`
- `sendNativeNotification(title, body, options?)`: envia notificação usando `ServiceWorkerRegistration.showNotification()` (funciona em background) com fallback para `new Notification()` quando SW não disponível
- Detectar suporte: `'Notification' in window`
- Badge e ícone: usar `/pwa-192x192.png`
- `onClick`: focar/abrir a janela do app

### 2. Atualizar `useQueueNotifications.tsx`

- Ao detectar nova conversa na fila: chamar `sendNativeNotification()` além do toast e som
- Título: "Nova conversa na fila!"
- Body: nome do contato ou quantidade

### 3. Atualizar `AppContext.tsx` -- canal de mensagens realtime

- Quando chegar mensagem de cliente (não do próprio usuário): disparar `sendNativeNotification()` com "Nova mensagem de {contato}"
- Respeitar a flag `notificationsEnabled` do localStorage

### 4. Solicitar permissão de notificação no login/primeiro uso

- No `Topbar.tsx` ou `Sidebar.tsx`: ao ativar notificações (toggle), chamar `requestNotificationPermission()`
- Mostrar toast de instrução se permissão negada

### 5. Ajustar PWA config (`vite.config.ts`)

- Adicionar `navigateFallbackDenylist: [/^\/~oauth/]` no workbox (requisito de segurança)
- O service worker gerado pelo vite-plugin-pwa já suporta `showNotification` sem customização adicional

### 6. Compatibilidade iOS

- iOS 16.4+ suporta Web Notifications apenas em PWAs instaladas na home screen
- Detectar se está em standalone mode + iOS para mostrar instrução contextual ("Instale o app para receber notificações")
- Usar `ServiceWorkerRegistration.showNotification()` que é o método suportado no iOS PWA

---

**Arquivos a editar:**
- `src/lib/notifications.ts` (novo)
- `src/hooks/useQueueNotifications.tsx`
- `src/contexts/AppContext.tsx` (trecho do canal messages realtime)
- `src/components/layout/Topbar.tsx` (solicitar permissão no toggle)
- `src/components/layout/Sidebar.tsx` (solicitar permissão no toggle)
- `vite.config.ts` (navigateFallbackDenylist)

