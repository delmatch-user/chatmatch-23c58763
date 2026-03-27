import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Users, Plus, X, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { extractRealPhone, formatPhoneForDisplay, getContactDisplayName } from '@/lib/phoneUtils';
import { getTagColorClasses, getTagDotColor, PREDEFINED_TAGS } from '@/lib/tagColors';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { EditableName } from '@/components/chat/EditableName';
import { useContacts } from '@/hooks/useContacts';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  avatar_url: string | null;
  created_at: string;
  tags: string[];
}



export default function SDRContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [startingConversation, setStartingConversation] = useState<string | null>(null);

  const navigate = useNavigate();
  const { setSelectedConversation, refetchConversations } = useApp();
  const { user } = useAuth();
  const { updateContactName, updateContactPhone } = useContacts();

  const fetchContacts = async () => {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, phone, notes, avatar_url, created_at, tags')
      .eq('channel', 'whatsapp')
      .order('name', { ascending: true });

    if (data) {
      const filtered = (data as Contact[]).filter(c => {
        const realPhone = extractRealPhone(c.phone ?? undefined, c.notes ?? undefined);
        return realPhone && realPhone.length >= 10;
      });
      setContacts(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();

    const channel = supabase
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        fetchContacts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAddTag = async (contactId: string, tag: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;
    if (contact.tags.includes(tag)) return;

    const updatedTags = [...contact.tags, tag];
    const { error } = await supabase
      .from('contacts')
      .update({ tags: updatedTags })
      .eq('id', contactId);

    if (error) {
      toast.error('Erro ao adicionar tag');
    } else {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags: updatedTags } : c));
      toast.success('Tag adicionada');
    }
  };

  const handleRemoveTag = async (contactId: string, tagToRemove: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    const updatedTags = contact.tags.filter(t => t !== tagToRemove);
    const { error } = await supabase
      .from('contacts')
      .update({ tags: updatedTags })
      .eq('id', contactId);

    if (error) {
      toast.error('Erro ao remover tag');
    } else {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags: updatedTags } : c));
    }
  };

  const handleStartConversation = async (contactId: string) => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    setStartingConversation(contactId);

    try {
      // 1. Check for existing active conversation (same statuses as unique constraint)
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
        .limit(1);

      if (existing && existing.length > 0) {
        await refetchConversations();
        navigate('/conversas', { state: { selectContactId: contactId } });
        toast.success('Conversa existente encontrada');
        return;
      }

      // 2. Get user's department
      const { data: deptData } = await supabase
        .from('profile_departments')
        .select('department_id')
        .eq('profile_id', user.id)
        .limit(1);

      let departmentId = deptData?.[0]?.department_id;

      if (!departmentId) {
        const { data: allDepts } = await supabase
          .from('departments')
          .select('id')
          .limit(1);
        departmentId = allDepts?.[0]?.id;
      }

      if (!departmentId) {
        toast.error('Nenhum departamento disponível');
        return;
      }

      // 3. Get whatsapp connection for routing
      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('phone_number_id')
        .eq('department_id', departmentId)
        .eq('connection_type', 'baileys')
        .in('status', ['connected', 'active'])
        .limit(1)
        .maybeSingle();

      // 4. Create new conversation
      const { error } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          department_id: departmentId,
          status: 'em_atendimento',
          assigned_to: user.id,
          channel: 'whatsapp',
          whatsapp_instance_id: connection?.phone_number_id || null,
        });

      if (error) {
        console.error('Error creating conversation:', error);
        const errStr = [String(error.code || ''), String(error.message || ''), JSON.stringify(error)].join(' ').toLowerCase();
        const isDup = errStr.includes('23505') || errStr.includes('unique') || errStr.includes('duplicate') || errStr.includes('active_contact');
        
        if (isDup) {
          // Buscar quem está com a conversa
          const { data: activeConv } = await supabase
            .from('conversations')
            .select('id, assigned_to, status')
            .eq('contact_id', contactId)
            .in('status', ['em_fila', 'em_atendimento', 'pendente', 'transferida'])
            .maybeSingle();

          if (activeConv?.assigned_to) {
            const { data: agentProfile } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', activeConv.assigned_to)
              .maybeSingle();
            
            const agentName = agentProfile?.name || 'outro atendente';
            
            if (activeConv.assigned_to === user?.id) {
              toast.info('Você já possui uma conversa ativa com este contato');
            } else {
              toast.warning(`Este contato já está em atendimento com ${agentName}`);
            }
          } else if (activeConv) {
            toast.info('Este contato já está na fila de atendimento');
          } else {
            toast.info('Já existe uma conversa ativa para este contato');
          }
          
          await refetchConversations();
          navigate('/conversas', { state: { selectContactId: contactId } });
          return;
        }
        toast.error('Erro ao criar conversa');
        return;
      }

      await refetchConversations();
      navigate('/conversas', { state: { selectContactId: contactId } });
      toast.success('Conversa iniciada');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao iniciar conversa');
    } finally {
      setStartingConversation(null);
    }
  };

  const filtered = contacts.filter(c => {
    const t = searchTerm.toLowerCase();
    const displayName = getContactDisplayName(c.name, c.phone ?? undefined, c.notes ?? undefined);
    const realPhone = extractRealPhone(c.phone ?? undefined, c.notes ?? undefined) || '';
    const formattedPhone = formatPhoneForDisplay(realPhone);
    const tagsMatch = c.tags.some(tag => tag.toLowerCase().includes(t));
    return displayName.toLowerCase().includes(t) || realPhone.includes(t) || formattedPhone.includes(t) || tagsMatch;
  });

  return (
    <MainLayout>
      <div className="p-3 sm:p-6 lg:p-8 h-full overflow-y-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Contatos</h2>
            <p className="text-sm text-muted-foreground mt-1">Contatos do WhatsApp sincronizados automaticamente.</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-8 bg-secondary/50 p-2 rounded-xl border border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar por nome, telefone ou tag..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-xl overflow-hidden min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-80"><Loader2 className="h-10 w-10 animate-spin text-primary mb-3" /><span className="text-sm text-muted-foreground">Carregando...</span></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-muted-foreground"><Users className="w-12 h-12 mb-4 opacity-50" /><p className="text-lg font-medium">Nenhum contato encontrado</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary text-muted-foreground border-b border-border font-medium text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Nome</th>
                    <th className="px-6 py-4">Telefone</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4">Adicionado em</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(c => {
                    const displayName = getContactDisplayName(c.name, c.phone ?? undefined, c.notes ?? undefined);
                    const realPhone = extractRealPhone(c.phone ?? undefined, c.notes ?? undefined);
                    const formattedPhone = formatPhoneForDisplay(realPhone);
                    return (
                      <tr key={c.id} className="hover:bg-secondary/40 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={c.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {displayName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <EditableName
                              value={displayName}
                              onSave={(newName) => updateContactName(c.id, newName)}
                              className="font-semibold"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          <EditableName
                            value={realPhone || ''}
                            onSave={(newPhone) => updateContactPhone(c.id, newPhone)}
                            disabled={!realPhone}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {c.tags.map(tag => (
                              <Badge key={tag} variant="outline" className={`text-xs gap-1 pr-1 ${getTagColorClasses(tag)}`}>
                                {tag}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveTag(c.id, tag); }}
                                  className="ml-0.5 hover:text-destructive transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
                            ))}
                            <Popover open={openPopoverId === c.id} onOpenChange={(open) => setOpenPopoverId(open ? c.id : null)}>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full">
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" align="start">
                                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Adicionar tag</p>
                                <div className="flex flex-col gap-1">
                                  {PREDEFINED_TAGS.map(tag => {
                                    const alreadyAdded = c.tags.includes(tag);
                                    return (
                                      <button
                                        key={tag}
                                        disabled={alreadyAdded}
                                        onClick={() => { handleAddTag(c.id, tag); setOpenPopoverId(null); }}
                                        className="text-left px-2 py-1.5 rounded-md text-sm hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                      >
                                        <span className={`w-2 h-2 rounded-full ${getTagDotColor(tag)}`} />
                                        {tag}
                                      </button>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="px-6 py-4 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary"
                                  disabled={startingConversation === c.id}
                                  onClick={() => handleStartConversation(c.id)}
                                >
                                  {startingConversation === c.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <MessageSquare className="w-4 h-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Iniciar conversa</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
