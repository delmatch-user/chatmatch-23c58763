import { supabase } from '@/integrations/supabase/client';

// ===================== Types =====================

export interface SDRPipelineStage {
  id: string;
  title: string;
  color: string;
  position: number;
  isSystem: boolean;
  isActive: boolean;
  isAiManaged: boolean;
  aiTriggerCriteria: string | null;
}

export interface SDRDeal {
  id: string;
  title: string;
  company: string;
  value: number;
  stageId?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactCity?: string;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
}

export interface SDRDealActivity {
  id: string;
  dealId: string;
  type: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  completedAt?: string;
  isCompleted: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface SDRAppointment {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  duration: number;
  type: 'demo' | 'meeting' | 'support' | 'followup';
  attendees: string[];
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  meetingUrl?: string;
  googleMeetUrl?: string;
  googleEventId?: string;
  processingStatus?: string;
  transcriptionSummary?: string;
  status: string;
  metadata?: Record<string, any>;
  userId?: string;
  userName?: string;
}

export interface SDRLostReason {
  reason: string;
  count: number;
}

export interface SDRStatMetric {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
}

export interface SDRRemarketingRule {
  id?: string;
  position: number;
  days_inactive: number;
  message_template: string;
  is_active: boolean;
}

// ===================== Helpers =====================

const getCurrentUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  return user.id;
};

const systemStagesCache: Map<string, { ganhoId: string | null; perdidoId: string | null }> = new Map();

const getSystemStageIds = async () => {
  const cacheKey = 'sdr';
  if (systemStagesCache.has(cacheKey)) return systemStagesCache.get(cacheKey)!;

  const { data: stages } = await supabase
    .from('sdr_pipeline_stages')
    .select('id, title, is_system')
    .eq('is_system', true)
    .eq('is_active', true);

  const result = {
    ganhoId: stages?.find(s => s.title.toLowerCase() === 'ganho')?.id || null,
    perdidoId: stages?.find(s => s.title.toLowerCase() === 'perdido')?.id || null,
  };
  systemStagesCache.set(cacheKey, result);
  return result;
};

export const clearSDRStagesCache = () => systemStagesCache.clear();

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const calculateTrend = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const diff = ((current - previous) / previous) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
};

const getDayName = (date: Date) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()];
const getDateString = (date: Date) => date.toISOString().split('T')[0];

// ===================== API =====================

