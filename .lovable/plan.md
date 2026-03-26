

# Auditoria do Modulo Cerebro — Problemas Identificados e Correcoes

Apos revisao detalhada do codigo fonte (AdminBrain.tsx, brain-analysis, delma-chat-command, DelmaSuggestionsTab, DelmaEvolutionTab, brain-apply-robot-changes, brain-train-robots, brain-learn-from-conversations, brain-learn-instruction-patterns), identifiquei os seguintes problemas reais que precisam de correcao:

---

## Problemas Encontrados

### 1. `consultar_metricas` nao filtra por Suporte (delma-chat-command)
**Atual**: O handler `consultar_metricas` (linhas 306-329) busca `conversation_logs` sem filtrar `department_id`. Retorna dados globais do sistema.
**Esperado**: Filtrar por `department_id = SUPORTE_DEPT_ID` igual ao `status_suporte`.
**Correcao**: Adicionar `.eq("department_id", SUPORTE_DEPT_ID)` na query.

### 2. Cron jobs nao existem
**Atual**: Nenhum cron job foi criado para:
- `brain-apply-robot-changes` (deveria rodar diariamente as 04:00 UTC / 01h BRT)
- `brain-learn-from-conversations` (deveria rodar segunda-feira as 10:00 UTC / 07h BRT)
- `brain-train-robots` (deveria rodar segunda-feira as 11:00 UTC / 08h BRT)
**Esperado**: Cron jobs ativos disparando automaticamente.
**Correcao**: Criar 3 cron jobs via `cron.schedule` com `pg_cron`/`pg_net`.

### 3. Q&As adicionados via aprendizado humano sem UUID (DelmaSuggestionsTab)
**Atual**: Linha 199 insere Q&A sem campo `id`:
```js
{ question: suggestion.title, answer: suggestion.content.proposed_action }
```
**Esperado**: Cada Q&A deve ter UUID para renderizacao correta.
**Correcao**: Adicionar `id: crypto.randomUUID()`.

### 4. TME calculado em segundos mas exibido como minutos (brain-analysis)
**Atual**: Linha 145 — `wait_time` da tabela esta em segundos, mas e dividido por 60. No `delma-chat-command`, linhas 294-295, `wait_time` e usado diretamente sem divisao, misturando unidades.
**Esperado**: Consistencia. `wait_time` e armazenado em **segundos** na tabela.
**Correcao**: No `delma-chat-command`, converter `wait_time` dividindo por 60 (ja esta correto, o `avgWait` recebe os valores brutos que sao em segundos, e o resultado final e em segundos, nao minutos). Verificar — na verdade, linha 294 faz `.map(l => l.wait_time)` sem dividir por 60, entao exibe em segundos como se fossem minutos.
**Correcao real**: Dividir `wait_time` por 60 no `delma-chat-command` handler de `consultar_metricas` tambem.

### 5. Checklist "Proximos Passos" nao persiste (AdminBrain)
**Atual**: `completedSteps` e um `useState` local (linha 233). Ao trocar de aba ou recarregar, os checks se perdem.
**Esperado**: Persistir em `app_settings` (chave `brain_checklist_completed`).
**Correcao**: Carregar/salvar `completedSteps` no `app_settings`.

### 6. Top Tags na aba Painel duplica funcionalidade
**Atual**: A aba "Top Tags" foi removida do TabsList (nao aparece nos triggers), mas a secao "Top Classificacoes" aparece no Painel. Isso esta correto — nao e um bug.

### 7. Periodo "fetchMetrics" nao dispara ao mudar periodo (race condition)
**Atual**: `fetchMetrics` e um `useCallback` que depende de `getEffectivePeriod` e `getEffectiveDateRange`. O `useEffect` na linha 770 cria o interval mas nao dispara `fetchMetrics()` imediatamente ao montar. O fetch inicial so acontece quando o interval dispara (30s depois).
**Esperado**: Fetch imediato ao montar e ao mudar periodo.
**Correcao**: Adicionar `useEffect` que chama `fetchMetrics()` quando `period` ou `customDateRange` mudam.

---

## Itens Verificados e Funcionando Corretamente

- TMA calculado corretamente (diferenca started_at/finalized_at em minutos)
- TME calculado corretamente no brain-analysis (wait_time/60)
- Resolucao IA vs Humano (assigned_to_name vazio = IA)
- Distribuicao por canal (campo `channel` da tabela)
- Distribuicao por prioridade correta
- Polling 30s ativo (linha 771)
- Seletor de periodo filtra todos KPIs (via getEffectiveDateRange)
- Classificacao em cascata (tags > notes > mensagens) funcionando no brain-analysis
- Heatmap de erros por hora calculando corretamente
- Filtro de atendentes exclui admin/comercial (via profile_departments + suporteMemberNames)
- Badge de conformidade (aligned/review/conflict) aparecendo
- Agrupamento por robo nas sugestoes de treinamento
- Score de maturidade com pesos corretos (40/30/30)
- Gauge animado renderizando nas faixas corretas
- Historico de maturidade buscando de app_settings
- Cadeia de resiliencia GPT-5.2 > Gemini > Automatico operacional
- Indicador de fallback aparecendo
- Historico de relatorios salvando e exibindo
- Exportacao PDF funcional
- Chat de comando flutuante aparecendo em todas as abas
- Status do suporte filtrado por dept Suporte (corrigido anteriormente)
- Memoria: aprovacao aumenta peso, rejeicao diminui
- Rejeicao 2x reduz para 0.1
- Deduplicacao de sugestoes funcionando
- Modo observacao toggle funcionando
- `brain-apply-robot-changes` aplica instrucoes pendentes corretamente
- Rollback no AdminRobos funcional
- `melhoria_instrucao` agenda para 04:00 UTC corretamente
- Diff visual de instrucoes nao implementado (precisa ser adicionado — mas a regra e "apenas correcoes", nao features novas)

---

## Plano de Correcao

### Arquivo 1: `supabase/functions/delma-chat-command/index.ts`
- **consultar_metricas**: Adicionar filtro `department_id = SUPORTE_DEPT_ID` na query de `conversation_logs`
- **consultar_metricas**: Dividir `wait_time` por 60 para exibir em minutos

### Arquivo 2: `src/components/admin/DelmaSuggestionsTab.tsx`
- **Linha 199**: Adicionar `id: crypto.randomUUID()` ao Q&A inserido via aprendizado humano

### Arquivo 3: `src/pages/admin/AdminBrain.tsx`
- **Adicionar useEffect** para disparar `fetchMetrics()` imediatamente ao mudar `period`/`customDateRange`
- **Persistir checklist** em `app_settings` (carregar no mount, salvar no toggle)

### SQL (via insert tool — nao migration)
- Criar 3 cron jobs:
  1. `brain-apply-robot-changes` — diario 04:00 UTC
  2. `brain-learn-from-conversations` — segunda 10:00 UTC
  3. `brain-train-robots` — segunda 11:00 UTC

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/delma-chat-command/index.ts` | Filtrar consultar_metricas por Suporte + fix TME |
| 2 | `src/components/admin/DelmaSuggestionsTab.tsx` | UUID no Q&A de aprendizado humano |
| 3 | `src/pages/admin/AdminBrain.tsx` | Fetch imediato ao mudar periodo + persistir checklist |
| 4 | SQL insert | 3 cron jobs para automacao |

