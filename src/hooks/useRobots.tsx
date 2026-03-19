import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface QAPair {
  id: string;
  question: string;
  answer: string;
}

export interface ReferenceLink {
  id: string;
  url: string;
  title: string;
  type: 'link' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileContent?: string;
}

export interface RobotTools {
  transferToAgents: boolean;
  transferToAgentsMode: 'all' | 'select';
  transferToAgentIds: string[];
  transferToDepartments: boolean;
  transferToDepartmentsMode: 'all' | 'select';
  transferToDepartmentIds: string[];
  askHumanAgents: boolean;
  followUp: boolean;
  groupMessages: boolean;
  groupMessagesTime: number;
  webSearch: boolean;
  closeConversations: boolean;
  scheduleMessages: boolean;
  readImages: boolean;
  sendAgentName: boolean;
  manageLabels: boolean;
  editContact: boolean;
  typingIndicator: boolean;
  splitByLineBreak: boolean;
}

export type RobotChannel = 'whatsapp' | 'instagram' | 'machine';

export const ALL_CHANNELS: RobotChannel[] = ['whatsapp', 'instagram', 'machine'];

export interface Robot {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  status: 'active' | 'inactive' | 'paused';
  intelligence: string;
  tone: string;
  maxTokens: number;
  departments: string[];
  channels: RobotChannel[];
  sendAudio: string;
  finalizationMessage: string;
  messagesCount: number;
  lastTriggered: string | null;
  createdAt: string;
  instructions: string;
  qaPairs: QAPair[];
  referenceLinks: ReferenceLink[];
  tools: RobotTools;
  autoAssign: boolean;
}

export const defaultTools: RobotTools = {
  transferToAgents: true,
  transferToAgentsMode: 'all',
  transferToAgentIds: [],
  transferToDepartments: true,
  transferToDepartmentsMode: 'all',
  transferToDepartmentIds: [],
  askHumanAgents: true,
  followUp: false,
  groupMessages: true,
  groupMessagesTime: 40,
  webSearch: true,
  closeConversations: false,
  scheduleMessages: true,
  readImages: true,
  sendAgentName: true,
  manageLabels: false,
  editContact: false,
  typingIndicator: true,
  splitByLineBreak: false,
};

interface DbRobot {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  status: string;
  intelligence: string;
  tone: string;
  max_tokens: number;
  departments: string[];
  channels: string[];
  send_audio: string;
  finalization_message: string | null;
  messages_count: number;
  last_triggered: string | null;
  created_at: string;
  instructions: string | null;
  qa_pairs: unknown;
  reference_links: unknown;
  tools: unknown;
  auto_assign: boolean;
}

function dbToRobot(db: DbRobot): Robot {
  return {
    id: db.id,
    name: db.name,
    description: db.description || '',
    avatarUrl: db.avatar_url,
    status: db.status as Robot['status'],
    intelligence: db.intelligence,
    tone: db.tone,
    maxTokens: db.max_tokens,
    departments: db.departments || [],
    channels: (db.channels as RobotChannel[]) || ALL_CHANNELS,
    sendAudio: db.send_audio,
    finalizationMessage: db.finalization_message || '',
    messagesCount: db.messages_count,
    lastTriggered: db.last_triggered,
    createdAt: db.created_at,
    instructions: db.instructions || '',
    qaPairs: (db.qa_pairs as QAPair[]) || [],
    referenceLinks: (db.reference_links as ReferenceLink[]) || [],
    tools: { ...defaultTools, ...(db.tools as Partial<RobotTools>) },
    autoAssign: db.auto_assign ?? true,
  };
}

function robotToDb(robot: Robot, userId?: string) {
  return {
    name: robot.name,
    description: robot.description || null,
    avatar_url: robot.avatarUrl,
    status: robot.status,
    intelligence: robot.intelligence,
    tone: robot.tone,
    max_tokens: robot.maxTokens,
    departments: robot.departments,
    channels: robot.channels,
    send_audio: robot.sendAudio,
    finalization_message: robot.finalizationMessage || null,
    instructions: robot.instructions || null,
    qa_pairs: JSON.parse(JSON.stringify(robot.qaPairs)),
    reference_links: JSON.parse(JSON.stringify(robot.referenceLinks)),
    tools: JSON.parse(JSON.stringify(robot.tools)),
    auto_assign: robot.autoAssign,
    ...(userId ? { created_by: userId } : {}),
  };
}

