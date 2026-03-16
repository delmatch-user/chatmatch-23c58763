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

export function useWorkScheduleMonitor(): UseWorkScheduleMonitorResult {
  const { user, profile } = useAuth();
  const [todaySchedule, setTodaySchedule] = useState<WorkSchedule | null>(null);
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [isWithinSchedule, setIsWithinSchedule] = useState(false);
  const [showEndOfShiftDialog, setShowEndOfShiftDialog] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState(0);
  const [pendingConversationsCount, setPendingConversationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const dialogShownRef = useRef(false);
  const lastAlertTimeRef = useRef<number | null>(null);
  const choiceConfirmedRef = useRef(false);
  const autoOnlineDoneRef = useRef(false);
  const autoOfflineDoneRef = useRef(false);

  // Fetch today's schedule
  const fetchTodaySchedule = useCallback(async () => {
    if (!user?.id) return;

    try {
      const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
      
      const { data, error } = await supabase
        .from('work_schedules')
        .select('*')
        .eq('user_id', user.id)
        .eq('day_of_week', today)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching schedule:', error);
        return;
      }

      setTodaySchedule(data);
    } catch (err) {
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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

  // Parse time string to minutes from midnight
  const parseTimeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Calculate time remaining
  const calculateTimeRemaining = useCallback(() => {
    if (!todaySchedule) {
      setMinutesRemaining(null);
      setIsWithinSchedule(false);
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = parseTimeToMinutes(todaySchedule.start_time);
    const endMinutes = parseTimeToMinutes(todaySchedule.end_time) + extensionMinutes;

    // Suporte a escalas que cruzam meia-noite (ex: 17:00-01:00)
    const withinSchedule = endMinutes <= startMinutes
      ? (currentMinutes >= startMinutes || currentMinutes < endMinutes)
      : (currentMinutes >= startMinutes && currentMinutes < endMinutes);
    setIsWithinSchedule(withinSchedule);

    if (withinSchedule) {
      // Auto-online quando turno começa e atendente está offline
      if (profile?.status === 'offline' && !autoOnlineDoneRef.current) {
        autoOnlineDoneRef.current = true;
        handleAutoOnline();
      }
      // Reset ref quando não está mais offline
      if (profile?.status !== 'offline') {
        autoOnlineDoneRef.current = false;
      }

      // Cálculo correto de remaining para cross-midnight
      let remaining: number;
      const isCrossMidnight = endMinutes <= startMinutes;
      if (isCrossMidnight) {
        if (currentMinutes >= startMinutes) {
          remaining = (1440 - currentMinutes) + endMinutes;
        } else {
          remaining = endMinutes - currentMinutes;
        }
      } else {
        remaining = endMinutes - currentMinutes;
      }
      setMinutesRemaining(remaining);

      // Show dialog when 10 minutes remaining, only if choice not already confirmed
      if (remaining <= 10 && remaining > 0 && !choiceConfirmedRef.current) {
        if (!dialogShownRef.current) {
          dialogShownRef.current = true;
          fetchPendingConversations();
          setShowEndOfShiftDialog(true);
        }
      }

      // Auto-offline when shift ends (with guard to prevent repeated calls)
      if (remaining <= 0 && !autoOfflineDoneRef.current) {
        autoOfflineDoneRef.current = true;
        handleAutoOffline();
      }
    } else {
      setMinutesRemaining(null);
      // Reset refs quando fora do horário
      autoOnlineDoneRef.current = false;
      autoOfflineDoneRef.current = false;
    }
  }, [todaySchedule, extensionMinutes, fetchPendingConversations, profile?.status]);

  // Handle automatic online when shift starts
  const handleAutoOnline = async () => {
    if (!user?.id) return;

    await supabase
      .from('profiles')
      .update({ status: 'online', pause_started_at: null })
      .eq('id', user.id);
  };

  // Handle automatic offline when shift ends
  const handleAutoOffline = async () => {
    if (!user?.id) return;

    await supabase
      .from('profiles')
      .update({ status: 'offline' })
      .eq('id', user.id);
  };

  // Extend shift by 10 minutes
  const extendShift = useCallback(() => {
    setExtensionMinutes(prev => prev + 10);
    setShowEndOfShiftDialog(false);
    dialogShownRef.current = false;
  }, []);

  // Confirm choice - prevents dialog from reappearing
  const confirmChoice = useCallback(() => {
    choiceConfirmedRef.current = true;
    setShowEndOfShiftDialog(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTodaySchedule();
  }, [fetchTodaySchedule]);

  // Timer to check remaining time every minute
  useEffect(() => {
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [calculateTimeRemaining]);

  // Reset extension at midnight or when schedule changes
  useEffect(() => {
    setExtensionMinutes(0);
    dialogShownRef.current = false;
    choiceConfirmedRef.current = false;
    autoOnlineDoneRef.current = false;
    autoOfflineDoneRef.current = false;
  }, [todaySchedule?.id]);

  return {
    todaySchedule,
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
