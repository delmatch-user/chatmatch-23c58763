import { useState, useRef, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bot, 
  Plus, 
  Search, 
  MoreVertical, 
  Play, 
  Pause, 
  Settings2, 
  Trash2,
  MessageSquare,
  Clock,
  CheckCircle2,
  ArrowLeft,
  X,
  Send,
  RefreshCw,
  FileText,
  HelpCircle,
  Link2,
  ExternalLink,
  Zap,
  Puzzle,
  Sparkles,
  Users,
  Building2,
  UserCheck,
  CalendarClock,
  Globe,
  XCircle,
  ImageIcon,
  Tag,
  Edit3,
  Keyboard,
  SplitSquareVertical,
  MessageCircle,
  Loader2,
  Camera
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useDepartments } from '@/hooks/useDepartments';
import { useRobots, Robot, defaultTools, QAPair, ReferenceLink, ALL_CHANNELS, RobotChannel } from '@/hooks/useRobots';
import { Checkbox } from '@/components/ui/checkbox';
import { useRobotSchedules, getDayName } from '@/hooks/useRobotSchedules';
import { supabase } from '@/integrations/supabase/client';

const intelligenceOptions = [
  { value: 'novato', label: 'Novato 🌱', description: 'Versão gratuita - Ideal para começar', model: 'gemini-2.5-flash-lite', free: true },
  { value: 'flash', label: 'Flash ⚡', description: 'Rápido e eficiente para respostas simples', model: 'gemini-2.5-flash' },
  { value: 'maestro', label: 'Maestro 🎯', description: 'Ideal para agentes complexos que exigem contexto', model: 'gpt-4.1' },
  { value: 'pro', label: 'Pro 🚀', description: 'Equilibrio entre velocidade e qualidade', model: 'gemini-2.5-pro' },
];

const toneOptions = [
  { value: 'muito_criativo', label: 'Muito criativo', description: 'O Agente será ainda mais criativo, explorando' },
  { value: 'criativo', label: 'Criativo', description: 'Respostas mais livres e imaginativas' },
  { value: 'equilibrado', label: 'Equilibrado', description: 'Balanço entre criatividade e precisão' },
  { value: 'preciso', label: 'Preciso', description: 'Respostas mais diretas e factuais' },
  { value: 'muito_preciso', label: 'Muito preciso', description: 'Máxima precisão e formalidade' },
];

const audioOptions = [
  { value: 'nunca', label: 'Nunca' },
  { value: 'sempre', label: 'Sempre' },
  { value: 'quando_solicitado', label: 'Quando solicitado' },
];