export function useRobots() {
  const [allRobots, setAllRobots] = useState<Robot[]>([]);
  const [userDepartmentIds, setUserDepartmentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();

  const fetchRobots = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('robots')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error details:', error);
        if (error.message.includes('infinite recursion')) {
          toast.error('Erro de configuração do banco. Contate o administrador.');
        } else {
          toast.error('Erro ao carregar robôs: ' + error.message);
        }
        return;
      }
      
      setAllRobots((data as DbRobot[]).map(dbToRobot));
    } catch (error) {
      console.error('Error fetching robots:', error);
      toast.error('Erro ao carregar robôs');
    } finally {
      setLoading(false);
    }
  };

  // Fetch user departments for filtering
  useEffect(() => {
    if (!user?.id || isAdmin) return;
    supabase
      .from('profile_departments')
      .select('department_id')
      .eq('profile_id', user.id)
      .then(({ data }) => {
        setUserDepartmentIds((data || []).map(d => d.department_id));
      });
  }, [user?.id, isAdmin]);

  useEffect(() => {
    fetchRobots();
  }, []);

  // Filter robots by user departments (admins see all)
  const robots = isAdmin
    ? allRobots
    : allRobots.filter(r =>
        r.departments.length === 0 || r.departments.some(d => userDepartmentIds.includes(d))
      );

  const createRobot = async (robot: Robot): Promise<Robot | null> => {
    try {
      const { data, error } = await supabase
        .from('robots')
        .insert(robotToDb(robot, user?.id))
        .select()
        .single();

      if (error) throw error;
      const newRobot = dbToRobot(data as DbRobot);
      setAllRobots(prev => [newRobot, ...prev]);
      toast.success('Robô criado com sucesso!');
      return newRobot;
    } catch (error) {
      console.error('Error creating robot:', error);
      toast.error('Erro ao criar robô');
      return null;
    }
  };

  const updateRobot = async (robot: Robot): Promise<Robot | null> => {
    try {
      const { data, error } = await supabase
        .from('robots')
        .update(robotToDb(robot))
        .eq('id', robot.id)
        .select()
        .single();

      if (error) throw error;
      const updatedRobot = dbToRobot(data as DbRobot);
      setAllRobots(prev => prev.map(r => r.id === robot.id ? updatedRobot : r));
      toast.success('Robô atualizado com sucesso!');
      return updatedRobot;
    } catch (error) {
      console.error('Error updating robot:', error);
      toast.error('Erro ao atualizar robô');
      return null;
    }
  };

  const deleteRobot = async (robotId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('robots')
        .delete()
        .eq('id', robotId);

      if (error) throw error;
      setAllRobots(prev => prev.filter(r => r.id !== robotId));
      toast.success('Robô excluído com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting robot:', error);
      toast.error('Erro ao excluir robô');
      return false;
    }
  };

  const toggleStatus = async (robotId: string): Promise<boolean> => {
    const robot = robots.find(r => r.id === robotId);
    if (!robot) return false;

    const newStatus = robot.status === 'active' ? 'paused' : 'active';
    const manuallyActivated = newStatus === 'active';
    try {
      const { error } = await supabase
        .from('robots')
        .update({ status: newStatus, manually_activated: manuallyActivated } as any)
        .eq('id', robotId);

      if (error) throw error;
      setAllRobots(prev => prev.map(r => 
        r.id === robotId ? { ...r, status: newStatus } : r
      ));
      toast.success(`Robô ${newStatus === 'active' ? 'ativado' : 'pausado'} com sucesso!`);
      return true;
    } catch (error) {
      console.error('Error toggling robot status:', error);
      toast.error('Erro ao alterar status do robô');
      return false;
    }
  };

  return {
    robots,
    loading,
    createRobot,
    updateRobot,
    deleteRobot,
    toggleStatus,
    refetch: fetchRobots,
  };
}
