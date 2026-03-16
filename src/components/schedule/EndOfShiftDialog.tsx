import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Clock, MessageSquare, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface EndOfShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minutesRemaining: number;
  pendingConversationsCount: number;
  onChoiceConfirmed: () => void;
}

type ConversationAction = 'finished' | 'waiting' | 'transfer';

export function EndOfShiftDialog({
  open,
  onOpenChange,
  minutesRemaining,
  pendingConversationsCount,
  onChoiceConfirmed,
}: EndOfShiftDialogProps) {
  const { user } = useAuth();
  const [selectedAction, setSelectedAction] = useState<ConversationAction>('finished');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmChoice = async () => {
    if (!user?.id) return;

    setIsProcessing(true);
    try {
      if (selectedAction === 'transfer') {
        const { error } = await supabase
          .from('conversations')
          .update({
            status: 'em_fila',
            assigned_to: null,
            wait_time: 0,
            created_at: new Date().toISOString(),
          })
          .eq('assigned_to', user.id)
          .eq('status', 'em_atendimento');

        if (error) throw error;
        toast.success('Conversas transferidas para a fila');
      } else if (selectedAction === 'finished') {
        toast.info('Conversas marcadas como finalizadas');
      } else if (selectedAction === 'waiting') {
        toast.info('Aguardando resposta dos clientes');
      }

      onChoiceConfirmed();
      onOpenChange(false);
    } catch (error) {
      console.error('Error processing end of shift:', error);
      toast.error('Erro ao processar fim de escala');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndShift = () => {
    onChoiceConfirmed();
    onOpenChange(false);
    toast.info('Você ficará offline quando sua escala terminar');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            Sua escala termina em {minutesRemaining} minuto{minutesRemaining !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            {pendingConversationsCount > 0 ? (
              <span className="flex items-center gap-2 mt-2">
                <MessageSquare className="h-4 w-4" />
                Você ainda possui {pendingConversationsCount} conversa{pendingConversationsCount !== 1 ? 's' : ''} em atendimento.
              </span>
            ) : (
              'Você não possui conversas em atendimento.'
            )}
          </DialogDescription>
        </DialogHeader>

        {pendingConversationsCount > 0 && (
          <div className="py-4">
            <p className="text-sm font-medium mb-3">O que deseja fazer com suas conversas?</p>
            <RadioGroup
              value={selectedAction}
              onValueChange={(value) => setSelectedAction(value as ConversationAction)}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="finished" id="finished" />
                <Label htmlFor="finished" className="flex-1 cursor-pointer">
                  Finalizei todas as conversas
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="waiting" id="waiting" />
                <Label htmlFor="waiting" className="flex-1 cursor-pointer">
                  Estou aguardando resposta que pode demorar
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="transfer" id="transfer" />
                <Label htmlFor="transfer" className="flex-1 cursor-pointer flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Transferir conversas para a fila do suporte
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleEndShift}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Não, encerrar no horário
          </Button>
          {pendingConversationsCount > 0 && (
            <Button
              onClick={handleConfirmChoice}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              Confirmar Escolha
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
