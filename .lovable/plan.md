

# Parte 1: Treinamento por Instrucoes + Parte 2: Mini Chat Delma

## Escopo Total

Duas grandes features 100% aditivas: (1) sugestoes de melhoria de instrucoes gerais dos robos baseadas em padroes de atendentes humanos, com agendamento de aplicacao e rollback; (2) chat flutuante de comando da Delma no Cerebro.

---

## PARTE 1 — Treinamento com Base em Instrucoes

### 1.1 Migration: tabela `robot_change_schedule`

```sql
CREATE TABLE public.robot_change_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id uuid NOT NULL,
  suggestion_id uuid,
  current_instruction text NOT NULL,
  new_instruction text NOT NULL,
  affected_section text,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  applied_at timestamptz,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.robot_change_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage robot_change_schedule" ON public.robot_change_schedule
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### 1.2 Migration: tabela `delma_chat_logs`

```sql
CREATE TABLE public.delma_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  command text NOT NULL,
  action_type text NOT NULL,
  result text NOT NULL DEFAULT 'pending',
  result_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delma_chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage delma_chat_logs" ON public.delma_chat_logs
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### 1.3 Edge Function: `brain-learn-instruction-patterns` (NOVA)

- Busca conversas humanas dos ultimos 7 dias do Suporte com TMA abaixo da media e sem reabertura
- Busca instrucoes atuais de Julia e Sebastiao da tabela `robots`
- Para cada robo (escopo identico ao `brain-train-robots`: julia=estabelecimento, sebastiao=motoboy, delma=skip)
- Envia para AI com prompt contendo: instrucoes atuais, Q&As, tom, conversas filtradas por scope
- AI retorna sugestoes do tipo `melhoria_instrucao` com: `current_instruction`, `proposed_instruction`, `affected_section`, `compliance_status`, `compliance_notes`, `examples`
- Insere em `delma_suggestions` com `category: 'melhoria_instrucao'`, `content` contendo todos os campos acima + `robot_id`, `robot_name`
- Deduplicacao contra sugestoes existentes dos ultimos 14 dias

### 1.4 Edge Function: `brain-apply-robot-changes` (NOVA)

- Busca `robot_change_schedule` com `status = 'pending'` e `scheduled_for <= now()`
- Para cada registro: atualiza `robots.instructions` com `new_instruction`
- Marca `status = 'applied'`, registra `applied_at`
- Salva snapshot em `delma_memory` como data_signal
- config.toml: `verify_jwt = false`
- Agendamento via pg_cron para rodar diariamente as 04:00 UTC (01h BRT)

### 1.5 Frontend: Card de melhoria_instrucao no `DelmaSuggestionsTab.tsx`

- Adicionar `melhoria_instrucao` ao `categoryConfig` com icone `FileText` e cor especifica
- Quando `suggestion.category === 'melhoria_instrucao'`, renderizar card com:
  - Badge do robo alvo (Julia / Sebastiao)
  - Secao afetada (`content.affected_section`)
  - Diff visual lado a lado: instrucao atual (cinza) vs proposta (verde)
  - Score de confianca + badge de conformidade
  - Botoes: "Aprovar e Agendar" / "Editar e Agendar" / "Rejeitar"
- Ao aprovar: inserir em `robot_change_schedule` com `scheduled_for` = proximo 04:00 UTC
- Ao rejeitar: mesmo fluxo existente (feedback no delma_memory)

### 1.6 Frontend: Badge de rollback no `AdminRobos.tsx`

- Consultar `robot_change_schedule` com `status = 'applied'` para cada robo
- Se existir alteracao recente: exibir badge "Atualizado pela Delma — [data]"
- Botao "Ver alteracao": dialog com diff
- Botao "Reverter": restaura `current_instruction` no robo e registra sinal negativo no `delma_memory`

### 1.7 Botao "Analisar Instrucoes" na aba Sugestoes

- Adicionar botao ao lado de "Analisar Conversas" que invoca `brain-learn-instruction-patterns`

---

## PARTE 2 — Mini Chat da Delma

### 2.1 Edge Function: `delma-chat-command` (NOVA)

- Recebe `{ message, sessionHistory }` do frontend
- Classifica o comando via AI em categorias: `analise`, `treinamento`, `consulta`, `sugestoes`, `sistema`
- Para consultas (sem mutacao): executa e retorna resultado direto
- Para acoes (mutacao): retorna `{ requiresConfirmation: true, description, impact }` sem executar
- Recebe `{ message, confirmed: true, actionId }` para executar apos confirmacao
- Acoes possiveis:
  - `gerar_relatorio` → chama `brain-analysis` internamente
  - `treinar_robo` → chama `brain-train-robots` com filtro
  - `analisar_conversas` → chama `brain-learn-from-conversations`
  - `analisar_instrucoes` → chama `brain-learn-instruction-patterns`
  - `consultar_metricas` → query direta ao DB
  - `listar_sugestoes` → query `delma_suggestions`/`robot_training_suggestions`
  - `status_suporte` → query `conversations` ativas + `profiles` online
- Salva cada comando em `delma_chat_logs`
- config.toml: `verify_jwt = false`

### 2.2 Componente: `DelmaChatWidget.tsx` (NOVO)

- Botao flutuante fixo `bottom-4 right-4` com icone Brain + badge de sugestoes pendentes
- Ao clicar: expande painel 400x600 com:
  - Header: "Delma — Gerente de Suporte" + status
  - Area de mensagens com scroll
  - Chips de comando rapido clicaveis
  - Input + botao de envio
- Historico persiste na sessao (state local)
- Fluxo de confirmacao: quando AI retorna `requiresConfirmation`, exibe mensagem + botoes Confirmar/Cancelar
- Renderiza respostas com markdown (`react-markdown` ou `dangerouslySetInnerHTML`)

### 2.3 Integrar widget no `AdminBrain.tsx`

- Importar e renderizar `<DelmaChatWidget />` dentro do layout, apos o `</Tabs>`
- Passar contagem de sugestoes pendentes como prop

### 2.4 Secao "Historico de Comandos" na aba Evolucao

- No `DelmaEvolutionTab.tsx`, adicionar secao que busca `delma_chat_logs` (ultimos 30)
- Exibir: data/hora, comando, acao executada, resultado (sucesso/erro/cancelado)

---

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `supabase/functions/brain-learn-instruction-patterns/index.ts` | Analisa padroes humanos para instrucoes |
| `supabase/functions/brain-apply-robot-changes/index.ts` | Aplica instrucoes agendadas as 01h |
| `supabase/functions/delma-chat-command/index.ts` | Interpreta comandos do chat |
| `src/components/admin/DelmaChatWidget.tsx` | Chat flutuante da Delma |

## Arquivos a editar (adicoes apenas)

| Arquivo | Mudanca |
|---------|---------|
| `supabase/config.toml` | Adicionar 3 blocos `[functions.*]` |
| `src/components/admin/DelmaSuggestionsTab.tsx` | Adicionar categoria `melhoria_instrucao` + card com diff + aprovacao agendada + botao analisar instrucoes |
| `src/pages/admin/AdminBrain.tsx` | Importar e renderizar `DelmaChatWidget` |
| `src/pages/admin/AdminRobos.tsx` | Badge "Atualizado pela Delma" + rollback |
| `src/components/admin/DelmaEvolutionTab.tsx` | Secao historico de comandos |

## Migrations (2)

1. Criar tabela `robot_change_schedule`
2. Criar tabela `delma_chat_logs`

## Cron job (via insert tool)

- `brain-apply-robot-changes` diariamente as 04:00 UTC

