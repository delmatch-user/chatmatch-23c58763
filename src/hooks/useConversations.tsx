import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Conversation } from '@/types';
import { SUPORTE_TAXONOMY_TAGS } from '@/lib/tagColors';

const SUPORTE_DEPARTMENT_ID = 'dea51138-49e4-45b0-a491-fb07a5fad479';

export function useConversations() {
  const [loading, setLoading] = useState(false);

  const finalizeConversation = useCallback(async (
    conversationId: string,
    conversation?: Conversation,
    userId?: string,
    userName?: string,
    agentStatus?: string
  ) => {
    setLoading(true);
    try {
      // Verificar se a conversa ainda existe antes de finalizar (evita dupla finalização)
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();

      if (!existing) {
        toast({
          title: 'Conversa já finalizada',
          description: 'Esta conversa já foi encerrada por outro usuário.',
        });
        return false;
      }

      // Fetch protocol + conversation data + contact + department + assigned user in parallel
      if (conversation) {
        const [
          { data: convProtocolData },
          { data: convData },
          { data: deptData },
          ...assignedResult
        ] = await Promise.all([
          supabase.from('conversations').select('protocol').eq('id', conversationId).single(),
          supabase.from('conversations').select('contact_id, whatsapp_instance_id').eq('id', conversationId).single(),
          supabase.from('departments').select('name').eq('id', conversation.departmentId).single(),
          ...(conversation.assignedTo
            ? [supabase.from('profiles').select('name').eq('id', conversation.assignedTo).single()]
            : [Promise.resolve({ data: null })]
          ),
        ]);

        const protocol = convProtocolData?.protocol || null;
        const assignedName = (assignedResult[0] as any)?.data?.name || null;

        const { data: freshContact } = await supabase
          .from('contacts')
          .select('name, phone, notes, channel')
          .eq('id', convData?.contact_id || conversation.contact.id)
          .single();

        // Save conversation log - use fresh contact data from DB
        const logData = {
          conversation_id: conversation.id,
          contact_name: freshContact?.name || conversation.contact.name,
          contact_phone: freshContact?.phone || conversation.contact.phone || null,
          department_id: conversation.departmentId,
          department_name: deptData?.name || null,
          assigned_to: conversation.assignedTo || null,
          assigned_to_name: assignedName,
          finalized_by: userId || null,
          finalized_by_name: userName || null,
          agent_status_at_finalization: agentStatus || null,
          messages: conversation.messages.map(m => ({
            id: m.id,
            senderId: m.senderId,
            senderName: m.senderName,
            content: m.content,
            type: m.type,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
            status: m.status,
          })),
          tags: conversation.tags,
          priority: conversation.priority,
          started_at: conversation.createdAt.toISOString(),
          total_messages: conversation.messages.length,
          wait_time: conversation.waitTime || null,
          channel: freshContact?.channel || (conversation as any).channel || 'whatsapp',
          contact_notes: freshContact?.notes || (conversation.contact as any)?.notes || null,
          whatsapp_instance_id: convData?.whatsapp_instance_id || null,
          protocol,
        };

        const { data: insertedLog, error: logError } = await supabase
          .from('conversation_logs')
          .insert([logData])
          .select('id')
          .single();

        if (logError) {
          console.error('Error saving conversation log:', logError);
          // Continue even if log fails - we still want to finalize
        } else if (insertedLog && conversation.departmentId === SUPORTE_DEPARTMENT_ID) {
          // Auto-classify if Suporte department and no taxonomy tag yet
          const hasTaxonomyTag = conversation.tags?.some(t =>
            (SUPORTE_TAXONOMY_TAGS as readonly string[]).includes(t)
          );
          if (!hasTaxonomyTag) {
            // Fire-and-forget - don't block the agent
            supabase.functions.invoke('classify-conversation-tags', {
              body: { logIds: [insertedLog.id] }
            }).catch(err => console.error('Auto-classify error:', err));
          }
        }
      } else {
        // No conversation data, just fetch protocol for simple finalization
        const { data: convProtocolData } = await supabase
          .from('conversations')
          .select('protocol')
          .eq('id', conversationId)
          .single();
        // protocol not used without conversation data, but kept for consistency
      }

      // Delete messages first (foreign key constraint)
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      // Delete the conversation
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      toast({
        title: 'Atendimento finalizado',
        description: 'A conversa foi finalizada e salva no histórico.',
      });

      return true;
    } catch (error: any) {
      console.error('Error finalizing conversation:', error);
      toast({
        title: 'Erro ao finalizar',
        description: error.message || 'Não foi possível finalizar a conversa.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const setPendingConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status: 'pendente', updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) throw error;

      toast({
        title: 'Status atualizado',
        description: 'Conversa marcada como pendente.',
      });

      return true;
    } catch (error: any) {
      console.error('Error setting pending:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const assumeConversation = useCallback(async (
    conversationId: string, 
    userId: string,
    departmentId?: string,
    waitTimeSeconds?: number
  ) => {
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = { 
        status: 'em_atendimento', 
        assigned_to: userId,
        robot_transferred: false,
        robot_lock_until: null, // Resetar lock para permitir robôs no futuro
        updated_at: new Date().toISOString() 
      };
      
      if (departmentId) {
        updateData.department_id = departmentId;
      }

      // Salvar o tempo de espera se fornecido
      if (waitTimeSeconds !== undefined) {
        updateData.wait_time = waitTimeSeconds;
      }

      const { error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (error) throw error;

      toast({
        title: 'Atendimento iniciado',
        description: 'Você assumiu esta conversa.',
      });

      return true;
    } catch (error: any) {
      console.error('Error assuming conversation:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível assumir a conversa.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    finalizeConversation,
    setPendingConversation,
    assumeConversation,
  };
}
