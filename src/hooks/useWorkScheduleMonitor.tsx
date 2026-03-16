import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface WorkSchedule {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface UseWorkScheduleMonitorResult {
  todaySchedule: WorkSchedule | null;
  minutesRemaining: number | null;
  isWithinSchedule: boolean;
  showEndOfShiftDialog: boolean;
  setShowEndOfShiftDialog: (show: boolean) => void;
  extendShift: () => void;
  confirmChoice: () => void;
  extensionMinutes: number;
  pendingConversationsCount: number;
  loading: boolean;
}

// Parse "HH:MM" to minutes from midnight
const parseTimeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Check if a schedule is cross-midnight (e.g. 22:00-02:00)
const isCrossMidnightSchedule = (schedule: WorkSchedule): boolean => {
  return parseTimeToMinutes(schedule.end_time) <= parseTimeToMinutes(schedule.start_time);
};

// Check if current time falls within a schedule (with extension)
const isCurrentlyWithinSchedule = (schedule: WorkSchedule, extensionMinutes: number): boolean => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(schedule.start_time);
  const endMinutes = parseTimeToMinutes(schedule.end_time) + extensionMinutes;

  if (isCrossMidnightSchedule(schedule)) {
    // For cross-midnight: after start OR before end+extension
    const effectiveEnd = endMinutes % 1440; // wrap around if extension pushes past 24h
    return currentMinutes >= startMinutes || currentMinutes < effectiveEnd;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

// Calculate minutes remaining for a schedule
const calculateRemaining = (schedule: WorkSchedule, extensionMinutes: number): number => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(schedule.start_time);
  const endMinutes = parseTimeToMinutes(schedule.end_time) + extensionMinutes;

  if (isCrossMidnightSchedule(schedule)) {
    if (currentMinutes >= startMinutes) {
      // Before midnight: remaining = (to midnight) + endMinutes
      return (1440 - currentMinutes) + (endMinutes % 1440);
    } else {
      // After midnight: remaining = endMinutes - current
      return (endMinutes % 1440) - currentMinutes;
    }
  }
  return endMinutes - currentMinutes;
};

// Check if we're within the first N minutes of shift start
const isWithinStartWindow = (schedule: WorkSchedule, windowMinutes: number): boolean => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(schedule.start_time);

  if (isCrossMidnightSchedule(schedule)) {
    // Start is always before midnight for cross-midnight
    const diff = currentMinutes - startMinutes;
    return diff >= 0 && diff < windowMinutes;
  }
  const diff = currentMinutes - startMinutes;
  return diff >= 0 && diff < windowMinutes;
};

const MANUAL_OVERRIDE_KEY = 'work_schedule_manual_override';

