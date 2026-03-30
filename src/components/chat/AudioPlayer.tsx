import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AlertCircle, Loader2, FileText, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AudioPlayerProps {
  url: string;
  className?: string;
  messageId?: string;
}

export function AudioPlayer({ url, className, messageId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscription, setShowTranscription] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const toggleSpeed = () => {
    const rates = [1, 1.5, 2];
    setPlaybackRate(prev => {
      const nextIndex = (rates.indexOf(prev) + 1) % rates.length;
      return rates[nextIndex];
    });
  };

  const formatSpeed = (rate: number) => {
    if (rate === 1) return '1x';
    if (rate === 1.5) return '1.5x';
    return '2x';
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };

    const handleLoadedMetadata = () => {
      // Tratar duração inválida (Infinity, NaN)
      const audioDuration = audio.duration;
      if (audioDuration && isFinite(audioDuration) && !isNaN(audioDuration)) {
        setDuration(audioDuration);
      } else {
        setDuration(0);
      }
      setIsLoading(false);
      setHasError(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setHasError(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    const handleError = () => {
      console.error('[AudioPlayer] Erro ao carregar áudio:', url);
      setIsLoading(false);
      setHasError(true);
    };

    const handleLoadStart = () => {
      setIsLoading(true);
      setHasError(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [url]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('[AudioPlayer] Erro ao reproduzir:', err);
      setHasError(true);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration || hasError) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audio.currentTime = percentage * duration;
  };

  const handleTranscribe = async () => {
    if (!url || isTranscribing) return;
    
    setIsTranscribing(true);
    try {
      console.log('[AudioPlayer] Iniciando transcrição para:', url);
      
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audioUrl: url }
      });

      if (error) {
        console.error('[AudioPlayer] Erro na transcrição:', error);
        throw error;
      }

      if (data?.transcription) {
        setTranscription(data.transcription);
        setShowTranscription(true);
        toast.success('Áudio transcrito com sucesso!');
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('[AudioPlayer] Erro ao transcrever:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao transcrever áudio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Verificar se URL está disponível
  if (!url) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-muted-foreground min-w-[200px]">
        <Pause className="w-4 h-4" />
        <span className="text-xs">Áudio não disponível</span>
      </div>
    );
  }

  // Estado de erro
  if (hasError) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive min-w-[200px]">
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Erro ao carregar áudio</span>
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs underline ml-auto"
        >
          Abrir
        </a>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 p-2 rounded-lg bg-background/30 min-w-[200px]">
        {/* 
          O elemento audio suporta múltiplos formatos: webm, ogg, mp3, m4a, wav
          O WhatsApp envia áudios em ogg/opus que é bem suportado em navegadores modernos
        */}
        <audio ref={audioRef} src={url} preload="metadata" />
        
        <Button 
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={togglePlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </Button>
        
        <div 
          className={cn(
            "flex-1 h-1.5 bg-muted rounded-full overflow-hidden",
            !isLoading && "cursor-pointer"
          )}
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-primary rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <span className="text-[10px] text-muted-foreground min-w-[32px] text-right">
          {isLoading ? '--:--' : formatTime(currentTime || duration)}
        </span>

        {/* Botão de velocidade */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-7 px-1.5 w-auto shrink-0 text-[10px] font-semibold",
            playbackRate !== 1 && "text-primary"
          )}
          onClick={toggleSpeed}
          disabled={isLoading}
          title="Velocidade de reprodução"
        >
          {formatSpeed(playbackRate)}
        </Button>

        {/* Botão de download */}
        <a
          href={url}
          download={`audio_${Date.now()}.mp3`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md hover:bg-accent hover:text-accent-foreground"
          title="Baixar áudio"
        >
          <Download className="w-3.5 h-3.5" />
        </a>

        {/* Botão de transcrição */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleTranscribe}
          disabled={isTranscribing || isLoading}
          title="Transcrever áudio"
        >
          {isTranscribing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Área de transcrição */}
      {transcription && (
        <div className="bg-muted/40 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <span className="font-medium">Transcrição</span>
            {showTranscription ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {showTranscription && (
            <div className="px-3 pb-2">
              <p className="text-sm text-foreground/90 italic leading-relaxed">
                "{transcription}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
