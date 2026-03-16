export type UserRole = 'admin' | 'supervisor' | 'atendente' | 'franqueado';

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export type ConversationStatus = 'em_fila' | 'em_atendimento' | 'transferida' | 'finalizada' | 'pendente';

export type ConversationType = 'externa' | 'interna';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  departments: string[];
  createdAt: Date;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  color: string;
  supervisors: string[];
  queueCount: number;
  onlineCount: number;
  maxWaitTime?: number;
  autoPriority?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  tags: string[];
  notes?: string;
  channel?: 'whatsapp' | 'instagram' | 'web' | 'machine';
}

export interface MessageReaction {
  id: string;
  emoji: string;
  senderPhone?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'system';
  timestamp: Date;
  read: boolean;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  deleted?: boolean;
  reactions?: MessageReaction[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  status: ConversationStatus;
  contact: Contact;
  departmentId: string;
  assignedTo?: string;
  assignedToRobot?: string; // ID do robô atribuído
  messages: Message[];
  tags: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
  waitTime?: number;
  lastMessage?: Message;
  channel?: 'whatsapp' | 'instagram' | 'web' | 'machine';
  whatsappInstanceId?: string;
  protocol?: string;
  // For internal conversations
  isInternal?: boolean;
  channelId?: string;
  receiverId?: string;
}

export interface TransferLog {
  id: string;
  conversationId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId?: string;
  toUserName?: string;
  toDepartmentId: string;
  toDepartmentName: string;
  reason: string;
  timestamp: Date;
  status: 'accepted' | 'rejected' | 'pending';
}

export interface QuickMessage {
  id: string;
  title: string;
  content: string;
  category: string;
  isFavorite: boolean;
  userId: string;
  departmentId?: string;
  createdAt: Date;
}

export interface QueueItem {
  conversation: Conversation;
  position: number;
  waitTime: number;
}
