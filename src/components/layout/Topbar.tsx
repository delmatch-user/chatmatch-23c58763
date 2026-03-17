import { useState, useEffect, useRef } from 'react';
import { Search, Bell, BellOff, ChevronDown, LogOut, User, Settings, Volume2, Menu, Sun, Moon, VolumeX, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQueueNotifications } from '@/hooks/useQueueNotifications';
import { requestNotificationPermission, getNotificationStatusMessage } from '@/lib/notifications';
import { useWorkScheduleMonitor } from '@/hooks/useWorkScheduleMonitor';
import { EndOfShiftDialog } from '@/components/schedule/EndOfShiftDialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TopbarProps {
  title?: string;
  onOpenSidebar?: () => void;
}

export function Topbar({ title = 'Match Conversa', onOpenSidebar }: TopbarProps) {
  const { user, departments, setUser, users } = useApp();
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
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const totalQueue = departments.reduce((acc, dept) => acc + dept.queueCount, 0);
  
  // Use queue notifications hook
  useQueueNotifications(totalQueue, notificationsEnabled);

  // Use work schedule monitor hook
  const {
    minutesRemaining: scheduleMinutesRemaining,
    isWithinSchedule,
    showEndOfShiftDialog,
    setShowEndOfShiftDialog,
    confirmChoice,
    pendingConversationsCount,
  } = useWorkScheduleMonitor();

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };


  // Pause timer logic (1h05 = 3900 seconds)
  const PAUSE_DURATION = 3900;
  const [pauseTimeRemaining, setPauseTimeRemaining] = useState<number | null>(null);
  const pauseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch pause_started_at on mount and when status changes
  useEffect(() => {
    if (!user?.id) return;

    const fetchPauseStartedAt = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('pause_started_at')
        .eq('id', user.id)
        .single();

      if (!error && data?.pause_started_at && user.status === 'away') {
        const startTime = new Date(data.pause_started_at).getTime();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = PAUSE_DURATION - elapsed;
        
        if (remaining > 0) {
          setPauseTimeRemaining(remaining);
        } else {
          // Time expired, return to online
          handleStatusChange('online');
        }
      } else {
        setPauseTimeRemaining(null);
      }
    };

    fetchPauseStartedAt();
  }, [user?.id, user?.status]);

  // Countdown timer for pause
  useEffect(() => {
    if (pauseTimeRemaining === null || pauseTimeRemaining <= 0) {
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
        pauseIntervalRef.current = null;
      }
      return;
    }

    pauseIntervalRef.current = setInterval(() => {
      setPauseTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          // Time's up, return to online
          handleStatusChange('online');
          toast.success('Pausa encerrada! Você voltou ao status Online.');
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
      }
    };
  }, [pauseTimeRemaining !== null]);

  const formatPauseTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}h${m.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStatusChange = async (newStatus: 'online' | 'away' | 'offline') => {
    if (!user) return;
    
    try {
      const updateData: { status: 'online' | 'away' | 'offline'; pause_started_at?: string | null } = { 
        status: newStatus 
      };
      
      // If entering pause, set pause_started_at
      if (newStatus === 'away') {
        updateData.pause_started_at = new Date().toISOString();
        setPauseTimeRemaining(PAUSE_DURATION);
      } else {
        // Clear pause_started_at when leaving pause
        updateData.pause_started_at = null;
        setPauseTimeRemaining(null);
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;
      
      setUser(prev => prev ? { ...prev, status: newStatus as any } : null);
      
      const statusLabels: Record<string, string> = {
        online: 'Online',
        away: 'Pausa (1h05)',
        offline: 'Offline'
      };
      toast.success(`Status: ${statusLabels[newStatus]}`);
    } catch (error: any) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleOpenProfile = () => {
    setEditName(user?.name || '');
    setEditPhone('');
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
      const updates: any = {};
      if (editName.trim()) updates.name = editName.trim();
      if (editPhone.trim()) updates.phone = editPhone.trim();

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;
      
      setUser(prev => prev ? { ...prev, name: editName.trim() || prev.name } : null);
      toast.success('Perfil atualizado');
      setProfileOpen(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleTestSound = () => {
    playNotificationSound();
    toast.success('Som de teste reproduzido');
  };

  return (
    <>
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {onOpenSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onOpenSidebar}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
          <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
          {/* Department Online Users Summary - clickable with popover - visible to all users */}
          <div className="hidden md:flex items-center gap-2 ml-4">
            {departments
              .filter((dept) => dept.onlineCount > 0)
              .map((dept) => {
                // Get users from this department who are online or away
                const usersInDept = users.filter(u => 
                  u.departments?.includes(dept.id) && 
                  (u.status === 'online' || u.status === 'away')
                );
                
                return (
                  <Popover key={dept.id}>
                    <PopoverTrigger asChild>
                      <div 
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                      >
                        <span 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: dept.color }}
                        />
                        <span className="text-muted-foreground">{dept.name}</span>
                        <span className="font-semibold text-foreground">{dept.onlineCount}</span>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                      <div className="p-3 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: dept.color }}
                          />
                          <h4 className="font-medium text-sm">{dept.name}</h4>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {usersInDept.length} online
                          </span>
                        </div>
                      </div>
                      <ScrollArea className="max-h-60">
                        <div className="p-2 space-y-1">
                          {usersInDept.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">
                              Nenhum usuário online
                            </p>
                          ) : (
                            usersInDept.map(u => (
                              <div 
                                key={u.id} 
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/50"
                              >
                                <div className="relative">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={u.avatar} />
                                    <AvatarFallback className="text-[10px] bg-muted">
                                      {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className={cn(
                                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-popover",
                                    u.status === 'online' && "bg-online",
                                    u.status === 'away' && "bg-away"
                                  )} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{u.name}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {u.status === 'online' ? 'Online' : 'Em pausa'}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                );
              })}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar conversas, contatos..." 
              className="pl-9 w-64 input-search"
            />
          </div>

          {/* Notifications */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative"
            onClick={async () => {
              const newValue = !notificationsEnabled;
              setNotificationsEnabled(newValue);
              if (newValue) {
                const permission = await requestNotificationPermission();
                if (permission === 'denied') {
                  toast.error(getNotificationStatusMessage());
                } else if (permission === 'unsupported') {
                  toast.warning(getNotificationStatusMessage());
                } else {
                  toast.success('Notificações ativadas');
                }
              } else {
                toast.success('Notificações desativadas');
              }
            }}
            title={notificationsEnabled ? 'Desativar notificações' : 'Ativar notificações'}
          >
            {notificationsEnabled ? (
              <Bell className="w-5 h-5 text-muted-foreground" />
            ) : (
              <BellOff className="w-5 h-5 text-muted-foreground" />
            )}
            {totalQueue > 0 && notificationsEnabled && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card",
                    user?.status === 'online' && "bg-online",
                    user?.status === 'away' && "bg-away",
                    user?.status === 'busy' && "bg-busy",
                    user?.status === 'offline' && "bg-offline"
                  )} />
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user?.status === 'away' && pauseTimeRemaining !== null 
                      ? `Pausa (${formatPauseTime(pauseTimeRemaining)})` 
                      : user?.status === 'online' 
                        ? 'Online' 
                        : 'Offline'}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => handleStatusChange('online')}
              >
                <span className="w-2 h-2 rounded-full bg-online mr-2" />
                Online
                {user?.status === 'online' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => handleStatusChange('away')}
              >
                <span className="w-2 h-2 rounded-full bg-away mr-2" />
                <div className="flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  <span>Pausa</span>
                  {user?.status === 'away' && pauseTimeRemaining !== null && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatPauseTime(pauseTimeRemaining)})
                    </span>
                  )}
                  {user?.status !== 'away' && (
                    <span className="text-xs text-muted-foreground ml-1">(1h05)</span>
                  )}
                </div>
                {user?.status === 'away' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => handleStatusChange('offline')}
              >
                <span className="w-2 h-2 rounded-full bg-offline mr-2" />
                Offline
                {user?.status === 'offline' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => handleOpenProfile()}
              >
                <User className="w-4 h-4 mr-2" />
                Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => setSettingsOpen(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Meu Perfil</DialogTitle>
            <DialogDescription>Atualize suas informações pessoais</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {user ? getInitials(user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input 
                id="profile-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input 
                id="profile-email"
                value={user?.email || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Telefone</Label>
              <Input 
                id="profile-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setProfileOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
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
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End of Shift Dialog */}
      <EndOfShiftDialog
        open={showEndOfShiftDialog}
        onOpenChange={setShowEndOfShiftDialog}
        minutesRemaining={scheduleMinutesRemaining || 0}
        pendingConversationsCount={pendingConversationsCount}
        onChoiceConfirmed={confirmChoice}
      />
    </>
  );
}
