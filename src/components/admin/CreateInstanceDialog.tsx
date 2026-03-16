import { useState } from 'react';
import { Plus, Loader2, Building2, Hash } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Department {
  id: string;
  name: string;
  color: string;
}

interface CreateInstanceDialogProps {
  departments: Department[];
  onCreateInstance: (instanceId: string, departmentId?: string) => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
  maxInstances: number;
  currentCount: number;
}

export function CreateInstanceDialog({
  departments,
  onCreateInstance,
  disabled,
  maxInstances,
  currentCount
}: CreateInstanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [instanceId, setInstanceId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!instanceId.trim()) {
      setError('Informe um identificador para a instância');
      return;
    }

    // Validar formato do instanceId (somente letras, números, hífen e underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(instanceId)) {
      setError('Use apenas letras, números, hífen e underscore');
      return;
    }

    setError('');
    setIsCreating(true);
    
    const result = await onCreateInstance(instanceId.trim(), departmentId || undefined);
    
    setIsCreating(false);
    
    if (result.success) {
      setOpen(false);
      setInstanceId('');
      setDepartmentId('');
    } else {
      setError(result.error || 'Erro ao criar instância');
    }
  };

  const remaining = maxInstances - currentCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled || remaining <= 0}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Número
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Número WhatsApp</DialogTitle>
          <DialogDescription>
            Crie uma nova instância para conectar outro número WhatsApp.
            {remaining > 0 ? (
              <span className="block mt-1 text-muted-foreground">
                Você pode adicionar mais {remaining} número(s).
              </span>
            ) : (
              <span className="block mt-1 text-destructive">
                Limite máximo de {maxInstances} números atingido.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instanceId" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Identificador da Instância
            </Label>
            <Input
              id="instanceId"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value.toLowerCase())}
              placeholder="ex: vendas, suporte, marketing"
              className="lowercase"
            />
            <p className="text-xs text-muted-foreground">
              Use um nome único para identificar esta conexão
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="department" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Departamento (opcional)
            </Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger id="department">
                <SelectValue placeholder="Selecione um departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: dept.color }}
                      />
                      {dept.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mensagens recebidas serão direcionadas para este departamento
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !instanceId.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              'Criar Instância'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
