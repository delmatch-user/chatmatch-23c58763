import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useContacts() {
  const [updating, setUpdating] = useState(false);

  const updateContactName = async (contactId: string, newName: string): Promise<boolean> => {
    if (!newName.trim()) {
      toast.error('O nome não pode estar vazio');
      return false;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ name: newName.trim(), name_edited: true })
        .eq('id', contactId);

      if (error) throw error;

      toast.success('Nome do contato atualizado');
      return true;
    } catch (error) {
      console.error('Erro ao atualizar nome do contato:', error);
      toast.error('Erro ao atualizar nome do contato');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const updateContactPhone = async (contactId: string, newPhone: string): Promise<boolean> => {
    const cleaned = newPhone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      toast.error('Telefone inválido (mínimo 10 dígitos)');
      return false;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ phone: cleaned })
        .eq('id', contactId);

      if (error) throw error;

      toast.success('Telefone do contato atualizado');
      return true;
    } catch (error) {
      console.error('Erro ao atualizar telefone do contato:', error);
      toast.error('Erro ao atualizar telefone do contato');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  return { updateContactName, updateContactPhone, updating };
}