export const sdrApi = {
  // Pipeline Stages
  fetchPipelineStages: async (): Promise<SDRPipelineStage[]> => {
    const { data, error } = await supabase
      .from('sdr_pipeline_stages')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) throw error;
    return (data || []).map(s => ({
      id: s.id, title: s.title, color: s.color, position: s.position,
      isSystem: s.is_system, isActive: s.is_active,
      isAiManaged: s.is_ai_managed || false, aiTriggerCriteria: s.ai_trigger_criteria,
    }));
  },

  createPipelineStage: async (stage: { title: string; color: string; isAiManaged?: boolean; aiTriggerCriteria?: string }) => {
    const { data: stages } = await supabase
      .from('sdr_pipeline_stages').select('position').eq('is_active', true)
      .order('position', { ascending: false }).limit(1);
    const nextPosition = stages?.[0] ? stages[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('sdr_pipeline_stages')
      .insert({ title: stage.title, color: stage.color, position: nextPosition, is_system: false, is_active: true, is_ai_managed: stage.isAiManaged || false, ai_trigger_criteria: stage.aiTriggerCriteria || null })
      .select().single();
    if (error) throw error;
    clearSDRStagesCache();
    return data;
  },

  updatePipelineStage: async (id: string, updates: any) => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isAiManaged !== undefined) dbUpdates.is_ai_managed = updates.isAiManaged;
    if (updates.aiTriggerCriteria !== undefined) dbUpdates.ai_trigger_criteria = updates.aiTriggerCriteria;
    const { error } = await supabase.from('sdr_pipeline_stages').update(dbUpdates).eq('id', id);
    if (error) throw error;
    clearSDRStagesCache();
  },

  deletePipelineStage: async (id: string, moveToStageId?: string) => {
    if (moveToStageId) {
      await supabase.from('sdr_deals').update({ stage_id: moveToStageId }).eq('stage_id', id);
    }
    const { error } = await supabase.from('sdr_pipeline_stages').delete().eq('id', id);
    if (error) throw error;
    clearSDRStagesCache();
  },

  reorderPipelineStages: async (stageIds: string[]) => {
    await Promise.all(stageIds.map((id, i) => supabase.from('sdr_pipeline_stages').update({ position: i }).eq('id', id)));
  },

  // Deals / Pipeline
  fetchPipeline: async (): Promise<SDRDeal[]> => {
    const { data, error } = await supabase
      .from('sdr_deals')
      .select('*, contact:contacts(name, phone, city), owner:profiles(name, avatar_url)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((d: any) => ({
      id: d.id, title: d.title, company: d.company || d.contact?.name || 'Sem empresa',
      value: Number(d.value) || 0, stageId: d.stage_id,
      contactId: d.contact_id, contactName: d.contact?.name, contactPhone: d.contact?.phone,
      contactCity: d.contact?.city || undefined,
      ownerId: d.owner_id, ownerName: d.owner?.name,
      ownerAvatar: d.owner?.avatar_url || `https://ui-avatars.com/api/?name=NA&background=334155&color=fff`,
      tags: d.tags || [], dueDate: d.due_date, priority: (d.priority || 'medium') as 'low' | 'medium' | 'high',
      wonAt: d.won_at, lostAt: d.lost_at, lostReason: d.lost_reason,
    }));
  },

  createDeal: async (deal: { contact_id?: string; title: string; company?: string; value?: number; stage_id?: string; priority?: string; tags?: string[]; due_date?: string; owner_id?: string }) => {
    const insertData: any = { ...deal };
    if (!insertData.stage_id) {
      const { data: firstStage } = await supabase.from('sdr_pipeline_stages').select('id').eq('is_active', true).order('position').limit(1);
      if (firstStage?.[0]) insertData.stage_id = firstStage[0].id;
    }
    const { data, error } = await supabase.from('sdr_deals').insert([insertData]).select().single();
    if (error) throw error;
    return data;
  },

  moveDealStage: async (id: string, newStageId: string) => {
    const { ganhoId, perdidoId } = await getSystemStageIds();
    const updates: any = { stage_id: newStageId };
    if (newStageId !== ganhoId && newStageId !== perdidoId) {
      updates.won_at = null; updates.lost_at = null; updates.lost_reason = null;
    }
    const { error } = await supabase.from('sdr_deals').update(updates).eq('id', id);
    if (error) throw error;
  },

  markDealWon: async (dealId: string) => {
    const { ganhoId } = await getSystemStageIds();
    if (!ganhoId) throw new Error('Stage "Ganho" not found');
    const { error } = await supabase.from('sdr_deals').update({ stage_id: ganhoId, won_at: new Date().toISOString() }).eq('id', dealId);
    if (error) throw error;
  },

  markDealLost: async (dealId: string, reason: string) => {
    const { perdidoId } = await getSystemStageIds();
    if (!perdidoId) throw new Error('Stage "Perdido" not found');
    const { error } = await supabase.from('sdr_deals').update({ stage_id: perdidoId, lost_at: new Date().toISOString(), lost_reason: reason }).eq('id', dealId);
    if (error) throw error;
  },

  updateDealOwner: async (dealId: string, ownerId: string) => {
    const { error } = await supabase.from('sdr_deals').update({ owner_id: ownerId }).eq('id', dealId);
    if (error) throw error;
  },

  deleteDeal: async (dealId: string) => {
    // Delete activities first, then the deal
    await supabase.from('sdr_deal_activities').delete().eq('deal_id', dealId);
    const { error } = await supabase.from('sdr_deals').delete().eq('id', dealId);
    if (error) throw error;
  },

  // Deal Activities
  fetchDealActivities: async (dealId: string): Promise<SDRDealActivity[]> => {
    const { data, error } = await supabase
      .from('sdr_deal_activities').select('*').eq('deal_id', dealId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(a => ({
      id: a.id, dealId: a.deal_id, type: a.type, title: a.title,
      description: a.description || undefined, scheduledAt: a.scheduled_at || undefined,
      completedAt: a.completed_at || undefined, isCompleted: a.is_completed,
      createdBy: a.created_by || undefined, createdAt: a.created_at,
    }));
  },

  createDealActivity: async (activity: { dealId: string; type: string; title: string; description?: string }) => {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('sdr_deal_activities').insert({
      deal_id: activity.dealId, type: activity.type, title: activity.title,
      description: activity.description, created_by: userId,
    });
    if (error) throw error;
  },

  updateDealActivity: async (id: string, updates: { isCompleted?: boolean }) => {
    const dbUpdates: any = {};
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }
    const { error } = await supabase.from('sdr_deal_activities').update(dbUpdates).eq('id', id);
    if (error) throw error;
  },

  deleteDealActivity: async (id: string) => {
    const { error } = await supabase.from('sdr_deal_activities').delete().eq('id', id);
    if (error) throw error;
  },

  // Appointments
  fetchAppointments: async (): Promise<SDRAppointment[]> => {
    const { data, error } = await supabase
      .from('sdr_appointments')
      .select('*, contact:contacts(name, phone), assigned_user:profiles!sdr_appointments_user_id_fkey(name)')
      .order('date').order('time');
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id, title: a.title, description: a.description || undefined,
      date: a.date, time: a.time, duration: a.duration,
      type: a.type as SDRAppointment['type'], attendees: a.attendees || [],
      contactId: a.contact_id || undefined, contactName: a.contact?.name, contactPhone: a.contact?.phone,
      meetingUrl: a.meeting_url || undefined, googleMeetUrl: a.google_meet_url || undefined,
      googleEventId: a.google_event_id || undefined, processingStatus: a.processing_status || undefined,
      transcriptionSummary: a.transcription_summary || undefined,
      status: a.status, metadata: a.metadata as any,
      userId: a.user_id || undefined, userName: a.assigned_user?.name || undefined,
    }));
  },

  createAppointment: async (apt: { title: string; description?: string; date: string; time: string; duration?: number; type: string; attendees?: string[]; contact_id?: string; meeting_url?: string }) => {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('sdr_appointments').insert({
      title: apt.title, description: apt.description, date: apt.date, time: apt.time,
      duration: apt.duration || 60, type: apt.type, attendees: apt.attendees || [],
      contact_id: apt.contact_id, meeting_url: apt.meeting_url, user_id: userId, status: 'scheduled',
    });
    if (error) throw error;
  },

  updateAppointment: async (id: string, updates: any) => {
    const { error } = await supabase.from('sdr_appointments').update(updates).eq('id', id);
    if (error) throw error;
  },

  deleteAppointment: async (id: string) => {
    const { error } = await supabase.from('sdr_appointments').delete().eq('id', id);
    if (error) throw error;
  },

  // Dashboard metrics
  fetchDashboardMetrics: async (days: number = 1): Promise<SDRStatMetric[]> => {
    const now = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(periodStart);
    prevStart.setDate(prevStart.getDate() - days);

    try {
    const [dealsPeriod, dealsPrev, wonPeriod, wonPrev, aptPeriod, aptPrev, lostPeriod, lostPrev] = await Promise.all([
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).gte('created_at', periodStart.toISOString()),
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).gte('created_at', prevStart.toISOString()).lt('created_at', periodStart.toISOString()),
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).not('won_at', 'is', null).gte('won_at', periodStart.toISOString()),
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).not('won_at', 'is', null).gte('won_at', prevStart.toISOString()).lt('won_at', periodStart.toISOString()),
        supabase.from('sdr_appointments').select('id', { count: 'exact', head: true }).gte('created_at', periodStart.toISOString()),
        supabase.from('sdr_appointments').select('id', { count: 'exact', head: true }).gte('created_at', prevStart.toISOString()).lt('created_at', periodStart.toISOString()),
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).not('lost_at', 'is', null).gte('lost_at', periodStart.toISOString()),
        supabase.from('sdr_deals').select('id', { count: 'exact', head: true }).not('lost_at', 'is', null).gte('lost_at', prevStart.toISOString()).lt('lost_at', periodStart.toISOString()),
      ]);

      const dp = dealsPeriod.count || 0, dpv = dealsPrev.count || 0;
      const wp = wonPeriod.count || 0, wpv = wonPrev.count || 0;
      const ap = aptPeriod.count || 0, apv = aptPrev.count || 0;
      const lp = lostPeriod.count || 0, lpv = lostPrev.count || 0;

      return [
        { label: 'Novos Leads', value: dp.toString(), trend: calculateTrend(dp, dpv), trendUp: dp >= dpv },
        { label: 'Conversões', value: wp.toString(), trend: calculateTrend(wp, wpv), trendUp: wp >= wpv },
        { label: 'Leads Perdidos', value: lp.toString(), trend: calculateTrend(lp, lpv), trendUp: lp <= lpv },
        { label: 'Agendamentos', value: ap.toString(), trend: calculateTrend(ap, apv), trendUp: ap >= apv },
      ];
    } catch {
      return [
        { label: 'Novos Leads', value: '0', trend: '0%', trendUp: true },
        { label: 'Conversões', value: '0', trend: '0%', trendUp: true },
        { label: 'Leads Perdidos', value: '0', trend: '0%', trendUp: true },
        { label: 'Agendamentos', value: '0', trend: '0%', trendUp: true },
      ];
    }
  },

  fetchChartData: async (days: number = 7) => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);

    const [dealsResult, wonResult] = await Promise.all([
      supabase.from('sdr_deals').select('created_at').gte('created_at', periodStart.toISOString()),
      supabase.from('sdr_deals').select('won_at').not('won_at', 'is', null).gte('won_at', periodStart.toISOString()),
    ]);

    const dealsMap = new Map<string, number>();
    (dealsResult.data || []).forEach(d => {
      const ds = getDateString(new Date(d.created_at));
      dealsMap.set(ds, (dealsMap.get(ds) || 0) + 1);
    });
    const wonMap = new Map<string, number>();
    (wonResult.data || []).forEach(d => {
      if (d.won_at) { const ds = getDateString(new Date(d.won_at)); wonMap.set(ds, (wonMap.get(ds) || 0) + 1); }
    });

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(); date.setDate(date.getDate() - i);
      const ds = getDateString(date);
      result.push({
        name: days === 1 ? 'Hoje' : days <= 7 ? getDayName(date) : `${date.getDate()}/${date.getMonth() + 1}`,
        deals: dealsMap.get(ds) || 0,
        won: wonMap.get(ds) || 0,
      });
    }
    return result;
  },

  // Contacts (reuses existing contacts table)
  fetchContacts: async () => {
    const { data, error } = await supabase
      .from('contacts').select('*')
      .eq('channel', 'whatsapp')
      .not('phone', 'is', null)
      .order('created_at', { ascending: false }).limit(100);
    if (error) return [];
    return (data || []).filter(c => (c.phone || '').replace(/\D/g, '').length >= 10).map(c => ({
      id: c.id, name: c.name || c.phone || 'Sem nome', phone: c.phone || '',
      email: c.email || '', status: 'lead' as const,
      lastContact: new Date(c.created_at).toLocaleDateString('pt-BR'),
    }));
  },

  // SDR team members (users in Comercial department)
  fetchSDRTeamMembers: async () => {
    const { data, error } = await supabase.rpc('list_team_directory');
    if (error) return [];
    return (data || []).filter((m: any) => {
      const depts = m.departments as any[];
      return depts?.some((d: any) => d.name?.toLowerCase() === 'comercial');
    });
  },

  // Lost reasons
  fetchLostReasons: async (days: number = 30): Promise<SDRLostReason[]> => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('sdr_deals')
      .select('lost_reason')
      .not('lost_at', 'is', null)
      .gte('lost_at', periodStart.toISOString());

    if (error || !data) return [];

    const reasonMap = new Map<string, number>();
    data.forEach(d => {
      const reason = d.lost_reason || 'Sem motivo informado';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });

    return Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  },

  // Meeting management
  endMeeting: async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-meeting-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ meeting_id: id }),
    });
    if (!res.ok) throw new Error('Failed to end meeting');
    return res.json();
  },

  fetchMeetingReport: async (id: string) => {
    const { data } = await supabase
      .from('sdr_appointments')
      .select('transcription_summary, transcription_text, processing_status')
      .eq('id', id)
      .single();
    return data;
  },

  // Google OAuth
  getGoogleStatus: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-google-calendar-oauth?action=status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: 'status' }),
    });
    return res.json();
  },

  connectGoogle: async (redirectUri: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-google-calendar-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: 'authorize', redirect_uri: redirectUri }),
    });
    return res.json();
  },

  googleCallback: async (code: string, state: string, redirectUri: string) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-google-calendar-oauth?action=callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'callback', code, state, redirect_uri: redirectUri }),
    });
    return res.json();
  },

  disconnectGoogle: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sdr-google-calendar-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    return res.json();
  },

  // SDR Robot Config
  fetchSdrRobotConfig: async () => {
    const { data } = await supabase.from('sdr_robot_config').select('id, robot_id, is_active').eq('is_active', true).maybeSingle();
    return data;
  },

  // Link conversation to deal (create or find existing conversation for the contact)
  linkDealToConversation: async (dealId: string, contactId: string) => {
    // Check if there's already a conversation for this contact
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .in('status', ['em_fila', 'em_atendimento', 'pendente'])
      .maybeSingle();

    if (existingConv) {
      // Update existing conversation with sdr_deal_id
      await supabase.from('conversations').update({ sdr_deal_id: dealId }).eq('id', existingConv.id);
      return existingConv.id;
    }

    // Get SDR robot config
    const robotConfig = await sdrApi.fetchSdrRobotConfig();

    // Get comercial department
    const { data: depts } = await supabase.from('departments').select('id, name');
    const comercialDept = depts?.find(d => d.name.toLowerCase() === 'comercial');
    if (!comercialDept) return null;

    // Create new conversation linked to the deal
    const { data: newConv, error } = await supabase.from('conversations').insert({
      contact_id: contactId,
      department_id: comercialDept.id,
      channel: 'whatsapp',
      status: robotConfig?.robot_id ? 'em_atendimento' : 'em_fila',
      assigned_to_robot: robotConfig?.robot_id || null,
      sdr_deal_id: dealId,
      priority: 'normal',
      tags: [],
    }).select('id').single();

    if (error) {
      console.error('Error creating conversation for deal:', error);
      return null;
    }

    return newConv?.id || null;
  },

  // Remarketing Config
  fetchRemarketingConfig: async (): Promise<SDRRemarketingRule[]> => {
    const { data, error } = await supabase
      .from('sdr_remarketing_config')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      position: r.position,
      days_inactive: r.days_inactive,
      message_template: r.message_template,
      is_active: r.is_active,
    }));
  },

  upsertRemarketingConfig: async (rules: SDRRemarketingRule[]) => {
    // Delete existing rules
    await supabase.from('sdr_remarketing_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new rules
    if (rules.length > 0) {
      const { error } = await supabase.from('sdr_remarketing_config').insert(
        rules.map((r, i) => ({
          position: i + 1,
          days_inactive: r.days_inactive,
          message_template: r.message_template,
          is_active: r.is_active,
        }))
      );
      if (error) throw error;
    }
  },

  fetchRemarketingLog: async (dealId: string) => {
    const { data, error } = await supabase
      .from('sdr_remarketing_log')
      .select('*, config:sdr_remarketing_config(message_template, days_inactive)')
      .eq('deal_id', dealId)
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
