import { useState, useEffect } from 'react';
import { Search, Plus, Star, Edit2, Trash2, Copy, Check, FolderOpen, Tag, Building2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface QuickMessageCategory {
  id: string;
  name: string;
  color: string;
  user_id: string;
}

const defaultCategories = ['Saudações', 'Transferência', 'Solicitações', 'Encerramento', 'Outros'];

export default function QuickMessages() {
  const { quickMessages, departments, refetchQuickMessages, users } = useApp();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<typeof quickMessages[0] | null>(null);
  const [newMessage, setNewMessage] = useState({ title: '', content: '', category: '', departmentId: '' });
  const [newCategory, setNewCategory] = useState({ name: '', color: '#6366f1' });
  const [customCategories, setCustomCategories] = useState<QuickMessageCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Buscar categorias personalizadas
  useEffect(() => {
    const fetchCategories = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('quick_message_categories')
        .select('*')
        .order('name');
      
      if (data) {
        setCustomCategories(data);
      }
    };
    fetchCategories();
  }, [user]);

  // Combinar categorias padrão com personalizadas
  const allCategories = [...defaultCategories, ...customCategories.map(c => c.name)];
  const uniqueCategories = [...new Set(allCategories)];

  // Departamentos do usuário baseado no contexto
  const currentUserData = users.find(u => u.id === user?.id);
  const userDepartmentIds = currentUserData?.departments || [];
  const userDepartments = departments.filter(d => userDepartmentIds.includes(d.id));

  const filteredMessages = quickMessages.filter((msg) => {
    const matchesSearch = msg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || msg.category === selectedCategory;
    const matchesDepartment = selectedDepartment === 'all' || 
      msg.departmentId === selectedDepartment || 
      !msg.departmentId;
    return matchesSearch && matchesCategory && matchesDepartment;
  });

  const favoriteMessages = filteredMessages.filter(m => m.isFavorite);
  const otherMessages = filteredMessages.filter(m => !m.isFavorite);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast.success('Mensagem copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    if (!newMessage.title || !newMessage.content || !newMessage.category || !user) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quick_messages')
        .insert({
          title: newMessage.title,
          content: newMessage.content,
          category: newMessage.category,
          department_id: newMessage.departmentId || null,
          user_id: user.id,
          is_favorite: false
        });

      if (error) throw error;

      await refetchQuickMessages();
      toast.success('Mensagem criada com sucesso!');
      setIsDialogOpen(false);
      setNewMessage({ title: '', content: '', category: '', departmentId: '' });
    } catch (error) {
      console.error('Erro ao criar mensagem:', error);
      toast.error('Erro ao criar mensagem');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name || !user) {
      toast.error('Digite o nome da categoria');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quick_message_categories')
        .insert({
          name: newCategory.name,
          color: newCategory.color,
          user_id: user.id
        });

      if (error) throw error;

      // Refetch categories
      const { data } = await supabase
        .from('quick_message_categories')
        .select('*')
        .order('name');
      
      if (data) {
        setCustomCategories(data);
      }

      toast.success('Categoria criada com sucesso!');
      setIsCategoryDialogOpen(false);
      setNewCategory({ name: '', color: '#6366f1' });
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Categoria já existe');
      } else {
        console.error('Erro ao criar categoria:', error);
        toast.error('Erro ao criar categoria');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (message: typeof quickMessages[0]) => {
    setEditingMessage(message);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingMessage) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('quick_messages')
        .update({
          title: editingMessage.title,
          content: editingMessage.content,
          category: editingMessage.category,
          department_id: editingMessage.departmentId || null
        })
        .eq('id', editingMessage.id);

      if (error) throw error;

      await refetchQuickMessages();
      toast.success('Mensagem atualizada!');
      setIsEditDialogOpen(false);
      setEditingMessage(null);
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar mensagem');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta mensagem?')) return;

    try {
      const { error } = await supabase
        .from('quick_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await refetchQuickMessages();
      toast.success('Mensagem excluída!');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir mensagem');
    }
  };

  const handleToggleFavorite = async (message: typeof quickMessages[0]) => {
    try {
      const { error } = await supabase
        .from('quick_messages')
        .update({ is_favorite: !message.isFavorite })
        .eq('id', message.id);

      if (error) throw error;

      await refetchQuickMessages();
      toast.success(message.isFavorite ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
    } catch (error) {
      console.error('Erro ao favoritar:', error);
    }
  };

  const getDepartmentById = (deptId?: string) => {
    if (!deptId) return null;
    return departments.find(d => d.id === deptId);
  };

  return (
    <MainLayout title="Mensagens Rápidas">
      <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex-1 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar mensagens..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 input-search"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão Nova Categoria */}
            <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Tag className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Nova Categoria</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nova Categoria</DialogTitle>
                  <DialogDescription>
                    Crie uma categoria personalizada para suas mensagens
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="cat-name">Nome da Categoria</Label>
                    <Input
                      id="cat-name"
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                      placeholder="Ex: Promoções"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cat-color">Cor</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        id="cat-color"
                        value={newCategory.color}
                        onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <span className="text-sm text-muted-foreground">{newCategory.color}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setIsCategoryDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateCategory} disabled={isLoading}>
                    {isLoading ? 'Criando...' : 'Criar Categoria'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Botão Nova Mensagem */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Nova Mensagem</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nova Mensagem Rápida</DialogTitle>
                  <DialogDescription>
                    Crie uma nova mensagem para usar nos atendimentos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={newMessage.title}
                      onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
                      placeholder="Ex: Saudação inicial"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria *</Label>
                    <Select 
                      value={newMessage.category} 
                      onValueChange={(v) => setNewMessage({ ...newMessage, category: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Departamento (opcional)</Label>
                    <Select 
                      value={newMessage.departmentId || 'none'} 
                      onValueChange={(v) => setNewMessage({ ...newMessage, departmentId: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum (geral)</SelectItem>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: dept.color }}
                              />
                              {dept.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Conteúdo *</Label>
                    <Textarea
                      id="content"
                      value={newMessage.content}
                      onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                      placeholder="Digite o conteúdo da mensagem..."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={isLoading}>
                    {isLoading ? 'Criando...' : 'Criar Mensagem'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-6">
          {/* Favorites */}
          {favoriteMessages.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-warning" />
                <h2 className="font-medium text-foreground">Favoritos</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favoriteMessages.map((msg) => (
                  <MessageCard 
                    key={msg.id} 
                    message={msg} 
                    onCopy={handleCopy}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavorite={handleToggleFavorite}
                    isCopied={copiedId === msg.id}
                    department={getDepartmentById(msg.departmentId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Messages by Category */}
          {selectedCategory === 'all' ? (
            uniqueCategories.map((category) => {
              const categoryMessages = otherMessages.filter(m => m.category === category);
              if (categoryMessages.length === 0) return null;
              
              const customCat = customCategories.find(c => c.name === category);
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    <FolderOpen 
                      className="w-4 h-4" 
                      style={{ color: customCat?.color || 'var(--muted-foreground)' }}
                    />
                    <h2 className="font-medium text-foreground">{category}</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryMessages.map((msg) => (
                      <MessageCard 
                        key={msg.id} 
                        message={msg} 
                        onCopy={handleCopy}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleFavorite={handleToggleFavorite}
                        isCopied={copiedId === msg.id}
                        department={getDepartmentById(msg.departmentId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherMessages.map((msg) => (
                <MessageCard 
                  key={msg.id} 
                  message={msg} 
                  onCopy={handleCopy}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  isCopied={copiedId === msg.id}
                  department={getDepartmentById(msg.departmentId)}
                />
              ))}
            </div>
          )}

          {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-4" />
              <p>Nenhuma mensagem encontrada</p>
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Mensagem</DialogTitle>
            </DialogHeader>
            {editingMessage && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={editingMessage.title}
                    onChange={(e) => setEditingMessage({ ...editingMessage, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select 
                    value={editingMessage.category} 
                    onValueChange={(v) => setEditingMessage({ ...editingMessage, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Select 
                    value={editingMessage.departmentId || 'none'} 
                    onValueChange={(v) => setEditingMessage({ ...editingMessage, departmentId: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (geral)</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: dept.color }}
                            />
                            {dept.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo</Label>
                  <Textarea
                    value={editingMessage.content}
                    onChange={(e) => setEditingMessage({ ...editingMessage, content: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

interface MessageCardProps {
  message: { 
    id: string; 
    title: string; 
    content: string; 
    category: string; 
    isFavorite: boolean;
    departmentId?: string;
  };
  onCopy: (id: string, content: string) => void;
  onEdit: (message: any) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (message: any) => void;
  isCopied: boolean;
  department?: { id: string; name: string; color: string } | null;
}

function MessageCard({ message, onCopy, onEdit, onDelete, onToggleFavorite, isCopied, department }: MessageCardProps) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all card-hover">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">{message.title}</h3>
          <button onClick={() => onToggleFavorite(message)} className="hover:scale-110 transition-transform">
            <Star className={cn(
              "w-3.5 h-3.5",
              message.isFavorite ? "text-warning fill-warning" : "text-muted-foreground"
            )} />
          </button>
        </div>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">
          {message.category}
        </span>
      </div>
      
      {department && (
        <div className="flex items-center gap-1 mb-2">
          <Building2 className="w-3 h-3 text-muted-foreground" />
          <span 
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${department.color}20`, color: department.color }}
          >
            {department.name}
          </span>
        </div>
      )}
      
      <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{message.content}</p>
      <div className="flex items-center gap-2">
        <Button 
          variant="secondary" 
          size="sm" 
          className="flex-1"
          onClick={() => onCopy(message.id, message.content)}
        >
          {isCopied ? (
            <>
              <Check className="w-4 h-4 mr-1 text-success" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1" />
              Copiar
            </>
          )}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(message)}>
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon-sm" 
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(message.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
