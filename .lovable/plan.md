# Delma — Agente Autônomo com Supervisão Humana

## Resumo

Transformar a Delma em um agente autônomo que observa o sistema, gera sugestões fundamentadas em dados, aprende com as decisões do gestor e nunca executa ações sem aprovação. Todas as mudanças são **aditivas** — nada existente será alterado LEMBRANDO QUE É FOCADA NO SUPORTE.

## Novas Tabelas (3)


| Tabela              | Finalidade                                                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delma_memory`      | Sinais de aprendizado + feedback do gestor. Campos: `id, type (data_signal/manager_feedback), source, content (jsonb), weight (float default 0.5), created_at, expires_at, related_suggestion_id`                                                                                                    |
| `delma_suggestions` | Fila unificada de sugestões pendentes. Campos: `id, category (robot_training/agent_goals/report_schedule), title, justification, content (jsonb), confidence_score (int 0-100), memories_used (jsonb), status (pending/approved/edited/rejected), reject_reason, decided_by, decided_at, created_at` |
| `agent_goals`       | Metas individuais dos atendentes. Campos: `id, agent_id, agent_name, metric (tma/volume/resolution_rate), current_value (float), suggested_value (float), status (pending/approved/rejected), suggested_at, decided_at, decided_by, reject_reason, suggestion_id`                                    |


RLS: admin + supervisor em todas (padrão existente).

## Nova Edge Function: `delma-autonomous-analysis`

Função única que executa a análise semanal completa. Será chamada por cron (segunda 7h) e sob demanda via botão.

**Lógica interna (3 módulos em sequência):**

1. **Metas de Atendentes** — Consulta `conversation_logs` das últimas 3 semanas por atendente, calcula TMA/volume/resolução, compara com metas atuais em `agent_goals`. Se 3 semanas consecutivas acima/abaixo, gera sugestão de ajuste ±10%.
2. **Relatórios Agendados Inteligentes** — Analisa `conversation_logs` para detectar padrões recorrentes (picos de erro por dia da semana, variações de volume por quinzena). Gera sugestões de novos agendamentos para `report_schedule`.
3. **Enriquecimento de Treinamento** — Lê `robot_training_suggestions` aprovadas + `delma_memory` para calcular confiança de novas sugestões do `brain-train-robots`. Atualiza `delma_suggestions` com flag "Alta confiança" quando similaridade com aprovações anteriores é alta.

**Em todos os casos:** a função consulta `delma_memory` para calibrar sugestões, suprime duplicatas, e insere resultados em `delma_suggestions`.

**Modelo AI:** `google/gemini-2.5-flash` via Lovable AI gateway (para análise de padrões e geração de justificativas).

## Mudanças no Frontend: `AdminBrain.tsx`

### Nova aba: "Sugestões da Delma" (após "Treinamento")

- Lista de cards de sugestão ordenados por `confidence_score` desc
- Cada card mostra: categoria (badge colorido), título, justificativa, score de confiança, memórias utilizadas (collapsible)
- Botões: Aprovar / Editar e Aprovar / Rejeitar
- Rejeitar abre campo "Por que?" → salva em `delma_memory` como `manager_feedback`
- Aprovar executa a ação correspondente:
  - `robot_training` → aplica Q&A no robô (lógica existente)
  - `agent_goals` → cria/atualiza registro em `agent_goals`
  - `report_schedule` → cria agendamento em `report_schedule`
- Badge com contagem de pendentes no tab

### Nova aba: "Evolução" (após "Sugestões")

- Gráfico de linha: taxa de aprovação por semana
- Cards: áreas com mais acertos vs mais rejeições
- Total de memórias ativas
- Linha do tempo de decisões (filtro por área e período)

### Toggle "Delma em modo observação"

- No header do Cérebro, ao lado do status
- Quando ativo: Delma gera memórias mas não mostra sugestões novas (filtra `delma_suggestions` com `created_at` < toggle_on)
- Persiste em `app_settings` com key `delma_observation_mode`

## Cron Job

```sql
select cron.schedule(
  'delma-autonomous-weekly',
  '0 7 * * 1', -- segunda 7h
  $$ select net.http_post(
    url:='https://jfbixwfioehqkussmhov.supabase.co/functions/v1/delma-autonomous-analysis',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{"source":"cron"}'::jsonb
  ) as request_id; $$
);
```

## Fluxo de Memória e Peso

```text
Sugestão criada → peso = 0.5
  ├─ Aprovada → peso sobe para 1.0, memória reforçada
  ├─ Rejeitada 1x → peso = 0.3
  └─ Rejeitada 2x consecutivas → peso = 0.1 (suprimida)

Memórias expiram após 90 dias sem reforço
```

## Arquivos a criar/editar


| Arquivo                                                 | Ação                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `supabase/functions/delma-autonomous-analysis/index.ts` | Criar                                                                                      |
| `src/pages/admin/AdminBrain.tsx`                        | Adicionar abas "Sugestões" e "Evolução", toggle observação, state/fetch para novas tabelas |
| Migration SQL                                           | Criar tabelas `delma_memory`, `delma_suggestions`, `agent_goals` com RLS                   |
| Cron job (insert SQL)                                   | Agendar execução semanal                                                                   |


## Ordem de implementação

1. Migration: criar as 3 tabelas com RLS
2. Edge Function `delma-autonomous-analysis`
3. Frontend: aba "Sugestões da Delma" com aprovação/rejeição/memória
4. Frontend: aba "Evolução" com gráficos e linha do tempo
5. Frontend: toggle "modo observação"
6. Cron job para execução semanal