# Plano: Notificações de Desempenho da Delma para Atendentes do Departamento Suporte

## Resumo

Criar um sistema onde o gestor pode enviar feedbacks individuais gerados pela IA (Delma) para cada atendente, com uma central de notificações visível pelo próprio atendente.

## 1. Banco de Dados

Criar tabela `agent_notifications`:

```sql
CREATE TABLE public.agent_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  sent_by uuid NOT NULL,
  period_days integer NOT NULL DEFAULT 7,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_notifications ENABLE ROW LEVEL SECURITY;

-- Atendente vê apenas as próprias notificações
CREATE POLICY "Agents can view own notifications"
  ON public.agent_notifications FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

-- Atendente pode marcar como lida
CREATE POLICY "Agents can update own notifications"
  ON public.agent_notifications FOR UPDATE TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- Admins/supervisores podem inserir e ver tudo
CREATE POLICY "Admins can manage notifications"
  ON public.agent_notifications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
```

## 2. Edge Function: `brain-agent-feedback`

Nova edge function que recebe `{ agentName, agentStats, teamAvgTma, teamAvgTme, period }` e chama a Lovable AI (GPT-5.2 com fallback para Gemini) para gerar o feedback no tom definido (formal/direto, com assinatura "Delma -- Gerente de Suporte"). Retorna `{ message: string }`.

## 3. Frontend — Aba Atendentes (`AdminBrain.tsx`)

Mudanças **apenas dentro da aba "Atendentes"** (não toca outras abas):

- **Botão "Notificar"** (ícone `Bell`) em cada card de agente, ao lado do nome
- **Indicador de status**: ícone `CheckCircle` (verde) se já notificado no período, `Clock` (amarelo) se pendente
- **Modal de pré-visualização** ao clicar em "Notificar":
  - Nome do atendente no topo
  - Resumo das métricas: conversas, TMA vs média, TME, top 3 tags, taxa de resolução
  - Botão "Gerar Feedback" que chama a edge function
  - Campo `Textarea` editável com a mensagem gerada
  - Botões "Enviar Notificação" e "Cancelar"
- Ao enviar, insere na tabela `agent_notifications` (precisa do `agent_id` — buscar por nome no `profiles`)

## 4. Central de Notificações do Atendente

Nova página `/notificacoes` com `ProtectedRoute`:

- Lista notificações do `agent_id = auth.uid()` em ordem decrescente
- Cada item mostra: data/hora, período de referência, mensagem completa
- Badge "Nova" para `is_read = false`
- Marca como lida ao expandir/abrir (`UPDATE agent_notifications SET is_read = true`)

**Sidebar**: Adicionar item "Notificações" (ícone `Bell`) no menu de Suporte, com badge de contagem de não lidas.

## 5. Detalhes Técnicos

- **Arquivo principal editado**: `src/pages/admin/AdminBrain.tsx` (modal + botão na aba Atendentes)
- **Novos arquivos**:
  - `supabase/functions/brain-agent-feedback/index.ts`
  - `src/pages/Notifications.tsx`
- **Arquivos modificados**:
  - `src/components/layout/Sidebar.tsx` (item "Notificações")
  - `src/App.tsx` (rota `/notificacoes`)
- **Nenhuma aba existente do Cérebro será alterada** (Dashboard, Conhecimento, Erros & Gaps, Top Tags, Relatório IA)