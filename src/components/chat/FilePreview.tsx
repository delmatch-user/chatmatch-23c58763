import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadedFile } from '@/hooks/useFileUpload';

interface FilePreviewProps {
  files: UploadedFile[];
  onRemove: (index: number) => void;
  uploading?: boolean;
}

export function FilePreview({ files, onRemove, uploading }: FilePreviewProps) {
  if (files.length === 0) return null;

  const isImage = (type: string) => type.startsWith('image/');

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex gap-2 p-2 border-t border-border bg-muted/50 overflow-x-auto">
      {files.map((file, index) => (
        <div
          key={index}
          className="relative flex-shrink-0 rounded-lg border border-border bg-card p-2 min-w-[120px] max-w-[150px]"
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onRemove(index)}
            disabled={uploading}
          >
            <X className="w-3 h-3" />
          </Button>

          {isImage(file.type) ? (
            <div className="w-full aspect-square rounded overflow-hidden bg-muted mb-1">
              <img
                src={file.url}
                alt={file.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full aspect-square rounded bg-muted flex items-center justify-center mb-1">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          )}

          <p className="text-xs text-foreground truncate" title={file.name}>
            {file.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatSize(file.size)}
          </p>
        </div>
      ))}
    </div>
  );
}
