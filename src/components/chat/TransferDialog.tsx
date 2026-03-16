import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Bot, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useRobots } from '@/hooks/useRobots';
import type { Conversation } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
}

export function TransferDialog({ open, onOpenChange, conversation }: TransferDialogProps) {
  const { departments, users, user, setConversations, setSelectedConversation, refetchConversations } = useApp();
  const { robots } = useRobots();

  const [toDepartmentId, setToDepartmentId] = useState(conversation.departmentId);
  const [toUserId, setToUserId] = useState<string>('none');
  const [openCombobox, setOpenCombobox] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToDepartmentId(conversation.departmentId);
    setToUserId('none');
    setReason('');
  }, [open, conversation.id, conversation.departmentId]);

  const availableUsers = useMemo(() => {
    return users.filter((u) => u.departments.includes(toDepartmentId));
  }, [users, toDepartmentId]);

  // Robôs ativos para o departamento selecionado
  const availableRobots = useMemo(() => {
    const convChannel = conversation.channel || 'whatsapp';
    return robots.filter(r => 
      r.departments.includes(toDepartmentId) &&
      r.channels.includes(convChannel as any)
    );
  }, [robots, toDepartmentId, conversation.channel]);

  const handleConfirm = async () => {
    const trimmedReason = reason.trim();
    if (!toDepartmentId) {
      toast.error('Selecione um departamento');
      return;
    }
    if (!trimmedReason) {
      toast.error('Informe o motivo da transferência');
      return;
    }

    setIsSubmitting(true);
    const now = new Date();
    
    // Detectar se é transferência para robô
    const isRobotTransfer = toUserId.startsWith('robot:');
    const isUserTransfer = toUserId !== 'none' && !isRobotTransfer;
    const targetId = toUserId.replace(/^(user:|robot:)/, '');

    try {
      const toDept = departments.find(d => d.id === toDepartmentId);
      
      if (isRobotTransfer) {
        // Transferir para robô
        const toRobot = robots.find(r => r.id === targetId);
        
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            department_id: toDepartmentId,
            assigned_to: null,
            assigned_to_robot: targetId,
            status: 'em_atendimento',
            wait_time: 0,
            robot_transferred: false,
            robot_lock_until: null, // Resetar lock para robô processar imediatamente
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', conversation.id);

        if (updateError) throw updateError;

        // Buscar última mensagem do cliente, dados de conexão e sdr_deal_id
        const [lastMsgResult, connectionResult, contactResult, sdrResult] = await Promise.all([
          supabase.from('messages')
            .select('content')
            .eq('conversation_id', conversation.id)
            .neq('sender_name', 'SYSTEM')
            .is('sender_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('whatsapp_connections')
            .select('connection_type, phone_number_id')
            .eq('department_id', toDepartmentId)
            .eq('status', 'connected')
            .maybeSingle(),
          supabase.from('contacts')
            .select('phone, channel')
            .eq('id', conversation.contact.id)
            .maybeSingle(),
          supabase.from('conversations')
            .select('sdr_deal_id')
            .eq('id', conversation.id)
            .single(),
        ]);

        const lastMessage = lastMsgResult.data?.content || '';
        const contactPhone = contactResult.data?.phone || '';
        const connectionType = connectionResult.data?.connection_type as 'baileys' | 'meta_api' | undefined;
        const phoneNumberId = connectionResult.data?.phone_number_id;
        const sdrDealId = sdrResult.data?.sdr_deal_id;

        // Log transfer para robô
        await supabase.from('transfer_logs').insert({
          conversation_id: conversation.id,
          from_user_id: user?.id,
          from_user_name: user?.name,
          to_department_id: toDepartmentId,
          to_department_name: toDept?.name,
          to_robot_id: targetId,
          to_robot_name: toRobot?.name,
          reason: trimmedReason,
          status: 'completed',
        });

        // Acionar a função correta: sdr-robot-chat para deals SDR, robot-chat para robôs normais
        if (sdrDealId) {
          supabase.functions.invoke('sdr-robot-chat', {
            body: {
              conversationId: conversation.id,
              dealId: sdrDealId,
              message: lastMessage,
              contactPhone,
              connectionType,
              phoneNumberId,
              isTransfer: true,
            },
          }).catch(err => console.error('Erro ao acionar sdr-robot-chat:', err));
        } else {
          supabase.functions.invoke('robot-chat', {
            body: {
              robotId: targetId,
              conversationId: conversation.id,
              message: lastMessage,
              contactPhone,
              connectionType,
              phoneNumberId,
              isTransfer: true,
            },
          }).catch(err => console.error('Erro ao acionar robot-chat:', err));
        }
      } else {
        // Transferência normal (usuário ou fila)
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            department_id: toDepartmentId,
            assigned_to: isUserTransfer ? targetId : null,
            assigned_to_robot: null, // Limpar robô anterior
            status: 'em_fila',
            wait_time: 0,
            robot_transferred: false, // Resetar flag para permitir robôs
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', conversation.id);

        if (updateError) throw updateError;

        // Log transfer para usuário/fila
        const toUser = users.find(u => u.id === targetId);
        
        await supabase.from('transfer_logs').insert({
          conversation_id: conversation.id,
          from_user_id: user?.id,
          from_user_name: user?.name,
          to_department_id: toDepartmentId,
          to_department_name: toDept?.name,
          to_user_id: isUserTransfer ? targetId : null,
          to_user_name: isUserTransfer ? toUser?.name : null,
          reason: trimmedReason,
          status: 'completed',
        });
      }

      // Inserir mensagem de sistema
      let eventText = '';
      if (isRobotTransfer) {
        const toRobot = robots.find(r => r.id === targetId);
        eventText = `${user?.name} transferiu para 🤖 ${toRobot?.name || 'Agente IA'}`;
      } else if (isUserTransfer) {
        const toUser = users.find(u => u.id === targetId);
        eventText = `${user?.name} transferiu para ${toUser?.name || 'atendente'}`;
      } else {
        eventText = `${user?.name} transferiu para ${toDept?.name || 'departamento'}`;
      }

      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: eventText,
        sender_name: 'SYSTEM',
        sender_id: null,
        message_type: 'system',
        status: 'sent',
      });

      // Se transferiu para robô, inserir mensagem de "assumiu"
      if (isRobotTransfer) {
        const robotName = robots.find(r => r.id === targetId)?.name || 'Agente IA';
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          content: `🤖 ${robotName} assumiu a conversa`,
          sender_name: 'SYSTEM',
          sender_id: null,
          message_type: 'system',
          status: 'sent',
        });
      }

      // Update local state
      const updated: Conversation = {
        ...conversation,
        departmentId: toDepartmentId,
        assignedTo: isUserTransfer ? targetId : undefined,
        assignedToRobot: isRobotTransfer ? targetId : undefined,
        status: isRobotTransfer ? 'em_atendimento' : 'em_fila',
        waitTime: 0,
        createdAt: now,
        updatedAt: now,
      };

      setConversations((prev) => prev.map((c) => (c.id === conversation.id ? updated : c)));
      
      toast.success('Conversa transferida');
      onOpenChange(false);

      // Refetch to ensure sync
      refetchConversations();
    } catch (error) {
      console.error('Erro ao transferir:', error);
      toast.error('Erro ao transferir conversa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Transferir conversa
          </DialogTitle>
          <DialogDescription>
            Você pode transferir para a fila de um departamento ou direcionar para um usuário específico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Departamento</Label>
            <Select value={toDepartmentId} onValueChange={setToDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o departamento" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Enviar para</Label>
            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCombobox}
                  className="w-full justify-between font-normal"
                >
                  {toUserId === 'none'
                    ? 'Fila do departamento'
                    : toUserId.startsWith('robot:')
                      ? (() => { const rb = availableRobots.find(r => r.id === toUserId.replace('robot:', '')); return `🤖 ${rb?.name || 'Agente IA'}${rb && rb.status !== 'active' ? ` (${rb.status === 'paused' ? 'pausado' : 'inativo'})` : ''}`; })()
                      : availableUsers.find(u => u.id === toUserId.replace('user:', ''))?.name || 'Atendente'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar atendente ou robô..." />
                  <CommandList>
                    <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Fila do departamento"
                        onSelect={() => { setToUserId('none'); setOpenCombobox(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", toUserId === 'none' ? "opacity-100" : "opacity-0")} />
                        Fila do departamento
                      </CommandItem>
                    </CommandGroup>
                    {availableUsers.length > 0 && (
                      <CommandGroup heading="Atendentes">
                        {availableUsers.map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.name}
                            onSelect={() => { setToUserId(`user:${u.id}`); setOpenCombobox(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", toUserId === `user:${u.id}` ? "opacity-100" : "opacity-0")} />
                            {u.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {availableRobots.length > 0 && (
                      <CommandGroup heading="🤖 Agentes IA">
                        {availableRobots.map((r) => (
                          <CommandItem
                            key={r.id}
                            value={r.name}
                            onSelect={() => { setToUserId(`robot:${r.id}`); setOpenCombobox(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", toUserId === `robot:${r.id}` ? "opacity-100" : "opacity-0")} />
                            🤖 {r.name}{r.status !== 'active' ? ` (${r.status === 'paused' ? 'pausado' : 'inativo'})` : ''}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: Cliente pediu suporte técnico"
              className="min-h-24"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Transferindo...' : 'Confirmar transferência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
