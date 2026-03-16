import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Save, Copy, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WorkSchedule {
  id?: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface UserProfile {
  id: string;
  name: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

export function WorkScheduleManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch all users (not just support)
  const fetchUsers = useCallback(async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setUsers(profiles || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch schedules for selected user
  const fetchSchedules = useCallback(async (userId: string) => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('work_schedules')
        .select('*')
        .eq('user_id', userId)
        .order('day_of_week');

      if (error) throw error;

      // Create full week schedule, filling in missing days
      const fullSchedule: WorkSchedule[] = DAYS_OF_WEEK.map(day => {
        const existing = data?.find(s => s.day_of_week === day.value);
        return existing || {
          user_id: userId,
          day_of_week: day.value,
          start_time: '08:00',
          end_time: '18:00',
          is_active: false,
        };
      });

      setSchedules(fullSchedule);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast.error('Erro ao carregar escalas');
    }
  }, []);

  // Save schedules
  const saveSchedules = async () => {
    if (!selectedUserId) return;

    setSaving(true);
    try {
      // Upsert all schedules
      for (const schedule of schedules) {
        if (schedule.id) {
          // Update existing
          await supabase
            .from('work_schedules')
            .update({
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              is_active: schedule.is_active,
            })
            .eq('id', schedule.id);
        } else if (schedule.is_active) {
          // Insert new (only if active)
          await supabase
            .from('work_schedules')
            .insert({
              user_id: schedule.user_id,
              day_of_week: schedule.day_of_week,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              is_active: schedule.is_active,
            });
        }
      }

      toast.success('Escala salva com sucesso');
      fetchSchedules(selectedUserId);
    } catch (error) {
      console.error('Error saving schedules:', error);
      toast.error('Erro ao salvar escala');
    } finally {
      setSaving(false);
    }
  };

  // Update schedule value
  const updateSchedule = (dayOfWeek: number, field: keyof WorkSchedule, value: any) => {
    setSchedules(prev =>
      prev.map(s =>
        s.day_of_week === dayOfWeek ? { ...s, [field]: value } : s
      )
    );
  };

  // Copy schedule from one day to all weekdays
  const copyToWeekdays = (sourceDayOfWeek: number) => {
    const sourceSchedule = schedules.find(s => s.day_of_week === sourceDayOfWeek);
    if (!sourceSchedule) return;

    setSchedules(prev =>
      prev.map(s => {
        // Copy to weekdays (1-5, Monday to Friday)
        if (s.day_of_week >= 1 && s.day_of_week <= 5) {
          return {
            ...s,
            start_time: sourceSchedule.start_time,
            end_time: sourceSchedule.end_time,
            is_active: sourceSchedule.is_active,
          };
        }
        return s;
      })
    );

    toast.success('Horário copiado para dias úteis');
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUserId) {
      fetchSchedules(selectedUserId);
    }
  }, [selectedUserId, fetchSchedules]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Configurar Escalas de Trabalho
        </CardTitle>
        <CardDescription>
          Configure os horários de trabalho dos atendentes do suporte
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <Label>Atendente:</Label>
          </div>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione um atendente" />
            </SelectTrigger>
            <SelectContent>
              {users.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedUserId && (
          <>
            {/* Schedule grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              {schedules.map(schedule => {
                const day = DAYS_OF_WEEK.find(d => d.value === schedule.day_of_week);
                return (
                  <div
                    key={schedule.day_of_week}
                    className={`p-4 rounded-lg border transition-colors ${
                      schedule.is_active
                        ? 'bg-primary/5 border-primary/30'
                        : 'bg-muted/30 border-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{day?.short}</span>
                      <Switch
                        checked={schedule.is_active}
                        onCheckedChange={(checked) =>
                          updateSchedule(schedule.day_of_week, 'is_active', checked)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Entrada</Label>
                        <Input
                          type="time"
                          value={schedule.start_time}
                          onChange={(e) =>
                            updateSchedule(schedule.day_of_week, 'start_time', e.target.value)
                          }
                          disabled={!schedule.is_active}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Saída</Label>
                        <Input
                          type="time"
                          value={schedule.end_time}
                          onChange={(e) =>
                            updateSchedule(schedule.day_of_week, 'end_time', e.target.value)
                          }
                          disabled={!schedule.is_active}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    {schedule.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => copyToWeekdays(schedule.day_of_week)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar para dias úteis
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <Button onClick={saveSchedules} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar Escala'}
              </Button>
            </div>
          </>
        )}

        {!selectedUserId && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Clock className="h-5 w-5 mr-2" />
            Selecione um atendente para configurar sua escala
          </div>
        )}
      </CardContent>
    </Card>
  );
}
