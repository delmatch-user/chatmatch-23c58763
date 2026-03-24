import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  ChevronDown,
  MessageSquare, 
  Users, 
  Inbox, 
  History, 
  Zap, 
  Settings, 
  LayoutDashboard,
  Building2,
  Shield,
  Smartphone,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Download,
  Check,
  Share,
  Trophy,
  Plus,
  Bot,
  BarChart3,
  HardDrive,
  Sparkles,
  Trash2,
  Calendar,
  ContactRound,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { requestNotificationPermission, getNotificationStatusMessage } from '@/lib/notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
  isSettings?: boolean;
  children?: NavItem[];
}

const getNavItems = (queueCount: number, activeConversationsCount: number, internalUnreadCount: number, showRanking: boolean, isSDR: boolean): NavItem[] => {
  const items: NavItem[] = [
    { icon: Inbox, label: 'Fila', path: '/fila', badge: queueCount > 0 ? queueCount : undefined },
    { icon: MessageSquare, label: 'Conversas', path: '/conversas', badge: activeConversationsCount > 0 ? activeConversationsCount : undefined },
    { icon: Users, label: 'Interno', path: '/interno', badge: internalUnreadCount > 0 ? internalUnreadCount : undefined },
    { icon: Zap, label: 'Mensagens Rápidas', path: '/mensagens-rapidas' },
  ];

  items.push({ icon: ContactRound, label: 'Contatos', path: '/contatos' });

  if (showRanking) {
    items.push({ icon: Shield, label: 'Suporte', path: '/historico', children: [
      { icon: History, label: 'Histórico', path: '/historico' },
      { icon: Trophy, label: 'Ranking', path: '/ranking' },
      { icon: Bot, label: 'Logs IA', path: '/logs-ia' },
      { icon: Bell, label: 'Notificações', path: '/notificacoes' },
    ]});
  } else {
    items.push({ icon: History, label: 'Histórico', path: '/historico' });
  }

  if (isSDR) {
    items.push({ icon: LayoutDashboard, label: 'Comercial', path: '/comercial', children: [
      { icon: BarChart3, label: 'Pipeline', path: '/comercial/pipeline' },
      { icon: Calendar, label: 'Agenda', path: '/comercial/agenda' },
    ]});
  }
  
  items.push({ icon: Settings, label: 'Configurações', path: '#settings', isSettings: true });
  
  return items;
};

const adminNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: Building2, label: 'Organização', path: '/admin/usuarios', children: [
    { icon: Users, label: 'Usuários', path: '/admin/usuarios' },
    { icon: Building2, label: 'Departamentos', path: '/admin/departamentos' },
    { icon: Bot, label: 'Robôs', path: '/admin/robos' },
    { icon: Trophy, label: 'Config. Ranking', path: '/admin/ranking-config' },
  ]},
  { icon: Share, label: 'Integrações', path: '/admin/ias', children: [
    { icon: Sparkles, label: 'IAs', path: '/admin/ias' },
    { icon: Smartphone, label: 'WhatsApp', path: '/admin/whatsapp' },
  ]},
  { icon: BarChart3, label: 'Geral', path: '/admin/relatorios', children: [
    { icon: FileText, label: 'Logs', path: '/admin/logs' },
    { icon: Trash2, label: 'Exclusões', path: '/admin/exclusoes' },
    { icon: HardDrive, label: 'Armazenamento', path: '/admin/armazenamento' },
  ]},
  { icon: Brain, label: 'Cérebro', path: '/admin/cerebro' },
  { icon: Settings, label: 'Configurações', path: '#settings', isSettings: true },
];

