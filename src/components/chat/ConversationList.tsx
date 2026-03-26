import { useState } from 'react';
import { Search, Clock, Hash, Users, MessageSquare, Phone, Bot, Smartphone, Wifi } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Conversation, ConversationStatus } from '@/types';
import { cn } from '@/lib/utils';
import { getTagColorClasses } from '@/lib/tagColors';
import { extractRealPhone, formatPhoneForDisplay, getContactDisplayName, phoneMatchesBr, getInstagramDisplayHandle } from '@/lib/phoneUtils';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRobots } from '@/hooks/useRobots';
import { toast } from 'sonner';

interface WhatsAppConnection {
  id: string;
  connection_type: string;
  phone_number_id: string;
  phone_display: string | null;
  name: string | null;
  department_id: string | null;
  status: string;
}

// Ícone do Instagram como SVG
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

// Componente para o ícone do canal
const ChannelIcon = ({ channel }: { channel?: string }) => {
  switch (channel) {
    case 'instagram':
      return (
        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <InstagramIcon className="w-2.5 h-2.5 text-white" />
        </div>
      );
    case 'machine':
      return (
        <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
          <Bot className="w-2.5 h-2.5 text-white" />
        </div>
      );
    case 'whatsapp':
    default:
      return (
        <div className="w-4 h-4 rounded-full bg-[#25D366] flex items-center justify-center">
          <MessageSquare className="w-2.5 h-2.5 text-white" />
        </div>
      );
  }
};

const statusColors: Record<ConversationStatus, string> = {
  em_fila: 'bg-warning/20 text-warning',
  em_atendimento: 'bg-success/20 text-success',
  transferida: 'bg-blue-500/20 text-blue-400',
  finalizada: 'bg-muted text-muted-foreground',
  pendente: 'bg-purple-500/20 text-purple-400',
};

const statusLabels: Record<ConversationStatus, string> = {
  em_fila: 'Na Fila',
  em_atendimento: 'Em Atendimento',
  transferida: 'Transferida',
  finalizada: 'Finalizada',
  pendente: 'Pendente',
};

interface ConversationListProps {
  conversations: Conversation[];
  showFilter?: boolean;
}

// Helper functions
const isPhoneNumber = (term: string) => {
  const cleaned = term.replace(/\D/g, '');
  return cleaned.length >= 8 && cleaned.length <= 15;
};

const formatPhoneDisplay = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
};

// Formatar preview da última mensagem para exibir labels de mídia
const formatLastMessagePreview = (content?: string, messageType?: string): string => {
  if (!content) return 'Sem mensagens';
  
  // Verificar se é uma mídia não disponível
  if (content === '[Mídia não disponível]') {
    return '📎 Mídia';
  }
  
  // Detectar JSON de attachment
  if (content.startsWith('[{"') || content.startsWith('{"')) {
    try {
      const parsed = content.startsWith('[') ? JSON.parse(content) : [JSON.parse(content)];
      const attachment = parsed[0];
      const type = attachment?.type || '';
      
      if (type.startsWith('audio/') || type.includes('ogg') || type.includes('opus')) {
        return '🎤 Mensagem de voz';
      }
      if (type.startsWith('image/')) {
        return '📷 Imagem';
      }
      if (type.startsWith('video/')) {
        return '🎬 Vídeo';
      }
      if (type.startsWith('application/') || type.includes('document')) {
        return '📄 Documento';
      }
      return '📎 Arquivo';
    } catch {
      // Se não for JSON válido, continuar
    }
  }
  
  // Detectar URLs de mídia diretas
  if (content.startsWith('http://') || content.startsWith('https://')) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('.ogg') || lowerContent.includes('.opus') || 
        lowerContent.includes('.mp3') || lowerContent.includes('.m4a') ||
        lowerContent.includes('.webm') || lowerContent.includes('audio')) {
      return '🎤 Mensagem de voz';
    }
    if (lowerContent.includes('.jpg') || lowerContent.includes('.jpeg') || 
        lowerContent.includes('.png') || lowerContent.includes('.webp') ||
        lowerContent.includes('.gif') || lowerContent.includes('image')) {
      return '📷 Imagem';
    }
    if (lowerContent.includes('.mp4') || lowerContent.includes('.mov') || 
        lowerContent.includes('.avi') || lowerContent.includes('video')) {
      return '🎬 Vídeo';
    }
    if (lowerContent.includes('.pdf') || lowerContent.includes('.doc') ||
        lowerContent.includes('.xls') || lowerContent.includes('document')) {
      return '📄 Documento';
    }
    return '📎 Arquivo';
  }
  
  // Texto normal - truncar se muito longo
  return content.length > 50 ? content.substring(0, 50) + '...' : content;
};

