import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AIProvider {
  id: string;
  provider: string;
  display_name: string;
  default_model: string | null;
  is_active: boolean;
  models: string[];
  created_at: string;
  updated_at: string;
}

export function useAIProviders() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('display_name');

      if (error) throw error;

      // Parse models from JSONB
      const parsedData = (data || []).map(provider => ({
        ...provider,
        models: Array.isArray(provider.models) ? provider.models : JSON.parse(provider.models as string || '[]')
      }));

      setProviders(parsedData);
    } catch (error: any) {
      console.error('Error fetching AI providers:', error);
      toast.error('Erro ao carregar provedores de IA');
    } finally {
      setLoading(false);
    }
  };

  const updateProvider = async (id: string, updates: Partial<AIProvider>) => {
    try {
      const { error } = await supabase
        .from('ai_providers')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      await fetchProviders();
      toast.success('Provedor atualizado com sucesso');
      return true;
    } catch (error: any) {
      console.error('Error updating AI provider:', error);
      toast.error('Erro ao atualizar provedor');
      return false;
    }
  };

  const toggleProvider = async (id: string, isActive: boolean) => {
    return updateProvider(id, { is_active: isActive });
  };

  const setDefaultModel = async (id: string, model: string) => {
    return updateProvider(id, { default_model: model });
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  return {
    providers,
    loading,
    fetchProviders,
    updateProvider,
    toggleProvider,
    setDefaultModel
  };
}
