import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RobotSchedule {
  id?: string;
  robot_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function getDayName(day: number) {
  return DAY_NAMES[day] || '';
}

export function useRobotSchedules() {
  const [schedules, setSchedules] = useState<RobotSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSchedules = useCallback(async (robotId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('robot_schedules')
        .select('*')
        .eq('robot_id', robotId)
        .order('day_of_week');

      if (error) throw error;

      if (data && data.length > 0) {
        setSchedules(data as RobotSchedule[]);
      } else {
        // Initialize empty schedules for all 7 days
        setSchedules(
          Array.from({ length: 7 }, (_, i) => ({
            robot_id: robotId,
            day_of_week: i,
            start_time: '08:00',
            end_time: '18:00',
            is_active: false,
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching robot schedules:', error);
      toast.error('Erro ao carregar horários do robô');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSchedules = useCallback(async (robotId: string, newSchedules: RobotSchedule[]) => {
    setSaving(true);
    try {
      // Delete existing and insert all
      await supabase.from('robot_schedules').delete().eq('robot_id', robotId);

      const activeSchedules = newSchedules.filter(s => s.is_active);
      if (activeSchedules.length > 0) {
        const { error } = await supabase.from('robot_schedules').insert(
          activeSchedules.map(s => ({
            robot_id: robotId,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_active: true,
          }))
        );
        if (error) throw error;
      }

      toast.success('Horários salvos com sucesso!');
    } catch (error) {
      console.error('Error saving robot schedules:', error);
      toast.error('Erro ao salvar horários');
    } finally {
      setSaving(false);
    }
  }, []);

  return { schedules, setSchedules, loading, saving, fetchSchedules, saveSchedules, getDayName };
}
