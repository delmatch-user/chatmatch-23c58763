

# Delma Inteligente: Sugestoes com Impacto, Anomalias e Previsoes

Quatro blocos 100% aditivos que tornam a Delma genuinamente assertiva. Nenhuma tabela, Edge Function ou componente existente sera alterado.

---

## Visao Geral das Entregas

```text
BLOCO 1 — Score de Impacto + Contexto Real nas Sugestoes
BLOCO 2 — Deteccao Autonoma de Anomalias (nova EF + UI)
BLOCO 3 — Previsoes no brain-analysis prompt + UI
BLOCO 4 — Ranking de Impacto Negativo + Relatorio Profundo
```

---

## BLOCO 1 — Sugestoes com Score de Impacto e Contexto Real

### 1.1 Enriquecer a geracao de sugestoes (3 Edge Functions existentes chamam AI)

Nas Edge Functions `brain-learn-from-conversations`, `brain-learn-instruction-patterns` e `delma-autonomous-analysis`, o prompt enviado a IA sera expandido para exigir os seguintes campos adicionais em cada sugestao:

- `impact_score` (0-100) com breakdown: `volume_weight`, `tma_reduction`, `recurrence`, `urgency`
- `data_window` (ex: "12/03 a 25/03")
- `conversation_count` (numero exato)
- `top_examples` (3 trechos anonimizados)
- `affected_entity` (robo ou atendente)
- `recurrence_pattern` ("pontual" | "semanal" | "cronico")
- `estimated_impact` (texto em linguagem natural)

**Regra de qualidade**: a AI sera instruida a descartar sugestoes sem dados reais suficientes. Sugestoes sem `conversation_count > 0` nao serao inseridas.

**Supressao inteligente**: antes de inserir, verificar:
- Mesmo titulo rejeitado nos ultimos 30 dias → descartar
- Mesmo titulo aprovado e ja aplicado → descartar (a menos que haja regressao)
- Mesmo titulo pendente 3+ vezes → marcar como "awaiting_attention"

### 1.2 UI — Card de sugestao com barra de impacto

No `DelmaSuggestionsTab.tsx`, adicionar:
- Barra colorida de impacto (verde <40, amarelo 40-70, laranja 70-85, vermelho >85)
- Ordenacao padrao por `impact_score` decrescente
- Collapsible "Por que este score?" com breakdown dos 4 componentes
- Estimativa em linguagem natural abaixo do titulo
- Badge laranja "Aguardando atencao" para sugestoes com 3+ aparicoes

**Nenhuma alteracao na estrutura da tabela `delma_suggestions`** — os novos campos ficam dentro do campo `content` (jsonb) que ja existe.

---

## BLOCO 2 — Deteccao Autonoma de Anomalias

### 2.1 Nova tabela: `delma_anomalies`

```sql
CREATE TABLE delma_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'yellow',
  description text NOT NULL,
  affected_entity text,
  affected_entity_id uuid,
  metric_current numeric,
  metric_baseline numeric,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  auto_suggestion_id uuid
);
ALTER TABLE delma_anomalies ENABLE ROW LEVEL SECURITY;
-- Admin/supervisor full access
CREATE POLICY "Admins can manage anomalies" ON delma_anomalies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
```

### 2.2 Nova Edge Function: `delma-anomaly-detector`

Roda a cada 15 minutos via cron job. Analisa:

**Volume**:
- TMA atual (ultimas 2h) vs media 7 dias → amarelo se >30%, vermelho se >60%
- Fila (`conversations` em_fila) > 5 por >10min → vermelho
- Volume por canal vs media horaria → amarelo se >50%

**Qualidade**:
- Taxa de transferencia de robo vs semana anterior → amarelo se >40%
- Atendente com TMA 2x acima da media do time na ultima 1h → amarelo
- Mesma tag em >5 conversas na ultima hora → vermelho (gap critico)

Ao detectar:
1. Insere em `delma_anomalies`
2. Gera sugestao tipo `anomalia_detectada` em `delma_suggestions` com contexto completo
3. Para severidade vermelha: insere em `agent_notifications` para admins

Resolve automaticamente anomalias antigas (>2h sem recorrencia).

### 2.3 Cron job

```sql
SELECT cron.schedule('delma-anomaly-detector-15min', '*/15 * * * *', $$
  SELECT net.http_post(
    url:='https://jfbixwfioehqkussmhov.supabase.co/functions/v1/delma-anomaly-detector',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```

### 2.4 UI — Alertas Ativos no topo do Painel

