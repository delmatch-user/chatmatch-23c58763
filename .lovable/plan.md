

## Implementar Seleção de Atendentes/Agentes IA no Config do Robô

### Problema
Quando "Selecionar atendentes" é escolhido na configuração do robô, não aparece nenhuma lista de checkboxes para selecionar quais agentes (robôs IA como Sebastião e Júlia) o robô pode transferir. O campo `transferToAgentIds` não existe no modelo de dados nem no backend.

### Plano

**1. Adicionar `transferToAgentIds` ao tipo `RobotTools` (`src/hooks/useRobots.tsx`)**
- Novo campo: `transferToAgentIds: string[]` (lista de IDs de robôs permitidos)
- Default: `[]`

**2. Adicionar lista de checkboxes no UI (`src/pages/admin/AdminRobos.tsx`)**
- Quando `transferToAgentsMode === 'select'`, exibir checkboxes com todos os outros robôs (exceto o próprio)
- Similar à lista de departamentos que já funciona
- Cada checkbox mostra o nome do robô com ícone 🤖

**3. Filtrar robôs no backend (`supabase/functions/robot-chat/index.ts`)**
- Após buscar `otherRobots`, aplicar filtro similar ao de departamentos:
  - Se `transferToAgentsMode === 'select'`, limitar `availableRobotsForTransfer` aos IDs em `transferToAgentIds`
  - Se `transferToAgentsMode === 'all'`, manter todos

### Arquivos modificados
- `src/hooks/useRobots.tsx` — adicionar campo `transferToAgentIds`
- `src/pages/admin/AdminRobos.tsx` — adicionar checkboxes de robôs quando mode é "select"
- `supabase/functions/robot-chat/index.ts` — filtrar `availableRobotsForTransfer` pela config