export default function AdminRobos() {
  const { robots, loading, createRobot, updateRobot, deleteRobot, toggleStatus } = useRobots();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRobot, setSelectedRobot] = useState<Robot | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState('personalidade');
  const [knowledgeTab, setKnowledgeTab] = useState('instrucoes');
  const [toolsTab, setToolsTab] = useState('funcoes');
  const [testMessage, setTestMessage] = useState('');
  const [testMessages, setTestMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  
  const { departments } = useDepartments();
  const { schedules, setSchedules, loading: schedulesLoading, saving: schedulesSaving, fetchSchedules, saveSchedules } = useRobotSchedules();

  // Track which robots have active schedules
  const [robotScheduleMap, setRobotScheduleMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadAllSchedules = async () => {
      const { data } = await supabase
        .from('robot_schedules')
        .select('robot_id, is_active')
        .eq('is_active', true);
      if (data) {
        const map: Record<string, boolean> = {};
        data.forEach(s => { map[s.robot_id] = true; });
        setRobotScheduleMap(map);
      }
    };
    loadAllSchedules();
  }, [robots]);

  // Load schedules when opening config for an existing robot
  useEffect(() => {
    if (isConfigOpen && selectedRobot && robots.find(r => r.id === selectedRobot.id)) {
      fetchSchedules(selectedRobot.id);
    }
  }, [isConfigOpen, selectedRobot?.id]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedRobot) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    const result = await uploadFile(file, `robot-${selectedRobot.id}`);
    if (result) {
      setSelectedRobot({ ...selectedRobot, avatarUrl: result.url });
      toast.success('Foto atualizada com sucesso!');
    }
    
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const filteredRobots = robots.filter(robot =>
    robot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (robot.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: Robot['status'], robotId?: string) => {
    const hasSchedule = robotId ? robotScheduleMap[robotId] : false;
    const scheduleIcon = hasSchedule ? <CalendarClock className="w-3 h-3 mr-1" /> : null;
    const scheduleLabel = hasSchedule ? ' (Escala)' : '';
    switch (status) {
      case 'active':
        return <Badge className="bg-success/20 text-success border-success/30">{scheduleIcon}Ativo{scheduleLabel}</Badge>;
      case 'paused':
        return <Badge className="bg-warning/20 text-warning border-warning/30">{scheduleIcon}{hasSchedule ? 'Pausado (Escala)' : 'Pausado'}</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inativo</Badge>;
    }
  };

  const handleToggleStatus = async (robotId: string) => {
    await toggleStatus(robotId);
  };

  const handleDeleteRobot = async (robotId: string) => {
    await deleteRobot(robotId);
  };

  const handleOpenConfig = (robot: Robot) => {
    setSelectedRobot({ ...robot });
    setIsConfigOpen(true);
    setConfigTab('personalidade');
    setTestMessages([]);
  };

  const handleCreateNew = () => {
    const newRobot: Robot = {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      avatarUrl: null,
      status: 'inactive',
      intelligence: 'flash',
      tone: 'equilibrado',
      maxTokens: 1000,
      departments: [],
      channels: [...ALL_CHANNELS],
      sendAudio: 'nunca',
      finalizationMessage: '',
      messagesCount: 0,
      lastTriggered: null,
      createdAt: new Date().toISOString(),
      instructions: '',
      qaPairs: [],
      referenceLinks: [],
      tools: { ...defaultTools },
      autoAssign: true,
    };
    setSelectedRobot(newRobot);
    setIsConfigOpen(true);
    setConfigTab('personalidade');
    setTestMessages([]);
  };

  const handleSaveRobot = async () => {
    if (!selectedRobot) return;
    
    if (!selectedRobot.name.trim()) {
      toast.error('Nome do agente é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const exists = robots.find(r => r.id === selectedRobot.id);
      if (exists) {
        await updateRobot(selectedRobot);
      } else {
        await createRobot(selectedRobot);
      }
      
      setIsConfigOpen(false);
      setSelectedRobot(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestMessage = async () => {
    if (!testMessage.trim() || !selectedRobot || isLoadingResponse) return;
    
    const userMessage = testMessage;
    setTestMessage('');
    
    const newUserMsg = { role: 'user' as const, content: userMessage };
    setTestMessages(prev => [...prev, newUserMsg]);
    setIsLoadingResponse(true);
    
    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/robot-chat`;
      
      const allMessages = [...testMessages, newUserMsg];
      
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: allMessages,
          robotConfig: {
            name: selectedRobot.name || 'Assistente',
            intelligence: selectedRobot.intelligence,
            tone: selectedRobot.tone,
            maxTokens: selectedRobot.maxTokens,
            instructions: selectedRobot.instructions,
            qaPairs: selectedRobot.qaPairs,
            finalizationMessage: selectedRobot.finalizationMessage,
            tools: selectedRobot.tools,
          }
        }),
      });

      if (resp.status === 429) {
        toast.error('Limite de requisições atingido. Tente novamente mais tarde.');
        setIsLoadingResponse(false);
        return;
      }
      if (resp.status === 402) {
        toast.error('Créditos insuficientes. Adicione créditos à sua conta.');
        setIsLoadingResponse(false);
        return;
      }
      if (!resp.ok || !resp.body) {
        throw new Error("Failed to start stream");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let streamDone = false;

      // Add empty assistant message
      setTestMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setTestMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Erro ao conectar com o agente. Tente novamente.');
      setTestMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.' }
      ]);
    } finally {
      setIsLoadingResponse(false);
    }
  };

  const handleRemoveDepartment = (deptId: string) => {
    if (!selectedRobot) return;
    setSelectedRobot({
      ...selectedRobot,
      departments: selectedRobot.departments.filter(d => d !== deptId)
    });
  };

  const handleAddDepartment = (deptId: string) => {
    if (!selectedRobot) return;
    if (!selectedRobot.departments.includes(deptId)) {
      setSelectedRobot({
        ...selectedRobot,
        departments: [...selectedRobot.departments, deptId]
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const activeCount = robots.filter(r => r.status === 'active').length;
  const pausedCount = robots.filter(r => r.status === 'paused').length;
  const totalMessages = robots.reduce((acc, r) => acc + r.messagesCount, 0);

  if (isConfigOpen && selectedRobot) {
    return (
      <MainLayout>
        <div className="flex h-[calc(100vh-4rem)]">
          {/* Config Panel */}
          <div className="flex-1 flex flex-col border-r border-border">
            {/* Tabs Header */}
            <div className="border-b border-border">
              <Tabs value={configTab} onValueChange={setConfigTab}>
                <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                  <TabsTrigger 
                    value="personalidade" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                  >
                    Personalidade
                  </TabsTrigger>
                  <TabsTrigger 
                    value="conhecimento"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                  >
                    Base de conhecimento
                  </TabsTrigger>
                  <TabsTrigger 
                    value="ferramentas"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                  >
                    Ferramentas
                  </TabsTrigger>
                  <TabsTrigger 
                    value="horarios"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                  >
                    Horários
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Tab Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {configTab === 'personalidade' && (
                  <div className="space-y-6">
                    {/* Avatar and Name Row */}
                    <div className="flex gap-6">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="relative group">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={selectedRobot.avatarUrl || undefined} alt={selectedRobot.name} />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xl">
                              <Bot className="w-8 h-8" />
                            </AvatarFallback>
                          </Avatar>
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={uploading}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            {uploading ? (
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                            ) : (
                              <Camera className="w-5 h-5 text-white" />
                            )}
                          </button>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="agentName">Nome do agente</Label>
                          <Input
                            id="agentName"
                            placeholder="Ex: Sebastião - Suporte"
                            value={selectedRobot.name}
                            onChange={(e) => setSelectedRobot({ ...selectedRobot, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>Inteligência</Label>
                        <Select
                          value={selectedRobot.intelligence}
                          onValueChange={(value) => setSelectedRobot({ ...selectedRobot, intelligence: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {intelligenceOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{opt.label}</span>
                                  {'free' in opt && opt.free && (
                                    <Badge variant="secondary" className="ml-2 bg-success/20 text-success border-success/30 text-[10px] px-1.5 py-0">
                                      Grátis
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground ml-2">{opt.model}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{opt.description}</p>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Departments and Tone Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Departamentos</Label>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[42px] bg-background">
                            {selectedRobot.departments.map(deptId => {
                              const dept = departments?.find(d => d.id === deptId);
                              return dept ? (
                                <Badge key={deptId} variant="secondary" className="gap-1">
                                  {dept.name}
                                  <button onClick={() => handleRemoveDepartment(deptId)}>
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ) : null;
                            })}
                            <Select onValueChange={handleAddDepartment}>
                              <SelectTrigger className="w-auto border-0 h-6 p-0 shadow-none">
                                <Plus className="w-4 h-4 text-muted-foreground" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments?.filter(d => !selectedRobot.departments.includes(d.id)).map((dept) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <button className="text-sm text-primary hover:underline">
                            Marcar todos
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Tom</Label>
                        <Select
                          value={selectedRobot.tone}
                          onValueChange={(value) => setSelectedRobot({ ...selectedRobot, tone: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {toneOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div>
                                  <span className="font-medium">{opt.label}</span>
                                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Channels */}
                    <div className="space-y-2">
                      <Label>Canais</Label>
                      <p className="text-xs text-muted-foreground">Selecione em quais canais este robô pode atuar</p>
                      <div className="flex gap-4 p-3 border rounded-md bg-background">
                        {([
                          { value: 'whatsapp' as RobotChannel, label: 'WhatsApp', icon: '💬' },
                          { value: 'instagram' as RobotChannel, label: 'Instagram', icon: '📸' },
                          { value: 'machine' as RobotChannel, label: 'Machine', icon: '🏍️' },
                        ]).map(ch => (
                          <label key={ch.value} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={selectedRobot.channels.includes(ch.value)}
                              onCheckedChange={(checked) => {
                                const newChannels = checked
                                  ? [...selectedRobot.channels, ch.value]
                                  : selectedRobot.channels.filter(c => c !== ch.value);
                                if (newChannels.length === 0) {
                                  toast.error('O robô deve ter pelo menos um canal');
                                  return;
                                }
                                setSelectedRobot({ ...selectedRobot, channels: newChannels });
                              }}
                            />
                            <span className="text-sm">{ch.icon} {ch.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Audio and Tokens Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Enviar áudio</Label>
                        <Select
                          value={selectedRobot.sendAudio}
                          onValueChange={(value) => setSelectedRobot({ ...selectedRobot, sendAudio: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {audioOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxTokens">Máximo de tokens</Label>
                        <Input
                          id="maxTokens"
                          type="number"
                          value={selectedRobot.maxTokens}
                          onChange={(e) => setSelectedRobot({ ...selectedRobot, maxTokens: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Quanto menor este número, mais enxuta será a resposta
                        </p>
                      </div>
                    </div>

                    {/* Messages Row */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="finalizationMessage">Mensagem de finalização (opcional)</Label>
                        <Textarea
                          id="finalizationMessage"
                          placeholder="Mensagem enviada ao encerrar a conversa..."
                          value={selectedRobot.finalizationMessage}
                          onChange={(e) => setSelectedRobot({ ...selectedRobot, finalizationMessage: e.target.value })}
                          rows={4}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Descrição (opcional)</Label>
                        <Textarea
                          id="description"
                          placeholder="Descreva o propósito deste agente..."
                          value={selectedRobot.description}
                          onChange={(e) => setSelectedRobot({ ...selectedRobot, description: e.target.value })}
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground">
                          A descrição é utilizada para treinar outros Agentes IA
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {configTab === 'conhecimento' && (
                  <div className="space-y-4">
                    {/* Sub-tabs */}
                    <div className="flex gap-2">
                      <Button
                        variant={knowledgeTab === 'instrucoes' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setKnowledgeTab('instrucoes')}
                        className="gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        Instruções
                      </Button>
                      <Button
                        variant={knowledgeTab === 'perguntas' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setKnowledgeTab('perguntas')}
                        className="gap-2"
                      >
                        <HelpCircle className="w-4 h-4" />
                        Perguntas e respostas
                      </Button>
                      <Button
                        variant={knowledgeTab === 'links' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setKnowledgeTab('links')}
                        className="gap-2"
                      >
                        <Link2 className="w-4 h-4" />
                        Base de Consulta ({selectedRobot.referenceLinks.length}/10)
                      </Button>
                    </div>

                    {/* Instructions Tab */}
                    {knowledgeTab === 'instrucoes' && (
                      <div className="space-y-4">
                        <Textarea
                          placeholder="Escreva as instruções e o contexto que o agente deve seguir..."
                          value={selectedRobot.instructions}
                          onChange={(e) => setSelectedRobot({ ...selectedRobot, instructions: e.target.value })}
                          rows={16}
                          className="resize-none"
                        />
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Atalhos:</span>
                          <button className="flex items-center gap-1 hover:text-foreground">
                            Forçar envio de texto
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button className="flex items-center gap-1 hover:text-foreground">
                            Bloquear envio de mensagem
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Q&A Tab */}
                    {knowledgeTab === 'perguntas' && (
                      <div className="space-y-4">
                        {selectedRobot.qaPairs.map((qa, index) => (
                          <div key={qa.id} className="grid grid-cols-2 gap-4 items-start">
                            <div className="space-y-1">
                              <Label className="text-sm">
                                Pergunta {index + 1} <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                placeholder="Digite a pergunta..."
                                value={qa.question}
                                onChange={(e) => {
                                  const updated = selectedRobot.qaPairs.map(q => 
                                    q.id === qa.id ? { ...q, question: e.target.value } : q
                                  );
                                  setSelectedRobot({ ...selectedRobot, qaPairs: updated });
                                }}
                              />
                            </div>
                            <div className="space-y-1 relative">
                              <Label className="text-sm">
                                Resposta {index + 1} <span className="text-destructive">*</span>
                              </Label>
                              <div className="flex gap-2">
                                <Textarea
                                  placeholder="Digite a resposta..."
                                  value={qa.answer}
                                  onChange={(e) => {
                                    const updated = selectedRobot.qaPairs.map(q => 
                                      q.id === qa.id ? { ...q, answer: e.target.value } : q
                                    );
                                    setSelectedRobot({ ...selectedRobot, qaPairs: updated });
                                  }}
                                  rows={3}
                                  className="flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive shrink-0"
                                  onClick={() => {
                                    const updated = selectedRobot.qaPairs.filter(q => q.id !== qa.id);
                                    setSelectedRobot({ ...selectedRobot, qaPairs: updated });
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <Button
                          variant="outline"
                          className="w-full border-dashed border-success text-success hover:bg-success/10 hover:text-success"
                          onClick={() => {
                            const newQA: QAPair = {
                              id: Date.now().toString(),
                              question: '',
                              answer: '',
                            };
                            setSelectedRobot({
                              ...selectedRobot,
                              qaPairs: [...selectedRobot.qaPairs, newQA],
                            });
                          }}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar pergunta e resposta
                        </Button>
                      </div>
                    )}

                    {/* Links / Base de Consulta Tab */}
                    {knowledgeTab === 'links' && (
                      <div className="space-y-4">
                        {selectedRobot.referenceLinks.map((link, index) => (
                          <div key={link.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-3">
                            {link.type === 'file' ? (
                              <>
                                <FileText className="w-5 h-5 text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{link.fileName || link.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {link.fileContent ? `${link.fileContent.length.toLocaleString()} caracteres extraídos` : 'Processando...'}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <Link2 className="w-5 h-5 text-primary shrink-0" />
                                <Input
                                  placeholder="https://..."
                                  value={link.url}
                                  onChange={(e) => {
                                    const updated = selectedRobot.referenceLinks.map(l => 
                                      l.id === link.id ? { ...l, url: e.target.value } : l
                                    );
                                    setSelectedRobot({ ...selectedRobot, referenceLinks: updated });
                                  }}
                                  className="flex-1"
                                />
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive shrink-0"
                              onClick={() => {
                                const updated = selectedRobot.referenceLinks.filter(l => l.id !== link.id);
                                setSelectedRobot({ ...selectedRobot, referenceLinks: updated });
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}

                        {selectedRobot.referenceLinks.length < 10 && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1 border-dashed border-success text-success hover:bg-success/10 hover:text-success"
                              onClick={() => {
                                const newLink: ReferenceLink = {
                                  id: Date.now().toString(),
                                  url: '',
                                  title: '',
                                  type: 'link',
                                };
                                setSelectedRobot({
                                  ...selectedRobot,
                                  referenceLinks: [...selectedRobot.referenceLinks, newLink],
                                });
                              }}
                            >
                              <Link2 className="w-4 h-4 mr-2" />
                              Adicionar link
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-dashed border-primary text-primary hover:bg-primary/10 hover:text-primary"
                              onClick={() => {
                                const fileInput = document.createElement('input');
                                fileInput.type = 'file';
                                fileInput.accept = '.txt,.pdf,.md,.csv';
                                fileInput.onchange = async (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (!file) return;
                                  if (file.size > 10 * 1024 * 1024) {
                                    toast.error('Arquivo muito grande. Máximo de 10MB.');
                                    return;
                                  }
                                  const result = await uploadFile(file, `robot-knowledge/${selectedRobot.id}`);
                                  if (!result) return;
                                  
                                  // Extract content via edge function
                                  let fileContent = '';
                                  try {
                                    const resp = await supabase.functions.invoke('extract-file-content', {
                                      body: { fileUrl: result.url, fileName: file.name },
                                    });
                                    if (resp.data?.content) {
                                      fileContent = resp.data.content;
                                    }
                                  } catch (err) {
                                    console.error('Error extracting file content:', err);
                                    toast.error('Erro ao extrair conteúdo do arquivo');
                                  }
                                  
                                  const newLink: ReferenceLink = {
                                    id: Date.now().toString(),
                                    url: result.url,
                                    title: file.name,
                                    type: 'file',
                                    fileUrl: result.url,
                                    fileName: file.name,
                                    fileContent,
                                  };
                                  setSelectedRobot(prev => prev ? {
                                    ...prev,
                                    referenceLinks: [...prev.referenceLinks, newLink],
                                  } : prev);
                                  toast.success(`Arquivo "${file.name}" adicionado com sucesso!`);
                                };
                                fileInput.click();
                              }}
                              disabled={uploading}
                            >
                              {uploading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4 mr-2" />
                              )}
                              Adicionar arquivo
                            </Button>
                          </div>
                        )}

                        {selectedRobot.referenceLinks.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            Nenhum link ou arquivo adicionado ainda
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {configTab === 'ferramentas' && (
                  <div className="space-y-4">
                    {/* Sub-tabs */}
                    <div className="flex gap-2">
                      <Button
                        variant={toolsTab === 'integracoes' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setToolsTab('integracoes')}
                        className="gap-2"
                      >
                        <Puzzle className="w-4 h-4" />
                        Integrações
                      </Button>
                      <Button
                        variant={toolsTab === 'funcoes' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setToolsTab('funcoes')}
                        className="gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        Funções
                      </Button>
                      <Button
                        variant={toolsTab === 'recursos' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setToolsTab('recursos')}
                        className="gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        Recursos adicionais
                      </Button>
                    </div>

                    {/* Integrações Tab */}
                    {toolsTab === 'integracoes' && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Configure as integrações externas que o agente pode utilizar.
                        </p>
                        <div className="text-center py-8 text-muted-foreground">
                          <Puzzle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhuma integração disponível no momento.</p>
                        </div>
                      </div>
                    )}

                    {/* Funções Tab */}
                    {toolsTab === 'funcoes' && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Configure todas as funções que o agente pode ter no chat. Quando é adicionado uma grande quantidade de funções, o agente pode gastar mais tokens e demorar mais para responder.
                        </p>

                        {/* Assumir conversas da fila automaticamente */}
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-emerald-600" />
                              </div>
                              <div>
                                <h4 className="font-medium flex items-center gap-1">
                                  Assumir conversas da fila automaticamente
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  Quando ativado, o agente pega conversas novas da fila. Quando desativado, o agente só atende conversas recebidas por transferência de outro agente.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.autoAssign}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                autoAssign: checked
                              })}
                            />
                          </div>
                        </div>

                        {/* Transferir para outros atendentes */}
                        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Users className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <h4 className="font-medium flex items-center gap-1">
                                  Transferir para outros atendentes
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  O agente poderá transferir a conversa para outros atendentes humanos ou agentes. É necessário que os atendentes tenham uma descrição preenchida.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.tools.transferToAgents}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, transferToAgents: checked }
                              })}
                            />
                          </div>
                          {selectedRobot.tools.transferToAgents && (
                            <RadioGroup
                              value={selectedRobot.tools.transferToAgentsMode}
                              onValueChange={(value) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, transferToAgentsMode: value as 'all' | 'select' }
                              })}
                              className="flex gap-4 ml-13"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="all" id="agents-all" />
                                <Label htmlFor="agents-all" className="text-sm font-normal">Todos os atendentes</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="select" id="agents-select" />
                                <Label htmlFor="agents-select" className="text-sm font-normal">Selecionar atendentes</Label>
                              </div>
                            </RadioGroup>
                            )}

                          {selectedRobot.tools.transferToAgents && selectedRobot.tools.transferToAgentsMode === 'select' && (
                            <div className="ml-13 mt-2 space-y-2 max-h-48 overflow-y-auto">
                              {robots.filter(r => r.id !== selectedRobot.id).map((robot) => (
                                <label key={robot.id} className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={(selectedRobot.tools.transferToAgentIds || []).includes(robot.id)}
                                    onCheckedChange={(checked) => {
                                      const current = selectedRobot.tools.transferToAgentIds || [];
                                      const updated = checked
                                        ? [...current, robot.id]
                                        : current.filter((id: string) => id !== robot.id);
                                      setSelectedRobot({
                                        ...selectedRobot,
                                        tools: { ...selectedRobot.tools, transferToAgentIds: updated }
                                      });
                                    }}
                                  />
                                  <Bot className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm">{robot.name}</span>
                                </label>
                              ))}
                              {robots.filter(r => r.id !== selectedRobot.id).length === 0 && (
                                <p className="text-sm text-muted-foreground">Nenhum outro agente disponível</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Transferir para outros departamentos */}
                        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <h4 className="font-medium flex items-center gap-1">
                                  Transferir para outros departamentos
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  O agente poderá transferir a conversa para outros departamentos. É necessário que os departamentos tenham uma descrição preenchida.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.tools.transferToDepartments}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, transferToDepartments: checked }
                              })}
                            />
                          </div>
                          {selectedRobot.tools.transferToDepartments && (
                            <RadioGroup
                              value={selectedRobot.tools.transferToDepartmentsMode}
                              onValueChange={(value) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, transferToDepartmentsMode: value as 'all' | 'select' }
                              })}
                              className="flex gap-4 ml-13"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="all" id="dept-all" />
                                <Label htmlFor="dept-all" className="text-sm font-normal">Todos os departamentos</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="select" id="dept-select" />
                                <Label htmlFor="dept-select" className="text-sm font-normal">Selecionar departamentos</Label>
                              </div>
                            </RadioGroup>
                          )}

                          {selectedRobot.tools.transferToDepartments && selectedRobot.tools.transferToDepartmentsMode === 'select' && (
                            <div className="ml-13 mt-2 space-y-2 max-h-48 overflow-y-auto">
                              {departments.map((dept) => (
                                <label key={dept.id} className="flex items-center gap-2 cursor-pointer">
                                  <Checkbox
                                    checked={(selectedRobot.tools.transferToDepartmentIds || []).includes(dept.id)}
                                    onCheckedChange={(checked) => {
                                      const current = selectedRobot.tools.transferToDepartmentIds || [];
                                      const updated = checked
                                        ? [...current, dept.id]
                                        : current.filter((id: string) => id !== dept.id);
                                      setSelectedRobot({
                                        ...selectedRobot,
                                        tools: { ...selectedRobot.tools, transferToDepartmentIds: updated }
                                      });
                                    }}
                                  />
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }} />
                                  <span className="text-sm">{dept.name}</span>
                                </label>
                              ))}
                              {departments.length === 0 && (
                                <p className="text-sm text-muted-foreground">Nenhum departamento disponível</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Perguntar para outros atendentes */}
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                                <UserCheck className="w-5 h-5 text-orange-600" />
                              </div>
                              <div>
                                <h4 className="font-medium flex items-center gap-1">
                                  Perguntar para outros atendentes (humanos)
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  O agente poderá perguntar para outros atendentes humanos para obter informações adicionais sobre algum assunto específico. Será enviada uma notificação no chat para todos os atendentes que estiverem online no momento.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.tools.askHumanAgents}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, askHumanAgents: checked }
                              })}
                            />
                          </div>
                        </div>

                        {/* Follow-up */}
                        <div className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                <CalendarClock className="w-5 h-5 text-purple-600" />
                              </div>
                              <div>
                                <h4 className="font-medium flex items-center gap-1">
                                  Follow-up
                                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  Quando o agente identificar que o cliente abandonou a conversa, ele poderá enviar mensagens de follow-up para o cliente.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.tools.followUp}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, followUp: checked }
                              })}
                            />
                          </div>
                        </div>

                        {/* Agrupar mensagens recebidas */}
                        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                                <MessageCircle className="w-5 h-5 text-cyan-600" />
                              </div>
                              <div>
                                <h4 className="font-medium">Agrupar mensagens recebidas</h4>
                                <p className="text-sm text-muted-foreground">
                                  Quando o usuário enviar várias mensagens seguidas, o agente irá aguardar alguns segundos antes de responder. Isto é útil para evitar que o agente responda rapidamente a cada mensagem, o que pode gerar uma resposta confusa.
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={selectedRobot.tools.groupMessages}
                              onCheckedChange={(checked) => setSelectedRobot({
                                ...selectedRobot,
                                tools: { ...selectedRobot.tools, groupMessages: checked }
                              })}
                            />
                          </div>
                          {selectedRobot.tools.groupMessages && (
                            <div className="ml-13 space-y-2">
                              <Label className="text-sm">Tempo em segundos</Label>
                              <Input
                                type="number"
                                value={selectedRobot.tools.groupMessagesTime}
                                onChange={(e) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, groupMessagesTime: parseInt(e.target.value) || 0 }
                                })}
                                className="w-24"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recursos adicionais Tab */}
                    {toolsTab === 'recursos' && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Configure os recursos que o agente poderá utilizar. Quando é adicionado uma grande quantidade de recursos, o agente pode gastar mais tokens e demorar mais para responder.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                          {/* Pesquisa na Web */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                  <Globe className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">Pesquisa na Web</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Com este recurso, o agente poderá fazer pesquisas na internet para responder as perguntas do cliente.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.webSearch}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, webSearch: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Adicionar/remover etiquetas */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                  <Tag className="w-4 h-4 text-red-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm flex items-center gap-1">
                                    Adicionar/remover etiquetas das conversas
                                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Com este recurso, o agente poderá adicionar e remover etiquetas das conversas.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.manageLabels}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, manageLabels: checked }
                                })}
                              />
                            </div>
                          </div>


                          {/* Editar contato */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                  <Edit3 className="w-4 h-4 text-orange-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm flex items-center gap-1">
                                    Editar contato
                                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Com este recurso, o agente poderá salvar o cliente como contato, atualizar informações como nome, email, telefone e informações adicionais.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.editContact}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, editContact: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Finalizar conversas */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                  <CheckCircle2 className="w-4 h-4 text-red-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm flex items-center gap-1">
                                    Finalizar conversas
                                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    O agente poderá finalizar conversas quando identificar que o problema foi resolvido. Também será usado para auto-finalização por inatividade (quando o cliente não responde).
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.canFinalize}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, canFinalize: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Agendar mensagens */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                                  <CalendarClock className="w-4 h-4 text-purple-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm flex items-center gap-1">
                                    Agendar mensagens
                                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Com este recurso, o agente poderá agendar mensagens para serem enviadas em data futura.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.scheduleMessages}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, scheduleMessages: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Digitando e gravando */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                                  <Keyboard className="w-4 h-4 text-cyan-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">Digitando e gravando</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Será enviado um status de digitação ou gravação antes de enviar a mensagem. Apenas quando estiver disponível no canal de atendimento.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.typingIndicator}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, typingIndicator: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Ler imagens recebidas */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 text-pink-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">Ler imagens recebidas</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    O agente poderá ler imagens recebidas .jpeg ou .png recebidas. Isto pode gastar uma quantidade de tokens maior que o normal.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.readImages}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, readImages: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Separar mensagens a enviar pela quebra de linha */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                  <SplitSquareVertical className="w-4 h-4 text-gray-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">Separar mensagens a enviar pela quebra de linha</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    O agente poderá separar as mensagens a enviar pela quebra de linha. Isto pode gastar uma quantidade de tokens maior que o normal.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.splitByLineBreak}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, splitByLineBreak: checked }
                                })}
                              />
                            </div>
                          </div>

                          {/* Enviar o nome do agente */}
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                  <Bot className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">Enviar o nome do agente</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Cada mensagem enviada haverá o nome do agente no início da mensagem.
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={selectedRobot.tools.sendAgentName}
                                onCheckedChange={(checked) => setSelectedRobot({
                                  ...selectedRobot,
                                  tools: { ...selectedRobot.tools, sendAgentName: checked }
                                })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {configTab === 'horarios' && (
                  <div className="space-y-6">
                    <div className="bg-muted/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarClock className="w-4 h-4" />
                        <span>Sem horário configurado = robô sempre ativo (24h). Ative os dias desejados para limitar o funcionamento.</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {schedules.map((schedule, idx) => (
                        <div key={schedule.day_of_week} className="bg-muted/30 rounded-lg p-4">
                          <div className="flex items-center gap-4">
                            <Switch
                              checked={schedule.is_active}
                              onCheckedChange={(checked) => {
                                const updated = [...schedules];
                                updated[idx] = { ...updated[idx], is_active: checked };
                                setSchedules(updated);
                              }}
                            />
                            <span className="font-medium text-sm w-24">{getDayName(schedule.day_of_week)}</span>
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={schedule.start_time}
                                disabled={!schedule.is_active}
                                className="w-32"
                                onChange={(e) => {
                                  const updated = [...schedules];
                                  updated[idx] = { ...updated[idx], start_time: e.target.value };
                                  setSchedules(updated);
                                }}
                              />
                              <span className="text-muted-foreground text-sm">até</span>
                              <Input
                                type="time"
                                value={schedule.end_time}
                                disabled={!schedule.is_active}
                                className="w-32"
                                onChange={(e) => {
                                  const updated = [...schedules];
                                  updated[idx] = { ...updated[idx], end_time: e.target.value };
                                  setSchedules(updated);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const firstActive = schedules.find(s => s.is_active);
                          if (!firstActive) {
                            toast.error('Ative pelo menos um dia primeiro');
                            return;
                          }
                          setSchedules(schedules.map(s => ({
                            ...s,
                            is_active: true,
                            start_time: firstActive.start_time,
                            end_time: firstActive.end_time,
                          })));
                          toast.success('Horário copiado para todos os dias');
                        }}
                      >
                        Copiar para todos
                      </Button>
                      <Button
                        size="sm"
                        disabled={schedulesSaving}
                        onClick={() => saveSchedules(selectedRobot.id, schedules)}
                      >
                        {schedulesSaving ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Salvando...</>
                        ) : (
                          'Salvar horários'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border p-4 flex justify-center gap-4">
              <Button variant="ghost" onClick={() => setIsConfigOpen(false)} disabled={isSaving}>
                Voltar
              </Button>
              <Button onClick={handleSaveRobot} disabled={isSaving} className="bg-success hover:bg-success/90 text-white">
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar e publicar'
                )}
              </Button>
            </div>
          </div>

          {/* Test Chat Panel */}
          <div className="w-96 flex flex-col bg-muted/30">
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-end">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Perfil teste</span>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    PT
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {testMessages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Envie uma mensagem para testar o agente
                  </div>
                )}
                {testMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background border'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enviar mensagem"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoadingResponse && handleTestMessage()}
                  className="flex-1"
                  disabled={isLoadingResponse}
                />
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setTestMessages([])}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button 
                  size="icon" 
                  onClick={handleTestMessage} 
                  className="bg-success hover:bg-success/90"
                  disabled={isLoadingResponse}
                >
                  {isLoadingResponse ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Robôs</h1>
            <p className="text-muted-foreground">Gerencie agentes IA e automações</p>
          </div>
          
          <Button className="gap-2" onClick={handleCreateNew}>
            <Plus className="w-4 h-4" />
            Novo Robô
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{robots.length}</p>
                  <p className="text-sm text-muted-foreground">Total de robôs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Robôs ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Pause className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pausedCount}</p>
                  <p className="text-sm text-muted-foreground">Robôs pausados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalMessages.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Mensagens enviadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar robôs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Robots List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRobots.map((robot) => (
              <Card key={robot.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenConfig(robot)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 rounded-lg">
                        <AvatarImage src={robot.avatarUrl || undefined} alt={robot.name} />
                        <AvatarFallback className="rounded-lg bg-primary/10">
                          <Bot className="w-5 h-5 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{robot.name}</CardTitle>
                        {getStatusBadge(robot.status, robot.id)}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleStatus(robot.id); }}>
                          {robot.status === 'active' ? (
                            <>
                              <Pause className="w-4 h-4 mr-2" />
                              Pausar
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenConfig(robot); }}>
                          <Settings2 className="w-4 h-4 mr-2" />
                          Configurar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteRobot(robot.id); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="mt-2">{robot.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-normal">
                      {intelligenceOptions.find(i => i.value === robot.intelligence)?.label || robot.intelligence}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {toneOptions.find(t => t.value === robot.tone)?.label || robot.tone}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-4 h-4" />
                      <span>{robot.messagesCount.toLocaleString()} enviadas</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(robot.lastTriggered)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filteredRobots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">Nenhum robô encontrado</h3>
            <p className="text-muted-foreground mt-1">
              {searchQuery ? 'Tente uma busca diferente' : 'Crie seu primeiro robô para começar'}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