export function useWorkScheduleMonitor(): UseWorkScheduleMonitorResult {
  const { user, profile } = useAuth();
  const [activeSchedule, setActiveSchedule] = useState<WorkSchedule | null>(null);
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [isWithinSchedule, setIsWithinSchedule] = useState(false);
  const [showEndOfShiftDialog, setShowEndOfShiftDialog] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState(0);
  const [pendingConversationsCount, setPendingConversationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const dialogShownRef = useRef(false);
  const choiceConfirmedRef = useRef(false);
  const autoOnlineDoneRef = useRef(false);
  const autoOfflineDoneRef = useRef(false);
  const manualOverrideRef = useRef(false);

  // Listen for manual status changes from Topbar
  useEffect(() => {
    const handleManualOverride = () => {
      manualOverrideRef.current = true;
      localStorage.setItem(MANUAL_OVERRIDE_KEY, 'true');
    };

    window.addEventListener('work_schedule_manual_override', handleManualOverride);

    // Restore from localStorage on mount
    if (localStorage.getItem(MANUAL_OVERRIDE_KEY) === 'true') {
      manualOverrideRef.current = true;
    }

    return () => {
      window.removeEventListener('work_schedule_manual_override', handleManualOverride);
    };
  }, []);

  // Fetch today's schedule AND previous day's (for cross-midnight)
  const fetchSchedules = useCallback(async () => {
    if (!user?.id) return;

    try {
      const today = new Date().getDay(); // 0=Sun, 6=Sat
      const yesterday = today === 0 ? 6 : today - 1;

      const { data, error } = await supabase
        .from('work_schedules')
        .select('*')
        .eq('user_id', user.id)
        .in('day_of_week', [today, yesterday])
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching schedule:', error);
        return;
      }

      if (!data || data.length === 0) {
        setActiveSchedule(null);
        return;
      }

      // Priority: check today's schedule first
      const todaySchedule = data.find(s => s.day_of_week === today);
      const yesterdaySchedule = data.find(s => s.day_of_week === yesterday);

      // Check if yesterday's cross-midnight schedule is still active
      if (yesterdaySchedule && isCrossMidnightSchedule(yesterdaySchedule)) {
        if (isCurrentlyWithinSchedule(yesterdaySchedule, extensionMinutes)) {
          setActiveSchedule(yesterdaySchedule);
          return;
        }
      }

      // Use today's schedule if it exists
      if (todaySchedule) {
        setActiveSchedule(todaySchedule);
        return;
      }

      setActiveSchedule(null);
    } catch (err) {
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, extensionMinutes]);

  // Fetch pending conversations count
  const fetchPendingConversations = useCallback(async () => {
    if (!user?.id) return;

    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id)
      .eq('status', 'em_atendimento');

    setPendingConversationsCount(count || 0);
  }, [user?.id]);

  // Handle automatic online when shift starts
  const handleAutoOnline = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ status: 'online', pause_started_at: null })
      .eq('id', user.id);
  }, [user?.id]);

  // Handle automatic offline when shift ends
  const handleAutoOffline = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ status: 'offline' })
      .eq('id', user.id);
  }, [user?.id]);

  // Main calculation loop
  const calculateTimeRemaining = useCallback(() => {
    if (!activeSchedule) {
      setMinutesRemaining(null);
      setIsWithinSchedule(false);
      return;
    }

    const withinSchedule = isCurrentlyWithinSchedule(activeSchedule, extensionMinutes);
    setIsWithinSchedule(withinSchedule);

    if (withinSchedule) {
      const remaining = calculateRemaining(activeSchedule, extensionMinutes);
      setMinutesRemaining(remaining);

      // Auto-online: only in first 2 minutes of shift, only if not manually overridden
      if (
        profile?.status === 'offline' &&
        !autoOnlineDoneRef.current &&
        !manualOverrideRef.current &&
        isWithinStartWindow(activeSchedule, 2)
      ) {
        autoOnlineDoneRef.current = true;
        handleAutoOnline();
      }

      // Show end-of-shift dialog at 10 min remaining
      if (remaining <= 10 && remaining > 0 && !choiceConfirmedRef.current) {
        if (!dialogShownRef.current) {
          dialogShownRef.current = true;
          fetchPendingConversations();
          setShowEndOfShiftDialog(true);
        }
      }

      // Auto-offline when shift ends
      if (remaining <= 0 && !autoOfflineDoneRef.current) {
        autoOfflineDoneRef.current = true;
        handleAutoOffline();
      }
    } else {
      setMinutesRemaining(null);

      // Auto-offline if still online after schedule ended (guard)
      if (
        profile?.status === 'online' &&
        !autoOfflineDoneRef.current &&
        activeSchedule
      ) {
        // Only auto-offline if we HAD a schedule and it just ended
        // Don't force offline if there's no schedule at all
        autoOfflineDoneRef.current = true;
        handleAutoOffline();
      }
    }
  }, [activeSchedule, extensionMinutes, fetchPendingConversations, profile?.status, handleAutoOnline, handleAutoOffline]);

  // Extend shift by 10 minutes
  const extendShift = useCallback(() => {
    setExtensionMinutes(prev => prev + 10);
    setShowEndOfShiftDialog(false);
    dialogShownRef.current = false;
    // Reset auto-offline guard so it can trigger again after extension
    autoOfflineDoneRef.current = false;
  }, []);

  // Confirm choice - prevents dialog from reappearing
  const confirmChoice = useCallback(() => {
    choiceConfirmedRef.current = true;
    setShowEndOfShiftDialog(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Timer to check remaining time every minute
  useEffect(() => {
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000);
    return () => clearInterval(interval);
  }, [calculateTimeRemaining]);

  // Reset all refs when schedule changes (new day / new schedule)
  useEffect(() => {
    setExtensionMinutes(0);
    dialogShownRef.current = false;
    choiceConfirmedRef.current = false;
    autoOnlineDoneRef.current = false;
    autoOfflineDoneRef.current = false;
    // Clear manual override when schedule changes (new shift)
    manualOverrideRef.current = false;
    localStorage.removeItem(MANUAL_OVERRIDE_KEY);
  }, [activeSchedule?.id]);

  return {
    todaySchedule: activeSchedule,
    minutesRemaining,
    isWithinSchedule,
    showEndOfShiftDialog,
    setShowEndOfShiftDialog,
    extendShift,
    confirmChoice,
    extensionMinutes,
    pendingConversationsCount,
    loading,
  };
}
