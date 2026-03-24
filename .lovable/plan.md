

## Plano: Cérebro em Tempo Real — Delma como Gerente do Suporte

### Visao geral

Transformar a pagina "Cerebro" para que a Delma exiba metricas e dados em tempo real automaticamente ao abrir a pagina, sem necessidade de clicar em "Gerar Analise". A geracao de relatorios IA continua sob demanda. Nova secao "O que a Delma anda aprendendo" mostrara padroes e insights que ela detecta continuamente.

### O que muda

**1. Dados em tempo real (auto-load ao montar + polling/realtime)**
- KPIs (Total Conversas, TMA, TME, Resolucao IA) carregam automaticamente ao abrir a pagina
- Performance dos agentes, top tags, canais e prioridades atualizam em tempo real
- Conversas problematicas (Erros & Gaps) carregam automaticamente
- Polling a cada 30s para manter dados frescos + realtime subscription em `conversation_logs`
- Indicador "ultima atualizacao" no header

**2. Relatorio IA sob demanda (sem mudanca conceitual)**
- Botao "Gerar Relatorio da Delma" continua existindo para a analise profunda via Gemini
- Separado visualmente — fica em aba propria "Relatorio IA"

**3. Nova secao: "O que a Delma anda aprendendo"**
- Card dedicado mostrando padroes que a Delma detecta dos dados em tempo real:
  - Tags mais frequentes nos ultimos 7 dias com tendencia (subindo/descendo)
  - Horarios de pico de atendimento
  - Agentes com melhor/pior performance
  - Percentual de resolucao IA vs periodo anterior
- Calculado client-side a partir dos dados ja carregados

**4. Identidade da Delma reforçada**
- Header com avatar/persona da Delma
- Status "Online — Monitorando o suporte" com indicador verde pulsante
- Linguagem na UI referenciando a Delma em terceira pessoa

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Reescrever: auto-fetch metricas, realtime, nova secao "aprendizados", relatorio IA sob demanda |
| `supabase/functions/brain-analysis/index.ts` | Dividir: novo endpoint leve `brain-metrics` para dados raw (sem IA), manter `brain-analysis` para relatorio IA |

### Detalhes tecnicos

**Fluxo ao abrir a pagina:**
1. `useEffect` dispara `fetchMetrics()` imediatamente (chama edge function com flag `metricsOnly: true`)
2. Realtime subscription em `conversation_logs` para re-fetch ao detectar INSERT
3. Polling de 30s como fallback
4. KPIs, agentes, tags, erros todos populam sem interacao do usuario

**Edge function `brain-analysis` — dois modos:**
- `{ metricsOnly: true, period }` → retorna apenas `metrics` (sem chamar Gemini) — rapido
- `{ period }` (sem flag) → retorna `metrics` + `aiAnalysis` — sob demanda

**Nova secao "Aprendizados da Delma":**
- Calcula client-side: tendencias de tags (compara semana atual vs anterior), horarios de pico (agrupa logs por hora), alertas automaticos (TMA acima de threshold, fila crescendo)
- Card com icone de lampada e linguagem tipo "A Delma notou que..."

**Tabs reorganizadas:**
1. "Painel" — KPIs em tempo real + aprendizados + agentes + tags (tudo auto)
2. "Erros & Gaps" — conversas problematicas (auto)
3. "Relatorio IA" — geracao sob demanda com botao

