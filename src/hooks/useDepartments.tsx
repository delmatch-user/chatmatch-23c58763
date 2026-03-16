import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Department {
  id: string;
  name: string;
  description: string | null;
  color: string;
  max_wait_time: number | null;
  auto_priority: boolean;
  created_at: string;
}

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');

      if (error) throw error;
      setDepartments(data || []);
    } catch (error: any) {
      console.error('Error fetching departments:', error);
      toast.error('Erro ao carregar departamentos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const createDepartment = async (department: Omit<Department, 'id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .insert(department)
        .select()
        .single();

      if (error) throw error;
      
      setDepartments(prev => [...prev, data]);
      toast.success('Departamento criado com sucesso!');
      return { data, error: null };
    } catch (error: any) {
      console.error('Error creating department:', error);
      toast.error('Erro ao criar departamento: ' + error.message);
      return { data: null, error };
    }
  };

  const updateDepartment = async (id: string, updates: Partial<Department>) => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      setDepartments(prev => prev.map(d => d.id === id ? data : d));
      toast.success('Departamento atualizado com sucesso!');
      return { data, error: null };
    } catch (error: any) {
      console.error('Error updating department:', error);
      toast.error('Erro ao atualizar departamento: ' + error.message);
      return { data: null, error };
    }
  };

  const deleteDepartment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setDepartments(prev => prev.filter(d => d.id !== id));
      toast.success('Departamento excluído com sucesso!');
      return { error: null };
    } catch (error: any) {
      console.error('Error deleting department:', error);
      toast.error('Erro ao excluir departamento: ' + error.message);
      return { error };
    }
  };

  return {
    departments,
    isLoading,
    fetchDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
  };
}
