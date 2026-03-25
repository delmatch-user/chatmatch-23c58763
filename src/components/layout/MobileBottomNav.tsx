import { Inbox, MessageSquare, MessagesSquare, History } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/fila', icon: Inbox, label: 'Fila', badgeKey: 'queue' as const },
  { to: '/conversas', icon: MessageSquare, label: 'Conversas', badgeKey: 'conversations' as const },
  { to: '/interno', icon: MessagesSquare, label: 'Interno', badgeKey: 'internal' as const },
  { to: '/historico', icon: History, label: 'Histórico', badgeKey: null },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { conversations, departments } = useApp();
  const { unreadCount } = useUnreadMessages();

  const queueCount = departments.reduce((acc, dept) => acc + dept.queueCount, 0);
  const activeCount = conversations.filter(c => c.status !== 'finalizada' && c.status !== 'em_fila').length;

  const getBadge = (key: string | null) => {
    if (!key) return 0;
    switch (key) {
      case 'queue': return queueCount;
      case 'conversations': return activeCount;
      case 'internal': return unreadCount.internalChat;
      default: return 0;
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ to, icon: Icon, label, badgeKey }) => {
          const isActive = location.pathname === to;
          const badge = getBadge(badgeKey);

          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
