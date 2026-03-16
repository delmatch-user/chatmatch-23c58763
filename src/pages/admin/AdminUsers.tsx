import { useState } from 'react';
import { Search, Plus, MoreVertical, Edit2, Trash2, Shield, Loader2, Building, KeyRound, MapPin } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUsers, UserProfile } from '@/hooks/useUsers';
import { useDepartments } from '@/hooks/useDepartments';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AdminUsers() {
  const { users, isLoading, createUser, updateUser, updateUserRole, updateUserDepartments, updateFranqueadoCities, deleteUser } = useUsers();
  const { departments } = useDepartments();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isCitiesDialogOpen, setIsCitiesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'supervisor' | 'atendente' | 'franqueado'>('atendente');
  const [formDepartments, setFormDepartments] = useState<string[]>([]);
  const [formNewPassword, setFormNewPassword] = useState('');
  const [formCities, setFormCities] = useState<string[]>([]);
  const [formNewCity, setFormNewCity] = useState('');

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-primary/20 text-primary';
      case 'supervisor': return 'bg-blue-500/20 text-blue-400';
      case 'franqueado': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'supervisor': return 'Supervisor';
      case 'franqueado': return 'Franqueado';
      default: return 'Atendente';
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormPhone('');
    setFormRole('atendente');
    setFormDepartments([]);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) return;
    
    setIsSubmitting(true);
    
    const { error } = await createUser(
      formEmail.trim(),
      formPassword,
      formName.trim(),
      formRole,
      formDepartments
    );
    
    setIsSubmitting(false);
    
    if (!error) {
      setIsCreateDialogOpen(false);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (!selectedUser || !formName.trim()) return;
    
    setIsSubmitting(true);
    
    const { error } = await updateUser(selectedUser.id, {
      name: formName.trim(),
      phone: formPhone.trim() || null,
    });
    
    setIsSubmitting(false);
    
    if (!error) {
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      resetForm();
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    
    setIsSubmitting(true);
    
    const { error } = await updateUserRole(selectedUser.id, formRole);
    
    setIsSubmitting(false);
    
    if (!error) {
      setIsRoleDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const handleUpdateDepartments = async () => {
    if (!selectedUser) return;
    
    setIsSubmitting(true);
    
    const { error } = await updateUserDepartments(selectedUser.id, formDepartments);
    
    setIsSubmitting(false);
    
    if (!error) {
      setIsDeptDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    
    setIsSubmitting(true);
    
    const { error } = await deleteUser(selectedUser.id);
    
    setIsSubmitting(false);
    
    if (!error) {
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !formNewPassword.trim() || formNewPassword.length < 6) return;
    
    setIsSubmitting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('admin-update-password', {
        body: { user_id: selectedUser.id, new_password: formNewPassword },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast.success('Senha alterada com sucesso!');
      setIsPasswordDialogOpen(false);
      setSelectedUser(null);
      setFormNewPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error('Erro ao alterar senha: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormPhone(user.phone || '');
    setIsEditDialogOpen(true);
  };

  const openRoleDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormRole(user.roles[0]?.role || 'atendente');
    setIsRoleDialogOpen(true);
  };

  const openDeptDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormDepartments(user.departments.map(d => d.department_id));
    setIsDeptDialogOpen(true);
  };

  const openDeleteDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const openPasswordDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormNewPassword('');
    setIsPasswordDialogOpen(true);
  };

  const openCitiesDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setFormCities(user.franqueado_cities || []);
    setFormNewCity('');
    setIsCitiesDialogOpen(true);
  };

  const handleUpdateCities = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    const { error } = await updateFranqueadoCities(selectedUser.id, formCities);
    setIsSubmitting(false);
    if (!error) {
      setIsCitiesDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const addCity = () => {
    const city = formNewCity.trim();
    if (city && !formCities.includes(city)) {
      setFormCities(prev => [...prev, city]);
      setFormNewCity('');
    }
  };

  const removeCity = (city: string) => {
    setFormCities(prev => prev.filter(c => c !== city));
  };

  const toggleDepartment = (deptId: string) => {
    setFormDepartments(prev => 
      prev.includes(deptId) 
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Gestão de Usuários">
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Gestão de Usuários">
      <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar usuários..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 input-search"
            />
          </div>

          <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Novo Usuário</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-auto">
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <Shield className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum usuário</h3>
              <p className="text-muted-foreground mb-4">Crie o primeiro usuário para começar</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Usuário
              </Button>
            </div>
          ) : isMobile ? (
            /* Mobile: Cards Layout */
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <Card key={user.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openEditDialog(user)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openRoleDialog(user)}>
                            <Shield className="w-4 h-4 mr-2" />
                            Permissões
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openDeptDialog(user)}>
                            <Building className="w-4 h-4 mr-2" />
                            Departamentos
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openPasswordDialog(user)}>
                            <KeyRound className="w-4 h-4 mr-2" />
                            Alterar Senha
                          </DropdownMenuItem>
                          {user.roles[0]?.role === 'franqueado' && (
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openCitiesDialog(user)}>
                              <MapPin className="w-4 h-4 mr-2" />
                              Cidades
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer text-destructive" onClick={() => openDeleteDialog(user)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      {user.roles.length > 0 ? (
                        <span className={cn("status-badge capitalize text-xs", getRoleBadgeVariant(user.roles[0].role))}>
                          {getRoleLabel(user.roles[0].role)}
                        </span>
                      ) : (
                        <span className="status-badge bg-muted text-muted-foreground text-xs">
                          Sem perfil
                        </span>
                      )}
                      
                      <span className={cn(
                        "status-badge capitalize text-xs",
                        user.status === 'online' && "status-online",
                        user.status === 'away' && "status-away",
                        user.status === 'busy' && "status-busy",
                        user.status === 'offline' && "status-offline"
                      )}>
                        {user.status}
                      </span>
                    </div>
                    
                    {user.departments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {user.departments.slice(0, 3).map((deptAssign) => {
                          const dept = departments.find(d => d.id === deptAssign.department_id);
                          return dept ? (
                            <span 
                              key={deptAssign.department_id}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${dept.color}20`, color: dept.color }}
                            >
                              {dept.name}
                            </span>
                          ) : null;
                        })}
                        {user.departments.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{user.departments.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {user.franqueado_cities && user.franqueado_cities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.franqueado_cities.map(city => (
                          <span key={city} className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                            📍 {city}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            /* Desktop: Table Layout */
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Usuário</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Departamentos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.roles.length > 0 ? (
                          <span className={cn("status-badge capitalize", getRoleBadgeVariant(user.roles[0].role))}>
                            {getRoleLabel(user.roles[0].role)}
                          </span>
                        ) : (
                          <span className="status-badge bg-muted text-muted-foreground">
                            Sem perfil
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.departments.length > 0 ? (
                            user.departments.map((deptAssign) => {
                              const dept = departments.find(d => d.id === deptAssign.department_id);
                              return dept ? (
                                <span 
                                  key={deptAssign.department_id}
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: `${dept.color}20`, color: dept.color }}
                                >
                                  {dept.name}
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="text-xs text-muted-foreground">Nenhum</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "status-badge capitalize",
                          user.status === 'online' && "status-online",
                          user.status === 'away' && "status-away",
                          user.status === 'busy' && "status-busy",
                          user.status === 'offline' && "status-offline"
                        )}>
                          {user.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openEditDialog(user)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openRoleDialog(user)}>
                              <Shield className="w-4 h-4 mr-2" />
                              Permissões
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openDeptDialog(user)}>
                              <Building className="w-4 h-4 mr-2" />
                              Departamentos
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openPasswordDialog(user)}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              Alterar Senha
                            </DropdownMenuItem>
                            {user.roles[0]?.role === 'franqueado' && (
                              <DropdownMenuItem className="cursor-pointer" onClick={() => openCitiesDialog(user)}>
                                <MapPin className="w-4 h-4 mr-2" />
                                Cidades
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-destructive" onClick={() => openDeleteDialog(user)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Adicione um novo membro à equipe</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome *</Label>
              <Input 
                id="create-name" 
                placeholder="Nome completo"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input 
                id="create-email" 
                type="email" 
                placeholder="email@exemplo.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Senha *</Label>
              <Input 
                id="create-password" 
                type="password" 
                placeholder="Mínimo 6 caracteres"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role">Perfil *</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="franqueado">Franqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {departments.length > 0 && (
              <div className="space-y-2">
                <Label>Departamentos</Label>
                <div className="flex flex-wrap gap-2">
                  {departments.map((dept) => (
                    <Button 
                      key={dept.id} 
                      type="button"
                      variant={formDepartments.includes(dept.id) ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => toggleDepartment(dept.id)}
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-1"
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={isSubmitting || !formName.trim() || !formEmail.trim() || !formPassword.trim()}
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { setSelectedUser(null); resetForm(); }}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Atualize as informações do usuário</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input 
                id="edit-name" 
                placeholder="Nome completo"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input 
                id="edit-email" 
                value={selectedUser?.email || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input 
                id="edit-phone" 
                placeholder="(00) 00000-0000"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={isSubmitting || !formName.trim()}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={(open) => { setIsRoleDialogOpen(open); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Permissões de {selectedUser?.name}</DialogTitle>
            <DialogDescription>Defina o perfil de acesso do usuário</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Perfil de Acesso</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="franqueado">Franqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsRoleDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Departments Dialog */}
      <Dialog open={isDeptDialogOpen} onOpenChange={(open) => { setIsDeptDialogOpen(open); if (!open) setSelectedUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Departamentos de {selectedUser?.name}</DialogTitle>
            <DialogDescription>Selecione os departamentos que este usuário pode atender</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {departments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <Button 
                    key={dept.id} 
                    type="button"
                    variant={formDepartments.includes(dept.id) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDepartment(dept.id)}
                  >
                    <span 
                      className="w-2 h-2 rounded-full mr-1"
                      style={{ backgroundColor: dept.color }}
                    />
                    {dept.name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhum departamento cadastrado</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsDeptDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateDepartments} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) setSelectedUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{selectedUser?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSubmitting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => { setIsPasswordDialogOpen(open); if (!open) { setSelectedUser(null); setFormNewPassword(''); }}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para {selectedUser?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha *</Label>
              <Input 
                id="new-password" 
                type="password" 
                placeholder="Mínimo 6 caracteres"
                value={formNewPassword}
                onChange={(e) => setFormNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsPasswordDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={isSubmitting || formNewPassword.length < 6}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Alterar Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Franqueado Cities Dialog */}
      <Dialog open={isCitiesDialogOpen} onOpenChange={(open) => { setIsCitiesDialogOpen(open); if (!open) { setSelectedUser(null); setFormCities([]); setFormNewCity(''); }}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cidades de {selectedUser?.name}</DialogTitle>
            <DialogDescription>Configure as cidades que este franqueado pode visualizar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nome da cidade..."
                value={formNewCity}
                onChange={(e) => setFormNewCity(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity(); }}}
              />
              <Button type="button" onClick={addCity} disabled={!formNewCity.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {formCities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {formCities.map(city => (
                  <span key={city} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-orange-500/20 text-orange-400">
                    <MapPin className="w-3 h-3" />
                    {city}
                    <button onClick={() => removeCity(city)} className="ml-1 hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma cidade adicionada</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCitiesDialogOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateCities} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
