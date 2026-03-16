import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, User, UserPlus, Phone, Mail, Check, ChevronsUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { sdrApi } from '@/services/sdrApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const formSchema = z.object({
  contact_id: z.string().optional(),
  new_name: z.string().optional(),
  new_phone: z.string().optional(),
  title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres'),
  value: z.coerce.number().min(0).default(0),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.string().optional(),
  due_date: z.date().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDealCreated: () => void;
}

export function SDRCreateDealModal({ open, onOpenChange, onDealCreated }: Props) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing');
  const [contactOpen, setContactOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: 'Venda de Franquia', value: 20000, priority: 'medium', tags: '' },
  });

  useEffect(() => {
    if (open) sdrApi.fetchContacts().then(setContacts);
  }, [open]);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      let contactId = data.contact_id;

      if (contactMode === 'new' && data.new_name && data.new_phone) {
        const { data: nc, error } = await supabase.from('contacts').insert({ name: data.new_name, phone: data.new_phone }).select('id').single();
        if (error || !nc) { toast.error('Erro ao criar contato'); setIsSubmitting(false); return; }
        contactId = nc.id;
        toast.success('Contato criado!');
      }

      const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

      const deal = await sdrApi.createDeal({
        contact_id: contactId,
        title: data.title,
        value: data.value,
        priority: data.priority,
        tags,
        due_date: data.due_date ? format(data.due_date, 'yyyy-MM-dd') : undefined,
      });

      // Link deal to WhatsApp conversation if contact has a phone
      if (contactId && deal?.id) {
        try {
          await sdrApi.linkDealToConversation(deal.id, contactId);
        } catch (e) {
          console.error('Error linking deal to conversation:', e);
        }
      }

      toast.success('Lead criado!');
      form.reset();
      onOpenChange(false);
      onDealCreated();
    } catch { toast.error('Erro ao criar lead'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Criar Novo Lead</DialogTitle>
          <DialogDescription>Preencha para criar um lead no pipeline.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={contactMode} onValueChange={v => setContactMode(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing"><User className="w-4 h-4 mr-2" />Contato Existente</TabsTrigger>
                <TabsTrigger value="new"><UserPlus className="w-4 h-4 mr-2" />Novo Contato</TabsTrigger>
              </TabsList>
              <TabsContent value="existing" className="mt-4">
                <FormField control={form.control} name="contact_id" render={({ field }) => {
                  const selectedContact = contacts.find(c => c.id === field.value);
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Contato</FormLabel>
                      <Popover open={contactOpen} onOpenChange={setContactOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" role="combobox" aria-expanded={contactOpen} className={cn('w-full justify-between font-normal', !field.value && 'text-muted-foreground')}>
                              {selectedContact ? `${selectedContact.name}${selectedContact.phone ? ` (${selectedContact.phone})` : ''}` : 'Selecione um contato'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar por nome ou telefone..." />
                            <CommandList>
                              <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                              <CommandGroup>
                                {contacts.map(c => (
                                  <CommandItem key={c.id} value={`${c.name} ${c.phone || ''}`} onSelect={() => { field.onChange(c.id); setContactOpen(false); }}>
                                    <Check className={cn('mr-2 h-4 w-4', field.value === c.id ? 'opacity-100' : 'opacity-0')} />
                                    {c.name} {c.phone && `(${c.phone})`}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }} />
              </TabsContent>
              <TabsContent value="new" className="mt-4 space-y-4">
                <FormField control={form.control} name="new_name" render={({ field }) => (
                  <FormItem><FormLabel>Nome *</FormLabel><FormControl><Input placeholder="Nome do contato" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="new_phone" render={({ field }) => (
                  <FormItem><FormLabel>Telefone *</FormLabel><FormControl><Input placeholder="+55 11 99999-9999" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </TabsContent>
            </Tabs>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Informações do Lead</h3>
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Título *</FormLabel><FormControl><Input placeholder="Ex: Venda Premium" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="value" render={({ field }) => (
                  <FormItem><FormLabel>Valor (R$)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem><FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="tags" render={({ field }) => (
                <FormItem><FormLabel>Tags (separar por vírgula)</FormLabel><FormControl><Input placeholder="vip, urgente" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data prevista</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                          {field.value ? format(field.value, 'dd/MM/yyyy') : 'Selecionar data'}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Criando...' : 'Criar Lead'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
