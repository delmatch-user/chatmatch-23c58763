import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SettingsContextType {
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  soundVolume: number;
  setSoundVolume: (volume: number) => void;
  playNotificationSound: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() => {
    const stored = localStorage.getItem('queue_notifications_enabled');
    return stored !== 'false';
  });

  const [soundEnabled, setSoundEnabledState] = useState(() => {
    const stored = localStorage.getItem('sound_enabled');
    return stored !== 'false';
  });

  const [soundVolume, setSoundVolumeState] = useState(() => {
    const stored = localStorage.getItem('sound_volume');
    return stored ? parseFloat(stored) : 0.5;
  });

  useEffect(() => {
    localStorage.setItem('queue_notifications_enabled', String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('sound_volume', String(soundVolume));
  }, [soundVolume]);

  const playNotificationSound = () => {
    if (!soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(soundVolume * 0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio not supported');
    }
  };

  const setNotificationsEnabled = (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
  };

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
  };

  const setSoundVolume = (volume: number) => {
    setSoundVolumeState(volume);
  };

  return (
    <SettingsContext.Provider value={{
      notificationsEnabled,
      setNotificationsEnabled,
      soundEnabled,
      setSoundEnabled,
      soundVolume,
      setSoundVolume,
      playNotificationSound,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
