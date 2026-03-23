

## Plano: Adicionar toggle "Finalizar conversas" na UI de configuração de robôs

### Problema
A flag `canFinalize` existe no backend (`robot-chat` e `sync-robot-schedules`) e no hook `useRobots.tsx`, mas **não há toggle na interface** do admin para ativá-la/desativá-la. Sem isso, o robô nunca terá `canFinalize: true`.

### Alteração

#### `src/pages/admin/AdminRobos.tsx` — Aba Ferramentas > Funções

Adicionar um novo bloco de toggle na sub-aba "Funções", após os toggles existentes (ex: após "Editar contato" ou "Gerenciar etiquetas"):

- Ícone: `CheckCircle` (ou similar) com fundo vermelho/laranja
- Título: **"Finalizar conversas"**
- Descrição: "O agente poderá finalizar conversas quando identificar que o problema foi resolvido. Também será usado para auto-finalização por inatividade (quando o cliente não responde)."
- Switch ligado a `selectedRobot.tools.canFinalize`

Seguindo o mesmo padrão visual dos outros toggles na página.

### Detalhes técnicos
- Apenas 1 arquivo alterado: `src/pages/admin/AdminRobos.tsx`
- Mesmo padrão de `Switch` + `setSelectedRobot` já usado nos outros toggles
- Nenhuma alteração de backend necessária

