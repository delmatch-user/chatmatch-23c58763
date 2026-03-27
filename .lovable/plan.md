# Feedback semanal automático para todos os atendentes + limpeza

## Problema

Atualmente o envio de feedback e manual (um atendente por vez). O usuario quer:

1. Botao "Notificar Todos" que gera e envia feedback para TODOS os atendentes do Suporte  de uma vez
2. Periodo fixo semanal (7 dias)
3. Limpar as notificacoes duplicadas/excessivas existentes

## Mudancas

### 1. Migration — Limpar notificacoes existentes

- Deletar todas as `agent_notifications` existentes para comecar limpo
- Adicionar constraint unique `(agent_id, period_days)` com janela semanal via coluna `week_start` (date) para evitar duplicatas futuras

### 2. `src/pages/admin/AdminBrain.tsx` — Botao "Notificar Todos"

- Adicionar funcao `sendAllNotifications()` que itera sobre todos os `agentStats` do metrics:
  - Para cada atendente, chama `brain-agent-feedback` para gerar a mensagem
  - Insere na `agent_notifications` com `period_days: 7`
  - Pula atendentes ja notificados na semana atual
- Adicionar botao "Notificar Todos" ao lado do seletor de atendente individual
- Mostrar progresso (ex: "Enviando 3/5...")
- Fixar periodo em 7 dias para o feedback

### 3. UI — Indicador de status em massa

- Na lista de atendentes, mostrar quantos ja foram notificados vs pendentes na semana
- Badge "Todos Notificados" quando completo

### Detalhes tecnicos

**sendAllNotifications:**

```typescript
const sendAllNotifications = async () => {
  const agents = metrics.agentStats.filter(a => !agentNotifications[profileIdMap[a.name]]);
  for (const agent of agents) {
    // 1. Gerar feedback via edge function
    // 2. Inserir em agent_notifications
    // 3. Atualizar progresso
  }
};
```

**Migration SQL:**

```sql
DELETE FROM agent_notifications;
```