import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  HardDrive, 
  Trash2, 
  Search, 
  Image, 
  Video, 
  FileAudio, 
  FileText,
  Loader2,
  RefreshCw,
  Download
} from 'lucide-react';

interface StorageFile {
  id: string;
  name: string;
  bucket: string;
  size: number;
  type: string;
  createdAt: Date;
  url: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'ogg', 'wav', 'm4a', 'webm'].includes(ext)) return 'audio';
  return 'document';
}

function FileTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'image':
      return <Image className="w-4 h-4 text-blue-500" />;
    case 'video':
      return <Video className="w-4 h-4 text-purple-500" />;
    case 'audio':
      return <FileAudio className="w-4 h-4 text-green-500" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function AdminStorage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [bucketFilter, setBucketFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [totalSize, setTotalSize] = useState(0);

  const buckets = ['chat-attachments', 'chat-uploads'];

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const allFiles: StorageFile[] = [];
      
      for (const bucketName of buckets) {
        // List files in root and subdirectories
        const { data: rootFiles, error: rootError } = await supabase.storage
          .from(bucketName)
          .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

        if (rootError) {
          console.error(`Error listing ${bucketName}:`, rootError);
          continue;
        }

        // Process root files (excluding folders)
        for (const file of rootFiles || []) {
          // Skip folders
          if (file.id === null) {
            // It's a folder, list its contents
            const { data: subFiles } = await supabase.storage
              .from(bucketName)
              .list(file.name, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

            for (const subFile of subFiles || []) {
              if (subFile.id !== null) {
                const filePath = `${file.name}/${subFile.name}`;
                const { data: { publicUrl } } = supabase.storage
                  .from(bucketName)
                  .getPublicUrl(filePath);

                allFiles.push({
                  id: `${bucketName}:${filePath}`,
                  name: subFile.name,
                  bucket: bucketName,
                  size: subFile.metadata?.size || 0,
                  type: getFileTypeFromName(subFile.name),
                  createdAt: new Date(subFile.created_at || Date.now()),
                  url: publicUrl,
                });
              }
            }
          } else {
            const { data: { publicUrl } } = supabase.storage
              .from(bucketName)
              .getPublicUrl(file.name);

            allFiles.push({
              id: `${bucketName}:${file.name}`,
              name: file.name,
              bucket: bucketName,
              size: file.metadata?.size || 0,
              type: getFileTypeFromName(file.name),
              createdAt: new Date(file.created_at || Date.now()),
              url: publicUrl,
            });
          }
        }
      }

      // Sort by date descending
      allFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      setFiles(allFiles);
      setTotalSize(allFiles.reduce((sum, f) => sum + f.size, 0));
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error('Erro ao carregar arquivos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || file.type === typeFilter;
    const matchesBucket = bucketFilter === 'all' || file.bucket === bucketFilter;
    return matchesSearch && matchesType && matchesBucket;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleSelectFile = (fileId: string, checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (checked) {
      newSelected.add(fileId);
    } else {
      newSelected.delete(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    
    setDeleting(true);
    try {
      const filesToDelete = files.filter(f => selectedFiles.has(f.id));
      
      // Group by bucket
      const byBucket: Record<string, string[]> = {};
      for (const file of filesToDelete) {
        const [bucket, ...pathParts] = file.id.split(':');
        const path = pathParts.join(':');
        if (!byBucket[bucket]) byBucket[bucket] = [];
        byBucket[bucket].push(path);
      }

      // Delete from each bucket
      for (const [bucket, paths] of Object.entries(byBucket)) {
        const { error } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (error) {
          console.error(`Error deleting from ${bucket}:`, error);
          toast.error(`Erro ao deletar arquivos de ${bucket}`);
        }
      }

      toast.success(`${selectedFiles.size} arquivo(s) deletado(s)`);
      setSelectedFiles(new Set());
      setDeleteDialogOpen(false);
      fetchFiles();
    } catch (error) {
      console.error('Error deleting files:', error);
      toast.error('Erro ao deletar arquivos');
    } finally {
      setDeleting(false);
    }
  };

  const selectedSize = files
    .filter(f => selectedFiles.has(f.id))
    .reduce((sum, f) => sum + f.size, 0);

  const stats = {
    total: files.length,
    images: files.filter(f => f.type === 'image').length,
    videos: files.filter(f => f.type === 'video').length,
    audios: files.filter(f => f.type === 'audio').length,
    documents: files.filter(f => f.type === 'document').length,
  };

  return (
    <MainLayout title="Armazenamento">
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <HardDrive className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
                  <p className="text-xs text-muted-foreground">Total usado</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Image className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.images}</p>
                  <p className="text-xs text-muted-foreground">Imagens</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Video className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.videos}</p>
                  <p className="text-xs text-muted-foreground">Vídeos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <FileAudio className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.audios}</p>
                  <p className="text-xs text-muted-foreground">Áudios</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.documents}</p>
                  <p className="text-xs text-muted-foreground">Documentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Gerenciar Arquivos</CardTitle>
                <CardDescription>
                  {filteredFiles.length} arquivo(s) • {selectedFiles.size} selecionado(s)
                  {selectedFiles.size > 0 && ` (${formatBytes(selectedSize)})`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchFiles}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                {selectedFiles.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={deleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir ({selectedFiles.size})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="image">Imagens</SelectItem>
                  <SelectItem value="video">Vídeos</SelectItem>
                  <SelectItem value="audio">Áudios</SelectItem>
                  <SelectItem value="document">Documentos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={bucketFilter} onValueChange={setBucketFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Bucket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os buckets</SelectItem>
                  <SelectItem value="chat-attachments">chat-attachments</SelectItem>
                  <SelectItem value="chat-uploads">chat-uploads</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum arquivo encontrado</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="hidden md:table-cell">Bucket</TableHead>
                      <TableHead className="hidden sm:table-cell">Tamanho</TableHead>
                      <TableHead className="hidden lg:table-cell">Data</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.slice(0, 100).map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            onCheckedChange={(checked) => handleSelectFile(file.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileTypeIcon type={file.type} />
                            <span className="truncate max-w-[200px] md:max-w-[300px]" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="font-mono text-xs">
                            {file.bucket}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {formatBytes(file.size)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {file.createdAt.toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-muted"
                          >
                            <Download className="w-4 h-4 text-muted-foreground" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredFiles.length > 100 && (
                  <div className="p-3 text-center text-sm text-muted-foreground border-t">
                    Mostrando 100 de {filteredFiles.length} arquivos. Use os filtros para refinar.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{selectedFiles.size}</strong> arquivo(s) 
              totalizando <strong>{formatBytes(selectedSize)}</strong>.
              <br /><br />
              Esta ação não pode ser desfeita. Os arquivos serão removidos permanentemente do armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}