No `AdminBrain.tsx`, adicionar secao condicional acima dos KPIs na aba Painel:
- Query `delma_anomalies` onde `resolved_at IS NULL`
- Cards vermelhos primeiro, depois amarelos
- Cada card: icone severidade, descricao, entidade afetada, tempo desde deteccao
- Botao "Ver sugestao" → navega para aba Sugestoes
- Botao "Resolver" → dialog para registrar resolucao
- Secao oculta quando nao ha anomalias ativas

### 2.5 Config no `supabase/config.toml`

```toml
[functions.delma-anomaly-detector]
verify_jwt = false
```

---

## BLOCO 3 — Previsoes

### 3.1 Expandir prompt do `brain-analysis`

Adicionar ao `userMessage` (quando nao e `metricsOnly` e nao e `reqUserContext`) uma secao obrigatoria no prompt:

```
## Previsoes (OBRIGATORIO — gerar pelo menos 2)
Com base nos dados historicos fornecidos, gere previsoes estruturadas:
- Pico de volume previsto (dia/horario + percentual)
- Risco de gap de conhecimento (tema + tendencia + prazo)
- Risco de sobrecarga (projecao de fila)
- Degradacao de robo (tendencia de transferencias)

Formate como JSON array dentro de um bloco ```predictions``` com:
{ "description", "horizon" ("24h"|"7d"|"30d"), "confidence" (0-100), "type" ("volume"|"gap"|"overload"|"degradation") }
```

O response sera parseado no frontend para extrair o bloco `predictions`.

### 3.2 UI — Secao "Previsoes da Delma" no Painel

No `AdminBrain.tsx`, abaixo dos KPIs:
- Parsear `aiAnalysis` para extrair bloco ```predictions```
- Cards com icone por tipo, descricao, horizonte, barra de confianca
- Botao "Preparar agora" → abre chat da Delma com contexto pre-carregado

### 3.3 Micro-tendencia nos KPIs

Adicionar tooltip nos KPICards (TMA, TME, volume) usando `dailyTrends`:
- Calcular regressao linear simples das ultimas 4 semanas
- Seta ↑/→/↓ com cor
- Tooltip: "Tendencia: +X%/semana. Projecao 7 dias: Y"

---

## BLOCO 4 — Impacto Negativo e Relatorio Profundo

### 4.1 Ranking de Impacto Negativo — Aba Atendentes

No `AdminBrain.tsx`, nova secao na aba Atendentes:
- Calcular score de impacto negativo por atendente:
  - TMA relativo a media (peso 0.4)
  - Transferencias desnecessarias (peso 0.3) — via `transfer_logs`
  - Conversas alta prioridade sem resolucao (peso 0.3)
- Top 3 com badge vermelho e motivo principal
- Botao "Delma, analise isso" → abre chat com contexto

### 4.2 Ranking de Impacto Negativo — Aba Treinamento (por robo)

Nova secao na aba Treinamento:
- Taxa de transferencia por robo (semana atual vs anterior)
- Erros por categoria por robo
- Gaps nao treinados ha >14 dias
- Top 3 robos com maior impacto negativo

### 4.3 Relatorio de Impacto Profundo

Expandir o `systemMessage` no `brain-analysis` com 7 regras de profundidade obrigatorias:
1. Nunca linguagem vaga sem numero exato
2. QUEM, O QUE, QUANDO, QUANTO, POR QUE
3. Acao + responsavel + prazo + metrica de sucesso
4. Sempre comparar com periodo anterior
5. Causa raiz, nao sintoma
6. Top 3 acoes de maior impacto
7. Niveis de urgencia: CRITICO / IMPORTANTE / MONITORAR

---

## Resumo de Entregas

| # | Tipo | O que |
|---|------|-------|
| 1 | Migration | Tabela `delma_anomalies` + RLS |
| 2 | Edge Function | `delma-anomaly-detector` (nova) |
| 3 | Config | `supabase/config.toml` — entry para anomaly-detector |
| 4 | Cron | Job a cada 15min para anomaly-detector |
| 5 | Edge Function | `brain-learn-from-conversations` — expandir prompt com impact_score + contexto |
| 6 | Edge Function | `brain-learn-instruction-patterns` — idem |
| 7 | Edge Function | `delma-autonomous-analysis` — idem |
| 8 | Edge Function | `brain-analysis` — adicionar previsoes no prompt + regras de profundidade |
| 9 | Frontend | `DelmaSuggestionsTab.tsx` — barra de impacto, ordenacao, breakdown, badge |
| 10 | Frontend | `AdminBrain.tsx` — alertas ativos, previsoes, micro-tendencias, ranking impacto negativo |

