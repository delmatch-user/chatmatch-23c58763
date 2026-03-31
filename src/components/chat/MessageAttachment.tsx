import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Mic, ImageIcon, Film, FileQuestion, Loader2, Download, Table2, FileSpreadsheet } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { ImagePreview } from './ImagePreview';
import { supabase } from '@/integrations/supabase/client';

interface AttachmentData {
  name: string;
  url: string;
  type: string;
  size?: number;
  mediaId?: string;
  isStoryMention?: boolean;
}

interface MessageAttachmentProps {
  attachments: AttachmentData[];
  messageId?: string;
}

/**
 * Resolve uma URL meta_media:MEDIA_ID para uma URL real via edge function
 */
async function resolveMetaMedia(mediaId: string, messageId?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('meta-media-proxy', {
      body: { mediaId, messageId }
    });
    
    if (error) {
      console.error('[MetaMedia] Erro ao resolver mídia:', error);
      return null;
    }
    
    return data?.url || null;
  } catch (err) {
    console.error('[MetaMedia] Erro:', err);
    return null;
  }
}

function MetaMediaResolver({ attachment, messageId, children }: { 
  attachment: AttachmentData; 
  messageId?: string;
  children: (url: string | null, loading: boolean) => React.ReactNode;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mediaId = attachment.url.replace('meta_media:', '');
    resolveMetaMedia(mediaId, messageId).then(url => {
      setResolvedUrl(url);
      setLoading(false);
    });
  }, [attachment.url, messageId]);

  return <>{children(resolvedUrl, loading)}</>;
}

export function MessageAttachment({ attachments, messageId }: MessageAttachmentProps) {
  if (!attachments || attachments.length === 0) return null;

  const isImage = (type?: string) => type?.startsWith('image/') ?? false;
  const isAudio = (type?: string) => type?.startsWith('audio/') ?? false;
  const isVideo = (type?: string) => type?.startsWith('video/') ?? false;
  const isMetaMedia = (url?: string) => url?.startsWith('meta_media:') ?? false;

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderAttachment = (attachment: AttachmentData, url: string | null) => {
    const isStory = attachment.isStoryMention;

    if (isImage(attachment.type)) {
      return url ? (
        <div className="relative">
          {isStory && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-orange-400 shadow">
              📸 Menção no Story
            </div>
          )}
          <div className={isStory ? 'rounded-lg p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : ''}>
            <ImagePreview url={url} alt={attachment.name} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground min-w-[150px]">
          <ImageIcon className="w-5 h-5" />
          <span className="text-sm">{isStory ? 'Story não disponível' : 'Imagem não disponível'}</span>
        </div>
      );
    }
    
    if (isAudio(attachment.type)) {
      return url ? (
        <AudioPlayer url={url} />
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
          <Mic className="w-5 h-5" />
          <span className="text-sm">Mensagem de voz</span>
        </div>
      );
    }
    
    if (isVideo(attachment.type)) {
      return url ? (
        <div className="relative">
          {isStory && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-orange-400 shadow">
              📸 Menção no Story
            </div>
          )}
          <div className={isStory ? 'rounded-lg p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : ''}>
            <video src={url} controls className="max-w-[300px] max-h-[200px] rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
          <Film className="w-5 h-5" />
          <span className="text-sm">{isStory ? 'Story não disponível' : 'Vídeo não disponível'}</span>
        </div>
      );
    }
    
    return url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
      >
        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{attachment.name}</p>
          {attachment.size && (
            <p className="text-[10px] text-muted-foreground">{formatSize(attachment.size)}</p>
          )}
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </a>
    ) : (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground">
        <FileQuestion className="w-5 h-5" />
        <span className="text-sm">{attachment.name || 'Documento não disponível'}</span>
      </div>
    );
  };

  const renderLoading = (type?: string) => {
    const icon = isImage(type) ? <ImageIcon className="w-5 h-5" /> 
      : isAudio(type) ? <Mic className="w-5 h-5" /> 
      : isVideo(type) ? <Film className="w-5 h-5" /> 
      : <FileText className="w-5 h-5" />;
    
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground min-w-[150px]">
        <Loader2 className="w-5 h-5 animate-spin" />
        {icon}
        <span className="text-sm">Carregando...</span>
      </div>
    );
  };

  return (
    <div className="space-y-2 mt-2">
      {attachments.map((attachment, index) => (
        <div key={index}>
          {isMetaMedia(attachment.url) ? (
            <MetaMediaResolver attachment={attachment} messageId={messageId}>
              {(url, loading) => loading ? renderLoading(attachment.type) : renderAttachment(attachment, url)}
            </MetaMediaResolver>
          ) : (
            renderAttachment(attachment, attachment.url)
          )}
        </div>
      ))}
    </div>
  );
}
