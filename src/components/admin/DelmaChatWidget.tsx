import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, Send, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  requiresConfirmation?: boolean;
  actionId?: string;
  actionType?: string;
  confirmed?: boolean;
}

interface DelmaChatWidgetProps {
  pendingSuggestionsCount?: number;
}

const quickCommands = [
  { label: '📊 Status do suporte', command: 'Status do suporte' },
  { label: '🤖 Treinar robôs', command: 'Treinar robôs agora' },
  { label: '📋 Sugestões pendentes', command: 'Quais sugestões estão pendentes?' },
  { label: '📈 Métricas de hoje', command: 'Como está o TMA hoje?' },
  { label: '⚡ Alertas', command: 'Tem algum problema agora?' },
  { label: '🏆 Ranking', command: 'Compare os atendentes desta semana' },
];

export function DelmaChatWidget({ pendingSuggestionsCount = 0 }: DelmaChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: '🧠 Olá! Sou a **Delma**, sua Gerente de Suporte IA.\n\nPosso ajudar com relatórios, treinamento de robôs, métricas e mais. O que precisa?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const sessionHistory = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('delma-chat-command', {
        body: { message: text, sessionHistory, userId: authData?.user?.id },
      });
      if (error) throw error;

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: data.response || 'Sem resposta.',
        requiresConfirmation: data.requiresConfirmation,
        actionId: data.actionId, actionType: data.actionType,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: `❌ Erro: ${e.message || 'Falha na comunicação'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const handleConfirm = useCallback(async (actionId: string) => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('delma-chat-command', {
        body: { message: '', confirmed: true, actionId, userId: authData?.user?.id },
      });
      if (error) throw error;
      setMessages(prev => prev.map(m =>
        m.actionId === actionId ? { ...m, confirmed: true, requiresConfirmation: false } : m
      ));
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant', content: data.response || '✅ Ação executada.',
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant', content: `❌ Erro ao executar: ${e.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCancel = useCallback((actionId: string) => {
    setMessages(prev => prev.map(m =>
      m.actionId === actionId ? { ...m, confirmed: true, requiresConfirmation: false } : m
    ));
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: 'assistant', content: '❌ Ação cancelada.',
    }]);
  }, []);

  // Handle clicks on action buttons inside rendered HTML
  const handleBubbleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const actionBtn = target.closest('[data-delma-action]') as HTMLElement;
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-delma-action');
      if (action) {
        const commandMap: Record<string, string> = {
          sugestoes_pendentes: 'Quais sugestões estão pendentes?',
        };
        // Dynamic robot training
        if (action.startsWith('treinar_')) {
          const robotName = action.replace('treinar_', '');
          sendMessage(`Treinar ${robotName} agora`);
        } else if (commandMap[action]) {
          sendMessage(commandMap[action]);
        }
      }
    }
  }, [sendMessage]);

  const isHtml = (text: string) => text.includes('<div class="delma-');

  const renderContent = (text: string) => {
    if (isHtml(text)) return text;
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
        >
          <Brain className="w-6 h-6" />
          {pendingSuggestionsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
              {pendingSuggestionsCount > 9 ? '9+' : pendingSuggestionsCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[420px] h-[620px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Delma — Gerente de Suporte</p>
                <div className="flex items-center gap-1">
                  <div className={cn("w-2 h-2 rounded-full", loading ? "bg-warning animate-pulse" : "bg-success")} />
                  <span className="text-[10px] text-muted-foreground">{loading ? 'Processando...' : 'Online'}</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" onClick={handleBubbleClick}>
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50',
                  isHtml(msg.content) && msg.role === 'assistant' ? 'delma-rich-bubble' : ''
                )}>
                  <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                  {msg.requiresConfirmation && !msg.confirmed && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border/30">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleConfirm(msg.actionId!)} disabled={loading}>
                        <CheckCircle2 className="w-3 h-3" /> Confirmar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCancel(msg.actionId!)}>
                        <XCircle className="w-3 h-3" /> Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary/50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Buscando dados...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick commands */}
          <div className="px-3 py-2 border-t border-border/50">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {quickCommands.map(cmd => (
                <button key={cmd.command} onClick={() => sendMessage(cmd.command)} disabled={loading}
                  className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
                placeholder="Peça algo para a Delma..."
                disabled={loading}
                className="flex-1 bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delma rich card styles */}
      <style>{`
        .delma-rich-bubble { padding: 0 !important; background: transparent !important; }
        .delma-card { border: 1px solid hsl(var(--border)); border-radius: 0.5rem; overflow: hidden; background: hsl(var(--card)); }
        .delma-card-header { padding: 0.5rem 0.75rem; font-weight: 600; font-size: 0.8rem; background: hsl(var(--primary) / 0.1); border-bottom: 1px solid hsl(var(--border)); }
        .delma-card-body { padding: 0.625rem 0.75rem; font-size: 0.8rem; }
        .delma-card-actions { padding: 0.5rem 0.75rem; border-top: 1px solid hsl(var(--border)); display: flex; gap: 0.375rem; flex-wrap: wrap; }
        .delma-metric { padding: 0.15rem 0; line-height: 1.4; }
        .delma-metric-value { font-weight: 700; color: hsl(var(--primary)); }
        .delma-divider { height: 1px; background: hsl(var(--border)); margin: 0.375rem 0; }
        .delma-section-title { font-weight: 600; font-size: 0.75rem; margin-top: 0.25rem; margin-bottom: 0.15rem; }
        .delma-tag { display: inline-block; padding: 0.1rem 0.375rem; border-radius: 0.25rem; font-size: 0.65rem; background: hsl(var(--muted)); margin: 0.1rem; }
        .delma-tag-green { background: hsl(142 76% 36% / 0.2); color: hsl(142 76% 46%); }
        .delma-tag-yellow { background: hsl(45 93% 47% / 0.2); color: hsl(45 93% 47%); }
        .delma-tag-red { background: hsl(0 84% 60% / 0.2); color: hsl(0 84% 60%); }
        .delma-alert { padding: 0.5rem; border-radius: 0.375rem; margin-bottom: 0.375rem; border-left: 3px solid; font-size: 0.75rem; }
        .delma-alert.delma-tag-red { border-color: hsl(0 84% 60%); background: hsl(0 84% 60% / 0.05); }
        .delma-alert.delma-tag-yellow { border-color: hsl(45 93% 47%); background: hsl(45 93% 47% / 0.05); }
        .delma-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
        .delma-table th { text-align: left; padding: 0.25rem 0.5rem; border-bottom: 1px solid hsl(var(--border)); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
        .delma-table td { padding: 0.25rem 0.5rem; border-bottom: 1px solid hsl(var(--border) / 0.5); }
        .delma-table tr:last-child td { border-bottom: none; }
        .delma-action-btn { padding: 0.25rem 0.625rem; border-radius: 0.375rem; font-size: 0.7rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: none; cursor: pointer; font-weight: 500; }
        .delma-action-btn:hover { opacity: 0.9; }
      `}</style>
    </>
  );
}
