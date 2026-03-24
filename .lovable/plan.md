

## Plano: Criar aba "Cérebro" no painel admin — Delma como Gerente do Suporte

### Visão geral

Criar uma nova página admin "Cérebro" que centraliza a Delma como gerente inteligente do departamento de Suporte. A página terá seções para: visão geral de desempenho com insights de IA, geração de relatórios de melhoria, identificação de erros/gaps, e configuração de envio automático de emails com métricas.

### O que será construído

**1. Página `AdminBrain.tsx`** — Nova aba no painel admin com:
- **Painel de Desempenho**: Cards com KPIs do Suporte (TMA, TME, conversas/dia, taxa de resolução por IA vs humano)
- **Análise Inteligente**: Botão para gerar análise completa via IA (Gemini) que identifica:
  - Principais problemas recorrentes
  - Erros e gaps de conhecimento dos robôs
  - Sugestões de melhoria com ações concretas
  - Comparativo de performance entre períodos
- **Relatório de Erros**: Lista de conversas onde houve transferência forçada, cliente insatisfeito, ou gaps identificados
- **Email de Desempenho**: Configuração para envio periódico (diário/semanal) de resumo por email aos admins com métricas e alertas

**2. Edge Function `brain-analysis`** — Endpoint que:
- Coleta métricas agregadas do Suporte (conversation_logs)
- Compara com período anterior para tendências
- Usa Gemini para gerar insights em markdown
- Identifica padrões de erro e sugere melhorias

**3. Edge Function `brain-email-report`** — Endpoint para:
- Gerar e enviar email HTML com resumo de desempenho
- Métricas: conversas totais, TMA, TME, top motivos, taxa IA vs humano
- Alertas: picos de espera, quedas de performance

### Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | **Novo** — Página "Cérebro" |
| `src/components/layout/Sidebar.tsx` | Adicionar item "Cérebro" no menu admin |
| `src/App.tsx` | Adicionar rota `/admin/cerebro` |
| `supabase/functions/brain-analysis/index.ts` | **Novo** — Edge function de análise inteligente |
| `supabase/functions/brain-email-report/index.ts` | **Novo** — Edge function de email de desempenho |

### Detalhes técnicos

**Sidebar — novo item admin:**
```typescript
{ icon: Brain, label: 'Cérebro', path: '/admin/cerebro' },
```

**brain-analysis:** Consulta `conversation_logs` dos últimos N dias (7/15/30), calcula métricas agregadas (TMA, TME, volume, taxa IA vs humano, top tags), compara com período anterior, e envia tudo para Gemini com prompt de "gerente de suporte" para gerar insights estruturados.

**brain-email-report:** Gera HTML com as métricas e envia via integração de email (ou salva para visualização). Inclui tabela de KPIs, gráfico de tendência simplificado, e lista de alertas.

**AdminBrain.tsx — Estrutura:**
- Tabs: "Visão Geral" | "Análise IA" | "Erros & Gaps" | "Email Automático"
- Visão Geral: Cards de KPI + mini gráficos
- Análise IA: Botão de geração + resultado em markdown renderizado
- Erros & Gaps: Lista filtrada de logs com problemas
- Email: Form de configuração (frequência, destinatários, horário)

### Escopo da primeira entrega

Para não sobrecarregar, a implementação será progressiva:
1. **Fase 1 (esta entrega)**: Página com KPIs, análise IA via edge function, e listagem de erros/gaps
2. **Fase 2 (futura)**: Email automático com pg_cron + template HTML

