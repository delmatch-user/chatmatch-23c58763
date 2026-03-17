/**
 * Native Web Notifications API utility
 * Supports: Desktop browsers, Android PWA, iOS 16.4+ PWA (standalone mode)
 */

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches 
    || (window.navigator as any).standalone === true;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    console.log('[Notifications] API not supported');
    return 'unsupported';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    console.log('[Notifications] Permission result:', result);
    return result;
  } catch (error) {
    console.error('[Notifications] Permission request failed:', error);
    return 'denied';
  }
}

interface NativeNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  renotify?: boolean;
  silent?: boolean;
  data?: any;
}

export async function sendNativeNotification(
  title: string, 
  options: NativeNotificationOptions = {}
): Promise<boolean> {
  // Check user preference
  const notificationsEnabled = localStorage.getItem('queue_notifications_enabled') !== 'false';
  if (!notificationsEnabled) return false;

  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const notifOptions: NotificationOptions & { renotify?: boolean } = {
    body: options.body || '',
    icon: options.icon || '/pwa-192x192.png',
    badge: options.badge || '/pwa-192x192.png',
    tag: options.tag || 'match-conversa',
    renotify: options.renotify ?? true,
    silent: options.silent ?? false,
    data: options.data || {},
  };

  try {
    // Prefer ServiceWorker registration for background/iOS PWA support
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, notifOptions);
      console.log('[Notifications] Sent via ServiceWorker');
      return true;
    }

    // Fallback: direct Notification constructor (foreground only)
    const notification = new Notification(title, notifOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    console.log('[Notifications] Sent via Notification constructor');
    return true;
  } catch (error) {
    console.error('[Notifications] Failed to send:', error);
    return false;
  }
}

/**
 * Returns a user-friendly message about notification support status
 */
export function getNotificationStatusMessage(): string {
  if (!isNotificationSupported()) {
    if (isIOSDevice() && !isStandaloneMode()) {
      return 'Para receber notificações no iPhone/iPad, instale o app na tela inicial primeiro.';
    }
    return 'Seu navegador não suporta notificações nativas.';
  }

  const permission = Notification.permission;
  if (permission === 'denied') {
    return 'Notificações foram bloqueadas. Acesse as configurações do navegador para permitir.';
  }
  if (permission === 'granted') {
    return 'Notificações ativadas!';
  }
  return 'Clique para permitir notificações.';
}
