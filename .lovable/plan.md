## Plano: Botão de Relatório IA na página Logs IA

### O que será feito

Adicionar um botão "Relatório" na página Logs IA, visível apenas para admins e supervisores do Suporte. Ao clicar, abre um dialog com filtros de período (7/15/30 dias) e por IA atendente (Delma, Sebastião, Julia). O relatório gerado pela IA mostrará as principais causas de contato e as soluções/respostas dadas.

### Alterações

#### 1. Nova Edge Function: `supabase/functions/ai-logs-report/index.ts`

- Recebe `{ period: 7|15|30, agentName?: string }` via POST
- Busca `conversation_logs` do departamento Suporte onde `finalized_by IS NULL` (robô)
- Se `agentName` fornecido, filtra por `assigned_to_name = agentName`
- Envia para Lovable AI com prompt focado em:
  - Principais causas/motivos de contato dos clientes (motoboys/estabelecimentos)
  - Principais respostas/soluções dadas pela IA para cada problema
- Retorna relatório markdown

#### 2. Alteração: `src/pages/AILogs.tsx`

- Importar `useAuth` para checar `isAdmin` e `isSupervisor`
- Adicionar estado para dialog de relatório, período selecionado, agente selecionado, loading e resultado
- No header, ao lado do badge "X conversas IA", adicionar botão "Relatório" (ícone `FileText`) — condicional a `isAdmin || isSupervisor`
- Dialog com:
  - Select de período: 7 dias, 15 dias, 30 dias
  - Select de IA atendente: Todas, Delma, Sebastião, Julia
  - Botão "Gerar Relatório"
  - Área de resultado renderizando o markdown retornado
  - Botão copiar relatório  
  Botão de Download Relatorio em PDF

### Detalhes Técnicos

- Edge function usa `SUPABASE_SERVICE_ROLE_KEY` para bypass RLS
- Prompt da IA será em português, focado em categorizar causas e soluções
- Modelo: `google/gemini-2.5-flash`
- Autenticação via JWT no header