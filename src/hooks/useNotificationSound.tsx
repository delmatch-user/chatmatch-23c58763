import { useCallback, useRef } from 'react';

// Hook para tocar sons de notificação sem depender de contexto
// Isso evita problemas de ordem de providers
export function useNotificationSound() {
  const lastPlayedRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((type: 'message' | 'notification' | 'takeover' = 'message') => {
    // Verificar configuração do localStorage
    const soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
    if (!soundEnabled) return;

    // Throttle: evitar múltiplos sons em rápida sucessão
    const now = Date.now();
    if (now - lastPlayedRef.current < 500) return;
    lastPlayedRef.current = now;

    const volume = parseFloat(localStorage.getItem('sound_volume') || '0.5');

    try {
      // Reutilizar AudioContext se possível
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      // Resumir contexto se suspenso (política de autoplay do browser)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      if (type === 'message') {
        // Som de nova mensagem: dois beeps curtos
        oscillator.frequency.value = 880; // Nota A5
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(volume * 0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);

        // Segundo beep
        setTimeout(() => {
          try {
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 1046.5; // Nota C6
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(volume * 0.2, audioContext.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            osc2.start(audioContext.currentTime);
            osc2.stop(audioContext.currentTime + 0.1);
          } catch (e) {
            // Ignore
          }
        }, 120);
      } else if (type === 'takeover') {
        // Som de chime (sinos) para assumir conversa
        const notes = [1318.5, 1568, 2093]; // E6, G6, C7
        notes.forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          const startTime = audioContext.currentTime + i * 0.12;
          gain.gain.setValueAtTime(volume * 0.25, startTime);
          gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
          osc.start(startTime);
          osc.stop(startTime + 0.25);
        });
      } else {
        // Som de notificação: beep único mais longo
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }
    } catch (error) {
      console.log('[Sound] Audio not supported:', error);
    }
  }, []);

  return { playSound };
}

// Singleton para uso fora de componentes React
let globalAudioContext: AudioContext | null = null;
let lastPlayedGlobal = 0;

export function playNotificationSoundGlobal(type: 'message' | 'notification' | 'takeover' = 'message') {
  const soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
  if (!soundEnabled) return;

  const now = Date.now();
  if (now - lastPlayedGlobal < 500) return;
  lastPlayedGlobal = now;

  const volume = parseFloat(localStorage.getItem('sound_volume') || '0.5');

  try {
    if (!globalAudioContext || globalAudioContext.state === 'closed') {
      globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = globalAudioContext;
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'message') {
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(volume * 0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);

      setTimeout(() => {
        try {
          const osc2 = audioContext.createOscillator();
          const gain2 = audioContext.createGain();
          osc2.connect(gain2);
          gain2.connect(audioContext.destination);
          osc2.frequency.value = 1046.5;
          osc2.type = 'sine';
          gain2.gain.setValueAtTime(volume * 0.2, audioContext.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          osc2.start(audioContext.currentTime);
          osc2.stop(audioContext.currentTime + 0.1);
        } catch (e) {}
      }, 120);
    } else if (type === 'takeover') {
      const notes = [1318.5, 1568, 2093];
      notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const startTime = audioContext.currentTime + i * 0.12;
        gain.gain.setValueAtTime(volume * 0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } else {
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(volume * 0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }
  } catch (error) {
    console.log('[Sound] Audio not supported:', error);
  }
}
