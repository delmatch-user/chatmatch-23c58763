import { useState, useRef, useCallback } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    recordingTime: 0,
    audioBlob: null
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Tentar formatos na ordem de preferência para compatibilidade com WhatsApp
      // Priorizar OGG/Opus que é o formato nativo do WhatsApp
      const mimeTypes = [
        'audio/ogg; codecs=opus',  // Formato nativo do WhatsApp - PRIORIDADE
        'audio/ogg;codecs=opus',   // Variante sem espaço
        'audio/webm;codecs=opus',  // Chrome padrão, boa compatibilidade
        'audio/webm',              // Fallback webm genérico
        'audio/mp4',               // Fallback iOS/Safari
      ];
      
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      console.log('[AudioRecorder] Usando MIME type:', supportedMimeType || 'default do navegador');
      
      const mediaRecorder = new MediaRecorder(stream, supportedMimeType ? {
        mimeType: supportedMimeType
      } : undefined);
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Forçar MIME type para audio/ogg; codecs=opus para compatibilidade com WhatsApp
        const blob = new Blob(chunksRef.current, { 
          type: 'audio/ogg; codecs=opus' 
        });
        setState(prev => ({ ...prev, audioBlob: blob, isRecording: false }));
        
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start(100); // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder;
      
      // Start timer
      setState({ isRecording: true, recordingTime: 0, audioBlob: null });
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, recordingTime: prev.recordingTime + 1 }));
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const originalOnStop = mediaRecorderRef.current.onstop;
        mediaRecorderRef.current.onstop = (e) => {
          if (originalOnStop) {
            originalOnStop.call(mediaRecorderRef.current, e);
          }
          // Forçar MIME type para audio/ogg; codecs=opus para compatibilidade com WhatsApp
          const blob = new Blob(chunksRef.current, { 
            type: 'audio/ogg; codecs=opus'
          });
          resolve(blob);
        };
        mediaRecorderRef.current.stop();
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    streamRef.current?.getTracks().forEach(track => track.stop());
    
    setState({ isRecording: false, recordingTime: 0, audioBlob: null });
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isRecording: state.isRecording,
    recordingTime: state.recordingTime,
    formattedTime: formatTime(state.recordingTime),
    audioBlob: state.audioBlob,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