export function ConversationList({ 
  conversations, 
  showFilter = true
}: ConversationListProps) {
  const { selectedConversation, setSelectedConversation, departments, users, refetchConversations, user: appUser } = useApp();
  const { user, isAdmin, isSupervisor } = useAuth();
  const { robots } = useRobots();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'em_atendimento' | 'transferida' | 'nao_lida'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [robotFilter, setRobotFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [myConvsOnly, setMyConvsOnly] = useState(false);
  const [showConnectionPicker, setShowConnectionPicker] = useState(false);
  const [availableConnections, setAvailableConnections] = useState<WhatsAppConnection[]>([]);

  const showAdvancedFilters = isAdmin || isSupervisor;

  // Função para obter nome do atendente
  const getAttendantName = (userId: string) => {
    const attendant = users.find(u => u.id === userId);
    if (!attendant) return null;
    return attendant.name.split(' ')[0]; // Primeiro nome
  };

  // Obter departamentos do usuário atual diretamente do AppContext
  const userDepartments = appUser?.departments || [];

  // Verificar se busca é um número e se já existe
  const cleanedSearch = searchTerm.replace(/\D/g, '');
  const searchIsPhone = isPhoneNumber(searchTerm);
  const phoneAlreadyExists = searchIsPhone && cleanedSearch.length >= 10 && conversations.some(
    c => phoneMatchesBr(c.contact.phone, cleanedSearch)
  );

  const createConversation = async (connection?: WhatsAppConnection | null) => {
    if (!user) return;
    setIsCreating(true);
    setShowConnectionPicker(false);
    try {
      // 1. Formatar número
      let formattedPhone = cleanedSearch;
      if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
        formattedPhone = '55' + formattedPhone;
      }

      // ====== BAILEYS: Resolver JID antes de criar contato ======
      let resolvedJid: string | null = null;
      const isBaileysConnection = connection?.connection_type === 'baileys';
      
      if (isBaileysConnection) {
        try {
          const { data: checkResult } = await supabase.functions.invoke('baileys-proxy', {
            body: { action: 'check', phone: formattedPhone, instanceId: connection?.phone_number_id }
          });
          if (checkResult?.success && checkResult?.jid) {
            resolvedJid = checkResult.jid;
            console.log(`[ConversationList] Baileys check: ${formattedPhone} → JID ${resolvedJid}`);
            
            // Tentar encontrar contato existente pelo JID nas notes
            const { data: byJidContacts } = await supabase
              .from('contacts')
              .select('id, phone, notes')
              .ilike('notes', `%jid:${resolvedJid}%`)
              .limit(1);
            
            if (byJidContacts && byJidContacts.length > 0) {
              console.log(`[ConversationList] Contato encontrado por JID: ${byJidContacts[0].id}`);
              // Garantir que o phone está atualizado
              if (!byJidContacts[0].phone) {
                await supabase.from('contacts').update({ phone: formattedPhone }).eq('id', byJidContacts[0].id);
              }
            }
          }
        } catch (checkErr) {
          console.warn('[ConversationList] Baileys check falhou (continuando):', checkErr);
        }
      }

      // 2. Verificar/criar contato usando find_contact_by_phone (cobre variantes de formato)
      const { data: phoneMatches } = await supabase
        .rpc('find_contact_by_phone', { phone_input: formattedPhone });

      let contactId = phoneMatches && phoneMatches.length > 0 ? phoneMatches[0].id : null;
      
      // Se não achou por phone, tentar por JID nas notes (caso Baileys)
      if (!contactId && resolvedJid) {
        const { data: byJidContacts } = await supabase
          .from('contacts')
          .select('id')
          .ilike('notes', `%jid:${resolvedJid}%`)
          .limit(1);
        if (byJidContacts && byJidContacts.length > 0) {
          contactId = byJidContacts[0].id;
          console.log(`[ConversationList] Contato encontrado por JID (fallback): ${contactId}`);
        }
      }
      
      if (!contactId) {
        // Criar contato com JID nas notes se disponível (Baileys)
        const notesValue = resolvedJid ? `jid:${resolvedJid}` : null;
        
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: formattedPhone,
            phone: formattedPhone,
            channel: 'whatsapp',
            notes: notesValue
          })
          .select('id')
          .single();
        
        if (contactError) throw contactError;
        contactId = newContact?.id;
        
        // Se Baileys e temos JID com LID, persistir no whatsapp_lid_map
        if (resolvedJid && resolvedJid.endsWith('@lid')) {
          await supabase.from('whatsapp_lid_map').upsert({
            lid_jid: resolvedJid,
            phone_digits: formattedPhone.replace(/\D/g, ''),
            instance_id: connection?.phone_number_id || 'default',
            updated_at: new Date().toISOString()
          }, { onConflict: 'lid_jid,instance_id' });
          console.log(`[ConversationList] LID map persistido: ${resolvedJid} → ${formattedPhone}`);
        }
      } else if (resolvedJid) {
        // Contato existe mas talvez não tenha o JID — atualizar notes
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('notes')
          .eq('id', contactId)
          .single();
        
        if (existingContact && (!existingContact.notes || !existingContact.notes.includes(resolvedJid))) {
          // APPEND JID em vez de sobrescrever
          const currentNotes = existingContact.notes || '';
          const newNotes = currentNotes ? `${currentNotes} | jid:${resolvedJid}` : `jid:${resolvedJid}`;
          await supabase.from('contacts').update({ notes: newNotes }).eq('id', contactId);
          console.log(`[ConversationList] JID atualizado no contato existente (append): ${resolvedJid}`);
        }
        
        // Persistir LID no mapa se aplicável
        if (resolvedJid.endsWith('@lid')) {
          await supabase.from('whatsapp_lid_map').upsert({
            lid_jid: resolvedJid,
            phone_digits: formattedPhone.replace(/\D/g, ''),
            instance_id: connection?.phone_number_id || 'default',
            updated_at: new Date().toISOString()
          }, { onConflict: 'lid_jid,instance_id' });
        }
      }

      // 3. Verificar se já existe conversa ativa para este contato
      const { data: activeConv } = await supabase
        .from('conversations')
        .select('id, assigned_to')
        .eq('contact_id', contactId)
        .in('status', ['em_fila', 'em_atendimento', 'pendente'])
        .maybeSingle();

      if (activeConv) {
        // Se está com outro atendente, apenas avisar e NÃO abrir
        if (activeConv.assigned_to && activeConv.assigned_to !== user?.id) {
          const { data: agentProfile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', activeConv.assigned_to)
            .maybeSingle();
          
          const agentName = agentProfile?.name || 'outro atendente';
          toast.warning(`Essa conversa está com o ${agentName}`);
          return;
        }

        // Se não tem atendente (fila)
        if (!activeConv.assigned_to) {
          toast.info('Este contato já está na fila de atendimento');
        } else {
          // É o próprio usuário
          toast.info('Você já possui uma conversa ativa com este contato');
        }

        // Abrir a conversa normalmente
        await refetchConversations();
        setSearchTerm('');
        
        const fullConv = conversations.find(c => c.id === activeConv.id);
        if (fullConv) {
          setSelectedConversation(fullConv);
        } else {
          const { data: convData } = await supabase
            .from('conversations')
            .select('*, contact:contacts(*)')
            .eq('id', activeConv.id)
            .maybeSingle();
          
          if (convData) {
            const convObj: any = {
              ...convData,
              contact: convData.contact,
              updatedAt: new Date(convData.updated_at),
              createdAt: new Date(convData.created_at),
            };
            setSelectedConversation(convObj);
          }
        }
        return;
      }

      // 3. Determinar departamento: preferir o da conexão escolhida, senão o do usuário
      const deptFromConnection = connection?.department_id;
      const userDept = deptFromConnection || userDepartments[0] || (departments.length > 0 ? departments[0].id : null);
      
      if (!userDept) {
        toast.error('Aguarde o carregamento dos departamentos');
        return;
      }

      // 4. Criar conversa (incluir whatsapp_instance_id para roteamento correto)
      const { error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          department_id: userDept,
          status: 'em_atendimento',
          assigned_to: user.id,
          channel: 'whatsapp',
          tags: [],
          whatsapp_instance_id: connection?.phone_number_id || null
        });

      if (convError) throw convError;

      // 5. Atualizar lista e limpar busca
      await refetchConversations();
      setSearchTerm('');
      
      toast.success('Conversa iniciada!');
    } catch (error: any) {
      console.error('Erro ao criar conversa:', error);
      
      // Tratar unique constraint - contato já tem conversa ativa
      if (error?.code === '23505' || error?.message?.includes('conversations_unique_active_contact') || error?.message?.includes('duplicate key')) {
        try {
          // Buscar contato pelo telefone da busca
          let searchPhone = cleanedSearch;
          if (!searchPhone.startsWith('55') && searchPhone.length <= 11) {
            searchPhone = '55' + searchPhone;
          }
          const { data: phoneMatches } = await supabase.rpc('find_contact_by_phone', { phone_input: searchPhone });
          const foundContactId = phoneMatches?.[0]?.id;

          // Buscar quem está com a conversa
          const { data: activeConv } = foundContactId ? await supabase
            .from('conversations')
            .select('id, assigned_to, status')
            .eq('contact_id', foundContactId)
            .in('status', ['em_fila', 'em_atendimento', 'pendente'])
            .maybeSingle() : { data: null };

          if (activeConv?.assigned_to) {
            const { data: agentProfile } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', activeConv.assigned_to)
              .maybeSingle();
            
            const agentName = agentProfile?.name || 'outro atendente';
            
            if (activeConv.assigned_to === user?.id) {
              toast.info('Você já possui uma conversa ativa com este contato');
              // Abrir a conversa existente
              await refetchConversations();
              const fullConv = conversations.find(c => c.id === activeConv.id);
              if (fullConv) setSelectedConversation(fullConv);
            } else {
              toast.warning(`Este contato já está em atendimento com ${agentName}`);
            }
          } else if (activeConv) {
            toast.info('Este contato já está na fila de atendimento');
          } else {
            toast.error('Este contato já possui uma conversa ativa');
          }
        } catch (lookupErr) {
          toast.error('Este contato já possui uma conversa ativa');
        }
        return;
      }
      
      toast.error(`Erro ao iniciar conversa: ${error?.message || error?.code || 'desconhecido'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartNewConversation = async () => {
    if (!user || isCreating) return;
    
    // Buscar conexões ativas
    const { data: activeConnections, error } = await supabase
      .from('whatsapp_connections')
      .select('id, connection_type, phone_number_id, phone_display, name, department_id, status')
      .in('status', ['connected', 'active']);

    if (error) {
      console.error('Erro ao buscar conexões:', error);
      // Fallback: criar conversa sem conexão específica
      await createConversation(null);
      return;
    }

    if (!activeConnections || activeConnections.length === 0) {
      // Nenhuma conexão ativa — criar mesmo assim
      await createConversation(null);
      return;
    }

    if (activeConnections.length === 1) {
      // Apenas 1 conexão — criar diretamente
      await createConversation(activeConnections[0] as WhatsAppConnection);
      return;
    }

    // 2+ conexões — mostrar seletor
    setAvailableConnections(activeConnections as WhatsAppConnection[]);
    setShowConnectionPicker(true);
  };

  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchTerm.toLowerCase();
    const searchDigits = searchTerm.replace(/\D/g, '');
    const isNumericSearch = searchDigits.length >= 10 && /^\d+$/.test(searchTerm.replace(/[\s\-\(\)\+]/g, ''));
    const matchesName = !isNumericSearch && conv.contact.name.toLowerCase().includes(searchLower);
    const matchesPhone = isNumericSearch && phoneMatchesBr(conv.contact.phone, searchDigits);
    const matchesSearch = matchesName || matchesPhone;
    
    // Status filter logic
    let matchesStatus = true;
    if (statusFilter === 'nao_lida') {
      const lastMsg = conv.messages[conv.messages.length - 1];
      const isFromContact = lastMsg?.senderId === 'contact';
      matchesStatus = Boolean(lastMsg && isFromContact && lastMsg.read === false);
    } else if (statusFilter !== 'all') {
      matchesStatus = conv.status === statusFilter;
    }

    // Advanced filters (supervisor/admin)
    const matchesAgent = agentFilter === 'all' || conv.assignedTo === agentFilter;
    const matchesRobot = robotFilter === 'all' || conv.assignedToRobot === robotFilter;
    const matchesDepartment = departmentFilter === 'all' || conv.departmentId === departmentFilter;

    // Filtro "Minhas conversas" — usa appUser para consistência com assigned_to do banco
    const matchesMine = !myConvsOnly || conv.assignedTo === appUser?.id;
    
    return matchesSearch && matchesStatus && matchesAgent && matchesRobot && matchesDepartment && matchesMine;
  });

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getDepartment = (deptId: string) => departments.find(d => d.id === deptId);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Conversas</h2>
          <span className="text-xs text-muted-foreground">{filteredConversations.length} conversas</span>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 input-search"
          />
        </div>

        {/* Filters */}
        {showFilter && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <Button 
              variant={statusFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('all')}
              className="text-xs shrink-0"
            >
              Todas
            </Button>
            <Button 
              variant={statusFilter === 'em_atendimento' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('em_atendimento')}
              className="text-xs shrink-0"
            >
              Em Atendimento
            </Button>
            <Button 
              variant={statusFilter === 'transferida' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('transferida')}
              className="text-xs shrink-0"
            >
              Transferida
            </Button>
            <Button 
              variant={statusFilter === 'nao_lida' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('nao_lida')}
              className="text-xs shrink-0"
            >
              Não lida
            </Button>
            {/* Botão "Minhas" — disponível para todos os perfis */}
            <Button
              variant={myConvsOnly ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMyConvsOnly(prev => !prev)}
              className="text-xs shrink-0 gap-1"
            >
              <Users className="w-3 h-3" />
              Minhas
            </Button>
          </div>
        )}

        {/* Robot Filter - Available for all users */}
        <div className="flex gap-1.5 flex-wrap">
          <Select value={robotFilter} onValueChange={setRobotFilter}>
            <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
              <Bot className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Robô" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="all">Todos robôs</SelectItem>
              {robots.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Filters - Supervisor/Admin only */}
        {showAdvancedFilters && (
          <div className="flex gap-1.5 flex-wrap">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Atendente" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">Todos atendentes</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name.split(' ')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                  <SelectValue placeholder="Depto" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">Todos deptos</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Opção de iniciar nova conversa com número digitado */}
        {searchIsPhone && !phoneAlreadyExists && cleanedSearch.length >= 8 && (userDepartments.length > 0 || departments.length > 0) && (
          <Popover open={showConnectionPicker} onOpenChange={setShowConnectionPicker}>
            <PopoverTrigger asChild>
              <div 
                className={cn(
                  "p-4 border-b border-border cursor-pointer transition-all duration-200 hover:bg-secondary/50 bg-primary/5",
                  isCreating && "opacity-50 pointer-events-none"
                )}
                onClick={handleStartNewConversation}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-foreground">
                      Chamar {formatPhoneDisplay(searchTerm)}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {isCreating ? 'Iniciando conversa...' : 'Iniciar nova conversa via WhatsApp'}
                    </p>
                  </div>
                </div>
              </div>
            </PopoverTrigger>
            <PopoverContent 
              className="w-80 p-2 bg-popover border border-border shadow-lg z-50" 
              side="bottom" 
              align="start"
              onInteractOutside={() => setShowConnectionPicker(false)}
            >
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Escolha por qual número chamar:
                </p>
                {availableConnections.map((conn) => {
                  const deptName = departments.find(d => d.id === conn.department_id)?.name;
                  const displayName = conn.name || conn.phone_display || conn.phone_number_id;
                  const isQR = conn.connection_type === 'baileys';
                  return (
                    <button
                      key={conn.id}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-secondary transition-colors text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        createConversation(conn);
                      }}
                    >
                      <div className="h-8 w-8 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                        {isQR ? (
                          <Smartphone className="w-4 h-4 text-[#25D366]" />
                        ) : (
                          <Wifi className="w-4 h-4 text-[#25D366]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                        {deptName && (
                          <p className="text-xs text-muted-foreground truncate">{deptName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {isQR ? 'QR Code' : 'API Oficial'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {filteredConversations.length === 0 && !(searchIsPhone && !phoneAlreadyExists && cleanedSearch.length >= 8) ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Nenhuma conversa encontrada</p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const dept = getDepartment(conversation.departmentId);
            const isSelected = selectedConversation?.id === conversation.id;
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            // Detectar não lida: última mensagem é do contato e ainda não foi lida
            const hasUnread =
              !conversation.isInternal &&
              lastMessage?.senderId === 'contact' &&
              lastMessage.read === false;

            return (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={cn(
                  "p-4 border-b border-border cursor-pointer transition-all duration-200 hover:bg-secondary/50",
                  isSelected && "bg-secondary border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    {conversation.isInternal && conversation.channelId ? (
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Hash className="w-5 h-5 text-primary" />
                      </div>
                    ) : conversation.isInternal ? (
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={conversation.contact.avatar} />
                          <AvatarFallback className="bg-blue-500/20 text-blue-500">
                            {getInitials(conversation.contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                          <Users className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={conversation.contact.avatar} />
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {getInitials(conversation.contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        {/* Ícone do canal no canto inferior direito */}
                        <div className="absolute -bottom-1 -right-1">
                          <ChannelIcon channel={conversation.channel || conversation.contact.channel} />
                        </div>
                      </div>
                    )}
                    {conversation.priority === 'urgent' && !conversation.isInternal && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate">
                          {getContactDisplayName(conversation.contact.name, conversation.contact.phone, conversation.contact.notes)}
                        </span>
                        {hasUnread && (
                          <span
                            className="w-2.5 h-2.5 rounded-full bg-unread shrink-0"
                            aria-label="Conversa não lida"
                          />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatTime(conversation.updatedAt)}
                      </span>
                    </div>

                    {/* Número de telefone ou cidade do franqueado */}
                    {!conversation.isInternal && (() => {
                      if ((conversation.channel || conversation.contact.channel) === 'machine') {
                        const match = conversation.contact.notes?.match(/franqueado:(.+?)(\||$)/);
                        const label = match ? `📍 ${match[1]}` : 'Machine';
                        return <p className="text-xs text-muted-foreground mb-1">{label}</p>;
                      }
                      if ((conversation.channel || conversation.contact.channel) === 'instagram') {
                        const handle = getInstagramDisplayHandle(conversation.contact.phone, conversation.contact.notes);
                        return handle ? <p className="text-xs text-muted-foreground mb-1">{handle}</p> : null;
                      }
                      const realPhone = extractRealPhone(conversation.contact.phone, conversation.contact.notes);
                      const formatted = realPhone ? formatPhoneForDisplay(realPhone) : null;
                      if (!formatted) return null;
                      return <p className="text-xs text-muted-foreground mb-1">{formatted}</p>;
                    })()}

                    <p className="text-sm text-muted-foreground truncate mb-2">
                      {formatLastMessagePreview(lastMessage?.content, lastMessage?.type)}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conversation.isInternal ? (
                        <span className="status-badge text-[10px] bg-blue-500/20 text-blue-400">
                          {conversation.channelId ? 'Canal' : 'Equipe'}
                        </span>
                      ) : (
                        <>
                          <span className={cn("status-badge text-[10px]", statusColors[conversation.status])}>
                            {statusLabels[conversation.status]}
                          </span>
                          
                          {dept && (
                            <span 
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${dept.color}20`, color: dept.color }}
                            >
                              {dept.name}
                            </span>
                          )}

                          {conversation.assignedTo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                              👤 {getAttendantName(conversation.assignedTo) || 'Atendente'}
                            </span>
                          )}
                          {!conversation.assignedTo && conversation.assignedToRobot && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                              {robots.find(r => r.id === conversation.assignedToRobot)?.name?.split(' ')[0] || 'IA'}
                            </span>
                          )}
                        </>
                      )}

                      {conversation.status === 'em_fila' && typeof conversation.waitTime === 'number' && conversation.waitTime > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-warning">
                          <Clock className="w-3 h-3" />
                          {formatWaitTime(conversation.waitTime)}
                        </span>
                      )}

                      {conversation.tags.filter(tag => !['interno', 'equipe', 'internal'].includes(tag)).map((tag) => (
                        <span 
                          key={tag}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full",
                            getTagColorClasses(tag)
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
