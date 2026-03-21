

## Plano: "Logs IA" e Histórico Completo para Suporte

### Problema atual
- A página **Histórico** filtra por `finalized_by = user.id` — cada atendente vê apenas as próprias finalizações.
- Não existe uma página dedicada para acompanhar logs de conversas finalizadas por robôs/IA.

### O que será feito

**1. Alterar Histórico para Suporte ver tudo do departamento**
- Em `src/pages/History.tsx`, quando o usuário pertence ao departamento Suporte, buscar `conversation_logs` filtrado por `department_id = SUPORTE_DEPARTMENT_ID` em vez de `finalized_by = user.id`.
- Isso permite que todos do Suporte vejam todas as finalizações do departamento.

**2. Criar página "Logs IA" (`/logs-ia`)**
- Nova página `src/pages/AILogs.tsx` que lista conversas do departamento Suporte finalizadas por robôs (onde `assigned_to_name` contém nomes de robôs ou `finalized_by` é nulo/robô).
- Filtros: busca por nome/telefone, período, canal, tag de taxonomia.
- Cada card mostra: nome do contato, canal, tag de taxonomia, resumo invisível (do `handoff_summary` se disponível nos logs), protocolo, e botão para expandir mensagens.
- Acessível a todos os membros do departamento Suporte.

**3. Adicionar rota e navegação**
- Adicionar rota `/logs-ia` em `src/App.tsx` com `ProtectedRoute`.
- Adicionar item "Logs IA" no sidebar (`src/components/layout/Sidebar.tsx`) visível apenas para membros do Suporte (com ícone `Bot`).

**4. RLS — sem alteração necessária**
- A tabela `conversation_logs` já possui policy `Department members can view department logs` que permite SELECT quando `department_id` está nos departamentos do usuário. Membros do Suporte já podem ler todos os logs do departamento.

### Arquivos envolvidos
- `src/pages/History.tsx` — alterar query para Suporte
- `src/pages/AILogs.tsx` — nova página
- `src/App.tsx` — nova rota
- `src/components/layout/Sidebar.tsx` — novo item de navegação

