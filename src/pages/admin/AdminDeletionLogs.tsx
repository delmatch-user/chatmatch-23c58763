import { useState, useEffect } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MainLayout } from '@/components/layout/MainLayout';
import { supabase } from '@/integrations/supabase/client';

interface DeletionLog {
  id: string;
  message_id: string;
  conversation_id: string;
  deleted_by: string;
  deleted_by_name: string;
  reason: string;
  message_content: string | null;
  message_sender_name: string | null;
  message_created_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  deleted_at: string;
}

export default function AdminDeletionLogs() {
  const [logs, setLogs] = useState<DeletionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('message_deletion_logs' as any)
      .select('*')
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar logs de exclusão:', error);
    } else {
      setLogs((data as any[]) || []);
    }
    setLoading(false);
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      log.deleted_by_name.toLowerCase().includes(term) ||
      (log.contact_name?.toLowerCase().includes(term) ?? false) ||
      (log.contact_phone?.toLowerCase().includes(term) ?? false) ||
      log.reason.toLowerCase().includes(term) ||
      (log.message_content?.toLowerCase().includes(term) ?? false)
    );
  });

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

  const truncateContent = (content: string | null, max = 80) => {
    if (!content) return '—';
    // Try to parse JSON attachments
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed[0]?.name) {
        return `[Arquivo: ${parsed[0].name}]`;
      }
    } catch {}
    return content.length > max ? content.substring(0, max) + '...' : content;
  };

  return (
    <MainLayout title="Relatório de Exclusões">
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-semibold text-foreground">
              Mensagens Excluídas ({filteredLogs.length})
            </h2>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por atendente, contato, motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Carregando...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Trash2 className="w-12 h-12 mb-3 opacity-30" />
            <p>Nenhuma exclusão encontrada</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Mensagem Original</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(log.deleted_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {getInitials(log.deleted_by_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{log.deleted_by_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{log.contact_name || '—'}</p>
                        {log.contact_phone && (
                          <p className="text-xs text-muted-foreground">{log.contact_phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-sm text-muted-foreground truncate">
                        {truncateContent(log.message_content)}
                      </p>
                      {log.message_sender_name && (
                        <p className="text-xs text-muted-foreground/70">por {log.message_sender_name}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <p className="text-sm">{log.reason}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
