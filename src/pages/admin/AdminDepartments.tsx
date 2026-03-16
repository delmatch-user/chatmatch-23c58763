import { useState } from 'react';
import { Search, Plus, MoreVertical, Edit2, Trash2, Users, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useDepartments, Department } from '@/hooks/useDepartments';
import { useUsers } from '@/hooks/useUsers';

const COLORS = [
  // Vermelhos e rosas
  '#EF4444', '#F43F5E', '#E11D48', '#EC4899',
  // Laranjas e amarelos
  '#FF6C08', '#F59E0B', '#FBBF24', '#F97316',
  // Verdes
  '#22C55E', '#10B981', '#14B8A6', '#84CC16',
  // Azuis e roxos
  '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6'
];

export default function AdminDepartments() {
  const { departments, isLoading, createDepartment, updateDepartment, deleteDepartment } = useDepartments();
  const { users } = useUsers();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(COLORS[0]);
  const [formMaxWait, setFormMaxWait] = useState('');
  
  // Edit mode
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  const filteredDepartments = departments.filter((dept) =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUsersInDepartment = (deptId: string) => {
    return users.filter(u => u.departments.some(d => d.department_id === deptId));
  };

  const resetForm = () => {
    setFormName('');
    setFormColor(COLORS[0]);
    setFormMaxWait('');
    setEditingDept(null);
  };

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      setFormName(dept.name);
      setFormColor(dept.color);
      setFormMaxWait(dept.max_wait_time ? String(dept.max_wait_time / 60) : '');
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    
    setIsSubmitting(true);
    
    const deptData = {
      name: formName.trim(),
      description: null,
      color: formColor,
      max_wait_time: formMaxWait ? parseInt(formMaxWait) * 60 : null,
      auto_priority: false,
    };
    
    if (editingDept) {
      await updateDepartment(editingDept.id, deptData);
    } else {
      await createDepartment(deptData);
    }
    
    setIsSubmitting(false);
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este departamento?')) {
      await deleteDepartment(id);
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="Departamentos">
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Departamentos">
      <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar departamentos..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 input-search"
            />
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Departamento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingDept ? 'Editar Departamento' : 'Novo Departamento'}</DialogTitle>
                <DialogDescription>
                  {editingDept ? 'Atualize as informações do departamento' : 'Crie um novo departamento para organizar sua equipe'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input 
                    id="name" 
                    placeholder="Ex: Vendas" 
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="grid grid-cols-8 gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormColor(color)}
                        className={`w-8 h-8 rounded-lg border-2 transition-all ${
                          formColor === color ? 'border-foreground scale-110' : 'border-transparent hover:border-foreground/50'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxWait">Tempo máximo de espera (minutos)</Label>
                  <Input 
                    id="maxWait" 
                    type="number" 
                    placeholder="15"
                    value={formMaxWait}
                    onChange={(e) => setFormMaxWait(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting || !formName.trim()}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    editingDept ? 'Salvar' : 'Criar Departamento'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Departments Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum departamento</h3>
              <p className="text-muted-foreground mb-4">Crie seu primeiro departamento para começar</p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Departamento
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {filteredDepartments.map((dept) => {
                const deptUsers = getUsersInDepartment(dept.id);
                
                return (
                  <Card key={dept.id} className="card-hover">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${dept.color}20` }}
                          >
                            <Users className="w-6 h-6" style={{ color: dept.color }} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{dept.name}</h3>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenDialog(dept)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="cursor-pointer text-destructive"
                              onClick={() => handleDelete(dept.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-secondary">
                          <p className="text-2xl font-bold text-foreground">0</p>
                          <p className="text-xs text-muted-foreground">Na fila</p>
                        </div>
                        <div className="p-3 rounded-lg bg-secondary">
                          <p className="text-2xl font-bold text-foreground">{deptUsers.length}</p>
                          <p className="text-xs text-muted-foreground">Membros</p>
                        </div>
                      </div>

                      {dept.max_wait_time && (
                        <div className="pt-4 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            Tempo máximo de espera: <span className="text-foreground font-medium">{dept.max_wait_time / 60} min</span>
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
