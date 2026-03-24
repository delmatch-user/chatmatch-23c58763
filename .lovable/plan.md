

# Plano: Evolução do Módulo Cérebro da Delma

O arquivo `AdminBrain.tsx` atualmente tem ~1440 linhas e este pedido adiciona dezenas de funcionalidades novas em todas as 5 abas + Top Tags. Para manter qualidade e não quebrar lógica existente, o trabalho será dividido em **3 fases** implementadas sequencialmente.

---

## Fase 1 — Dashboard + Infraestrutura

### 1.1 Seletor de período expandido
- Adicionar opções "hoje", "ontem", "personalizado" ao seletor existente (mantendo 7/15/30 dias)
- Para "personalizado", exibir date range picker com Popover + Calendar
- O período filtra todos os KPIs (já funciona assim via `period` state)

### 1.2 Novos KPIs: Taxa de Abandono e CSAT
- **Taxa de Abandono**: calcular no `brain-analysis` edge function — conversas com status `em_fila` que foram finalizadas sem `assigned_to` (sem atendimento humano ou IA)
- **CSAT**: como não existe tabela de avaliações, criar um KPI placeholder que mostra "Sem dados" até que avaliações sejam implementadas, ou buscar de `app_settings` se houver
- Adicionar 2 novos KPICards na grid

### 1.3 Gráfico de tendência TMA/TME
- Adicionar `LineChart` (Recharts) com dados diários de TMA e TME ao longo do período
- Requer que o backend retorne `dailyTrends: { date, tma, tme }[]` — atualizar `brain-analysis`

### 1.4 Donut chart para Canais
- Substituir badges por `PieChart` (Recharts) com `innerRadius` para efeito donut
- Legenda com percentuais

### 1.5 Sparkline para Prioridades Urgentes
- Mini `LineChart` sem eixos mostrando evolução diária das urgentes (7 dias)
- Requer dados diários do backend

### 1.6 Indicador de status do sistema
- Badge no topo: "Online" (verde), "Degradado" (amarelo se fallback), "Offline" (vermelho se erro)
- Mostrar timestamp da última sincronização (já existe `lastUpdated`)

---

## Fase 2 — Conhecimento + Erros & Gaps + Top Tags

### 2.1 Gauge animado para Score de Maturidade
- Implementar gauge com SVG semicircular com faixas vermelho/amarelo/verde
- Animação CSS de preenchimento

### 2.2 Histórico do score (30 dias)
- Salvar score diário em `app_settings` (key: `brain_maturity_history`)
- Exibir `LineChart` com últimos 30 pontos

### 2.3 Tendência por tema + Volume
- Adicionar coluna "Volume" e indicador de tendência (seta verde/amarela/vermelha) comparando com período anterior
- Requer `prevTopTags` do backend

### 2.4 Checklist interativo de próximos passos
- Permitir marcar como concluído via state local (sem persistência no banco inicialmente)

### 2.5 Botão "Treinar Tema" com modal
- Dialog para registrar ação de treinamento (textarea + botão salvar)
- Salvar em `app_settings` com key `brain_training_log`

### 2.6 Filtros na aba Erros
- Adicionar seletor de período e filtro por categoria no topo (já tem sub-tabs parciais)

### 2.7 Cards expansíveis para resumos
- Transformar resumos em `Collapsible` cards com motivo, volume, prioridade e link para conversas

### 2.8 Top 10 barras horizontais para erros
- Já existe parcialmente — melhorar para top 10 com cores

### 2.9 Reincidência e Mapa de Calor
- Badge "Reincidente" para motivos presentes em múltiplos períodos
- Mapa de calor por hora usando grid com opacidade variável

### 2.10 Top Tags evoluído
- Gráfico de barras horizontal interativo com tooltip de exemplos
- Filtros por canal e período
- Variação percentual vs período anterior
- Badge "Novo" para tags emergentes
- Botão "Agrupar similares" (toggle)

---

## Fase 3 — Atendentes + Relatório IA

### 3.1 Ranking visual (pódio)
- Top 3 agentes com ícones de medalha (ouro/prata/bronze) no topo da aba

### 3.2 Barras empilhadas por canal
- Mini `BarChart` em cada card de agente mostrando WhatsApp/Instagram/Machine
- Requer `channelBreakdown` por agente do backend

### 3.3 Taxa de Resolução individual
- % de conversas resolvidas sem transferência — calcular no backend

### 3.4 Status ao vivo dos agentes
- Buscar `profiles.status` em tempo real + contar `conversations` abertas por agente

### 3.5 Painel lateral de histórico
- Sheet lateral ao clicar no agente com desempenho dos últimos 30 dias

### 3.6 Alerta visual TMA acima da média
- Já existe parcialmente (badge vermelho/amarelo/verde) — adicionar ícone de alerta pulsante

### 3.7 Histórico de relatórios
- Salvar relatórios gerados em nova tabela `brain_reports` (id, created_at, period, provider, content, context)
- Listar com data, modelo e botão para reabrir

### 3.8 Exportar PDF
- Usar `html2pdf.js` (já presente no projeto) para exportar relatório com branding Delma

### 3.9 Agendamento automático
- Reutilizar padrão de `report_schedule` — criar config para relatório do Cérebro

### 3.10 Comparativo de períodos no relatório
- Já existe no prompt da IA — tornar mais visual no frontend com tabela comparativa

### 3.11 Detalhamento de fallback
- Capturar e exibir status code + motivo do erro do provider principal

### 3.12 Campo de contexto adicional
- Textarea antes de gerar relatório para observações manuais
- Enviar como parte do prompt para a IA

---

## Alterações técnicas

### Backend (`brain-analysis` edge function)
- Adicionar `dailyTrends` (TMA/TME por dia) ao response
- Adicionar `prevTopTags` para comparação de tags
- Adicionar `abandonRate` (taxa de abandono)
- Adicionar `agentChannelBreakdown` por agente
- Adicionar `agentResolutionRate` (sem transferência)

### Nova tabela: `brain_reports`
- Migration para criar tabela com RLS para admin/supervisor

### Frontend: componentização
- Extrair sub-componentes para cada aba (BrainDashboardTab, BrainKnowledgeTab, etc.) para manter o arquivo principal gerenciável

### Preservação garantida
- Polling de 30s: mantido sem alteração
- Cadeia de resiliência IA: GPT-5.2 → Gemini Flash → Automático — intocada
- Filtro de perfis admin (Fábio/Arthur): preservado em `filterMetrics`
- Normalização de tags: `normalizeTag` e `normalizeTopTags` inalterados
- Realtime subscription: mantida

---

## Ordem de implementação sugerida

Dado o volume, recomendo implementar em **3 mensagens** separadas:
1. **Fase 1** — Dashboard (seletor, KPIs, gráficos, status)
2. **Fase 2** — Conhecimento + Erros + Top Tags
3. **Fase 3** — Atendentes + Relatório IA

Cada fase será funcional independentemente. Posso começar pela Fase 1?

