import { useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Building2,
  Clock,
  ArrowRightLeft,
  MapPin,
  CheckCircle,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Conversation } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { TransferDialog } from '@/components/chat/TransferDialog';
import { useConversations } from '@/hooks/useConversations';
import { useContacts } from '@/hooks/useContacts';
import { EditableName } from '@/components/chat/EditableName';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { extractRealPhone, formatPhoneForDisplay, getContactDisplayName, extractCidade, extractInstagramId } from '@/lib/phoneUtils';
import { getTagColorClasses } from '@/lib/tagColors';

interface ContactDetailsProps {
  conversation: Conversation | null;
}

export function ContactDetails({ conversation }: ContactDetailsProps) {
  const { departments, users, user, setSelectedConversation, setConversations, refetchConversations } = useApp();
  const [transferOpen, setTransferOpen] = useState(false);
  const { finalizeConversation, setPendingConversation, loading } = useConversations();
  const { updateContactName } = useContacts();
  
  const [sectionsOpen, setSectionsOpen] = useState({
    acoes: true,
    contato: true,
    conversa: true,
    notas: true
  });

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Handler para atualizar nome do contato
  const handleUpdateContactName = async (newName: string): Promise<boolean> => {
    if (!conversation) return false;
    
    const success = await updateContactName(conversation.contact.id, newName);
    if (success) {
      // Atualizar estado local
      setConversations(prev => prev.map(c => 
        c.contact.id === conversation.contact.id 
          ? { ...c, contact: { ...c.contact, name: newName } }
          : c
      ));
      setSelectedConversation(prev => 
        prev && prev.contact.id === conversation.contact.id
          ? { ...prev, contact: { ...prev.contact, name: newName } }
          : prev
      );
    }
    return success;
  };

  const [finalizing, setFinalizing] = useState(false);

  const handleFinalize = async () => {
    if (!conversation || !user || finalizing) return;
    setFinalizing(true);
    try {
    const success = await finalizeConversation(
      conversation.id, 
      conversation, 
      user.id, 
      user.name,
      user.status
    );
    if (success) {
      setConversations(prev => prev.filter(c => c.id !== conversation.id));
      setSelectedConversation(null);
      refetchConversations();
    }
    } finally {
      setFinalizing(false);
    }
  };

  const handlePending = async () => {
    if (!conversation) return;
    const success = await setPendingConversation(conversation.id);
    if (success) {
      setConversations(prev => prev.map(c => 
        c.id === conversation.id ? { ...c, status: 'pendente' } : c
      ));
    }
  };

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center bg-card text-muted-foreground p-4">
        <p className="text-sm text-center">Selecione uma conversa para ver os detalhes</p>
      </div>
    );
  }

  const department = departments.find(d => d.id === conversation.departmentId);
  const assignedUser = users.find(u => u.id === conversation.assignedTo);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const SectionHeader = ({ 
    title, 
    isOpen, 
    onToggle 
  }: { 
    title: string; 
    isOpen: boolean; 
    onToggle: () => void;
  }) => (
    <CollapsibleTrigger asChild>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-secondary/50 transition-colors"
      >
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          {title}
        </h4>
        <ChevronDown className={cn(
          "w-4 h-4 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </button>
    </CollapsibleTrigger>
  );

  return (
    <div className="h-full flex flex-col bg-card border-l border-border overflow-y-auto scrollbar-thin">
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} conversation={conversation} />
      
      {/* Contact Header - Always visible */}
      <div className="p-6 text-center border-b border-border">
        <Avatar className="h-20 w-20 mx-auto mb-3">
          <AvatarImage src={conversation.contact.avatar} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xl">
          {getInitials(getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes))}
          </AvatarFallback>
        </Avatar>
        <EditableName
          value={getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}
          onSave={handleUpdateContactName}
          className="font-semibold text-lg text-foreground justify-center"
          inputClassName="w-48 text-center"
        />
        {(() => {
          const channel = conversation.channel || conversation.contact.channel;
          if (channel === 'machine') {
            const cidade = extractCidade(conversation.contact.notes);
            return <p className="text-sm text-muted-foreground">{cidade ? `📍 ${cidade}` : 'Machine'}</p>;
          }
          if (channel === 'instagram') {
            const igId = extractInstagramId(conversation.contact.phone);
            return <p className="text-sm text-muted-foreground">{igId ? `@${igId}` : 'Instagram'}</p>;
          }
          return (
            <p className="text-sm text-muted-foreground">
              {formatPhoneForDisplay(extractRealPhone(conversation.contact.phone, conversation.contact.notes))}
            </p>
          );
        })()}
        {conversation.tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {conversation.tags.map((tag) => (
              <span 
                key={tag}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border",
                  getTagColorClasses(tag)
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions - Collapsible */}
      <Collapsible open={sectionsOpen.acoes} onOpenChange={() => toggleSection('acoes')}>
        <div className="border-b border-border">
          <SectionHeader title="Ações Rápidas" isOpen={sectionsOpen.acoes} onToggle={() => toggleSection('acoes')} />
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setTransferOpen(true)}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-1.5" />
                  Transferir
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full"
                  onClick={handlePending}
                  disabled={loading}
                >
                  <Clock className="w-4 h-4 mr-1.5" />
                  Pendente
                </Button>
                <Button 
                  variant="success" 
                  size="sm" 
                  className="w-full col-span-2"
                  onClick={handleFinalize}
                  disabled={loading || finalizing}
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Finalizar Atendimento
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Contact Info - Collapsible */}
      <Collapsible open={sectionsOpen.contato} onOpenChange={() => toggleSection('contato')}>
        <div className="border-b border-border">
          <SectionHeader title="Informações do Contato" isOpen={sectionsOpen.contato} onToggle={() => toggleSection('contato')} />
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="text-sm text-foreground">
                    {getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}
                  </p>
                </div>
              </div>
              {(() => {
                const channel = conversation.channel || conversation.contact.channel;
                if (channel === 'machine') {
                  const cidade = extractCidade(conversation.contact.notes);
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cidade</p>
                        <p className={`text-sm ${cidade ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                          {cidade || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (channel === 'instagram') {
                  const igId = extractInstagramId(conversation.contact.phone);
                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                        <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Instagram</p>
                        <p className="text-sm text-foreground">
                          {igId ? `@${igId}` : 'Não disponível'}
                        </p>
                      </div>
                    </div>
                  );
                }
                // WhatsApp / web / default
                const realPhone = extractRealPhone(conversation.contact.phone, conversation.contact.notes);
                const formattedPhone = formatPhoneForDisplay(realPhone);
                return (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className={`text-sm ${formattedPhone ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                        {formattedPhone || 'Não disponível'}
                      </p>
                    </div>
                  </div>
                );
              })()}
              {conversation.contact.tags && conversation.contact.tags.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center mt-0.5">
                    <span className="text-xs">🏷️</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tags</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {conversation.contact.tags.map(tag => (
                        <span key={tag} className={cn("text-xs px-2 py-0.5 rounded-full border", getTagColorClasses(tag))}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Conversation Info - Collapsible */}
      <Collapsible open={sectionsOpen.conversa} onOpenChange={() => toggleSection('conversa')}>
        <div className="border-b border-border">
          <SectionHeader title="Dados da Conversa" isOpen={sectionsOpen.conversa} onToggle={() => toggleSection('conversa')} />
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Departamento</p>
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: department?.color }}
                    />
                    <p className="text-sm text-foreground">{department?.name}</p>
                  </div>
                </div>
              </div>

              {assignedUser && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Atendente</p>
                    <p className="text-sm text-foreground">{assignedUser.name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Iniciada em</p>
                  <p className="text-sm text-foreground">{formatDate(conversation.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prioridade</p>
                  <p className={cn(
                    "text-sm font-medium capitalize",
                    conversation.priority === 'urgent' && "text-destructive",
                    conversation.priority === 'high' && "text-warning",
                    conversation.priority === 'normal' && "text-foreground",
                    conversation.priority === 'low' && "text-muted-foreground"
                  )}>
                    {conversation.priority === 'urgent' && 'Urgente'}
                    {conversation.priority === 'high' && 'Alta'}
                    {conversation.priority === 'normal' && 'Normal'}
                    {conversation.priority === 'low' && 'Baixa'}
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Notes - Collapsible */}
      {conversation.contact.notes && (
        <Collapsible open={sectionsOpen.notas} onOpenChange={() => toggleSection('notas')}>
          <div>
            <SectionHeader title="Notas" isOpen={sectionsOpen.notas} onToggle={() => toggleSection('notas')} />
            <CollapsibleContent>
              <div className="px-4 pb-4">
                <div className="p-3 rounded-lg bg-secondary">
                  <p className="text-sm text-foreground">{conversation.contact.notes}</p>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