interface SidebarProps {
  className?: string;
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

export function Sidebar({ className, variant = 'desktop', onNavigate }: SidebarProps) {
  const { user, sidebarCollapsed, setSidebarCollapsed, conversations, departments } = useApp();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { 
    notificationsEnabled, 
    setNotificationsEnabled, 
    soundEnabled, 
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    playNotificationSound
  } = useSettings();
  const { unreadCount } = useUnreadMessages();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith('/admin');
  
  // Verificar se o usuário pertence ao departamento Suporte
  const suporteDeptId = departments.find(d => d.name.toLowerCase() === 'suporte')?.id;
  const comercialDeptId = departments.find(d => d.name.toLowerCase() === 'comercial')?.id;
  const userBelongsToSuport = suporteDeptId ? (user?.departments?.includes(suporteDeptId) || false) : false;
  const userBelongsToComercial = comercialDeptId ? (user?.departments?.includes(comercialDeptId) || false) : false;
  
  // Contar conversas na fila (status em_fila)
  const queueCount = conversations.filter(c => c.status === 'em_fila').length;
  // Contar conversas ativas (em_atendimento, transferida, pendente)
  const activeConversationsCount = conversations.filter(c => 
    c.status !== 'finalizada' && c.status !== 'em_fila'
  ).length;
  const navItems = isAdmin ? adminNavItems : getNavItems(queueCount, activeConversationsCount, unreadCount.internalChat, userBelongsToSuport, userBelongsToComercial);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running as standalone (already installed)
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        toast.success('App instalado com sucesso!');
      }
      setDeferredPrompt(null);
    }
  };

  const canCollapse = variant === 'desktop';
  const isCollapsed = canCollapse ? sidebarCollapsed : false;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSettingsOpen(true);
  };

  const handleTestSound = () => {
    playNotificationSound();
    toast.success('Som de teste reproduzido');
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <aside
        className={cn(
          "h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300",
          isCollapsed ? "w-20" : "w-64",
          variant === 'mobile' && "h-full",
          className
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg text-foreground">Chat Match</span>
            </div>
          )}
          {isCollapsed && (
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center mx-auto">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          {canCollapse && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn("text-muted-foreground hover:text-foreground", isCollapsed && "hidden")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            if (item.isSettings) {
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={handleSettingsClick}
                  className={cn(
                    "sidebar-item group w-full text-left",
                    isCollapsed && "justify-center px-2"
                  )}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && (
                    <span className="flex-1">{item.label}</span>
                  )}
                </button>
              );
            }

            if (item.children && item.children.length > 0) {
              const isGroupActive = location.pathname === item.path || item.children.some(c => location.pathname === c.path);
              const isExpanded = expandedGroups[item.path] ?? isGroupActive;

              return (
                <div key={item.path} className="space-y-1">
                  <div className="flex items-center">
                    <NavLink
                      to={item.path}
                      onClick={() => onNavigate?.()}
                      className={({ isActive }) =>
                        cn(
                          "sidebar-item group flex-1",
                          isActive && "sidebar-item-active",
                          isCollapsed && "justify-center px-2"
                        )
                      }
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {!isCollapsed && <span className="flex-1">{item.label}</span>}
                    </NavLink>
                    {!isCollapsed && (
                      <button
                        type="button"
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [item.path]: !isExpanded }))}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                      </button>
                    )}
                  </div>
                  {isExpanded && !isCollapsed && (
                    <div className="ml-4 pl-3 border-l border-sidebar-border space-y-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={() => onNavigate?.()}
                          className={({ isActive }) =>
                            cn(
                              "sidebar-item group text-sm",
                              isActive && "sidebar-item-active"
                            )
                          }
                        >
                          <child.icon className="w-4 h-4 shrink-0" />
                          <span className="flex-1">{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onNavigate?.()}
                className={({ isActive }) =>
                  cn(
                    "sidebar-item group",
                    isActive && "sidebar-item-active",
                    isCollapsed && "justify-center px-2"
                  )
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="queue-counter bg-primary text-primary-foreground">{item.badge}</span>
                    )}
                  </>
                )}
                {isCollapsed && item.badge && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Mode Switch - Only show admin option for admins */}
        {(user?.role === 'admin' || isAdmin) && (
          <div className="px-3 py-2 border-t border-sidebar-border">
            <NavLink
              to={isAdmin ? '/fila' : '/admin'}
              onClick={() => onNavigate?.()}
              className={cn(
                "sidebar-item text-muted-foreground hover:text-primary",
                isCollapsed && "justify-center px-2"
              )}
            >
              {isAdmin ? (
                <>
                  <MessageSquare className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span>Painel de Atendimento</span>}
                </>
              ) : (
                <>
                  <LayoutDashboard className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span>Painel Admin</span>}
                </>
              )}
            </NavLink>
          </div>
        )}

        {/* Expand button when collapsed */}
        {canCollapse && isCollapsed && (
          <div className="px-3 py-2 border-t border-sidebar-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(false)}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* User Profile */}
        <div className="p-3 border-t border-sidebar-border">
          <div
            className={cn(
              "flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent",
              isCollapsed && "justify-center p-2"
            )}
          >
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {user ? getInitials(user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-sidebar-accent",
                  user?.status === 'online' && "bg-online",
                  user?.status === 'away' && "bg-away",
                  user?.status === 'busy' && "bg-busy",
                  user?.status === 'offline' && "bg-offline"
                )}
              />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
            )}
            {!isCollapsed && (
              <Button 
                variant="ghost" 
                size="icon-sm" 
                className="text-muted-foreground hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
            <DialogDescription>Configure suas preferências do aplicativo</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Theme Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Aparência</h3>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? (
                    <Moon className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Sun className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Tema</p>
                    <p className="text-xs text-muted-foreground">
                      {theme === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('light')}
                    className="h-8 px-3"
                  >
                    <Sun className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme('dark')}
                    className="h-8 px-3"
                  >
                    <Moon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Notifications Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Notificações</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Notificações da fila</p>
                      <p className="text-xs text-muted-foreground">Alertas quando novas conversas entrarem</p>
                    </div>
                  </div>
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={async (checked) => {
                      setNotificationsEnabled(checked);
                      if (checked) {
                        const permission = await requestNotificationPermission();
                        if (permission === 'denied') {
                          toast.error(getNotificationStatusMessage());
                        } else if (permission === 'unsupported') {
                          toast.warning(getNotificationStatusMessage());
                        } else {
                          toast.success('Notificações ativadas');
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sound Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Sons</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    {soundEnabled ? (
                      <Volume2 className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Sons de notificação</p>
                      <p className="text-xs text-muted-foreground">Alertas sonoros para novas mensagens</p>
                    </div>
                  </div>
                  <Switch
                    checked={soundEnabled}
                    onCheckedChange={setSoundEnabled}
                  />
                </div>

                {soundEnabled && (
                  <div className="p-3 rounded-lg bg-secondary/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Volume</p>
                      <span className="text-xs text-muted-foreground">{Math.round(soundVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[soundVolume]}
                      onValueChange={([value]) => setSoundVolume(value)}
                      max={1}
                      step={0.1}
                      className="w-full"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleTestSound}
                      className="w-full"
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Testar som
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* PWA Install Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Instalar App</h3>
              <div className="p-3 rounded-lg bg-secondary/50 space-y-3">
                {isStandalone || isInstalled ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">App instalado</p>
                      <p className="text-xs text-muted-foreground">O Match Conversa já está instalado no seu dispositivo</p>
                    </div>
                  </div>
                ) : deferredPrompt ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Download className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Instalar Match Conversa</p>
                        <p className="text-xs text-muted-foreground">Acesso rápido pela tela inicial</p>
                      </div>
                    </div>
                    <Button onClick={handleInstallPWA} className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Instalar Agora
                    </Button>
                  </>
                ) : isIOS ? (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Instalar no iPhone/iPad</p>
                        <p className="text-xs text-muted-foreground">Siga as instruções abaixo</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                        <span className="flex items-center gap-1">Toque em <Share className="w-4 h-4" /> Compartilhar</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                        <span className="flex items-center gap-1">Selecione <Plus className="w-4 h-4" /> Adicionar à Tela Inicial</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                        <span>Toque em "Adicionar"</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Instalar Match Conversa</p>
                        <p className="text-xs text-muted-foreground">Siga as instruções abaixo</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                        <span>Abra o menu do navegador (⋮ ou ⋯)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                        <span>Selecione "Instalar app" ou "Adicionar à tela inicial"</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
