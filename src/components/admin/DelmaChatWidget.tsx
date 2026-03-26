import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, Send, X, Loader2, CheckCircle2, XCircle, MessageSquare, BarChart3, Bot, Sparkles, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  { label: '📄 Analisar instruções', command: 'Analisar instruções dos robôs' },
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
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
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || 'Sem resposta.',
        requiresConfirmation: data.requiresConfirmation,
        actionId: data.actionId,
        actionType: data.actionType,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
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

      // Mark the confirmation message as confirmed
      setMessages(prev => prev.map(m =>
        m.actionId === actionId ? { ...m, confirmed: true, requiresConfirmation: false } : m
      ));

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || '✅ Ação executada.',
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Erro ao executar: ${e.message}`,
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
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '❌ Ação cancelada.',
    }]);
  }, []);

  const renderMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* Floating button */}
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

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[400px] h-[600px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
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
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50'
                )}>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
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
                <div className="bg-secondary/50 rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Quick commands */}
          <div className="px-3 py-2 border-t border-border/50">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {quickCommands.map(cmd => (
                <button
                  key={cmd.command}
                  onClick={() => sendMessage(cmd.command)}
                  disabled={loading}
                  className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
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
    </>
  );
}
