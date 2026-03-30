

# Gestão de status de tarefas na agenda + modal de tarefas do dia

## Mudanças

### 1. Adicionar coluna `task_status` na tabela `sdr_appointments` (migration)

```sql
ALTER TABLE sdr_appointments ADD COLUMN task_status text NOT NULL DEFAULT 'pending';
-- Valores: 'pending', 'completed', 'overdue'
```

RLS já cobre — atendentes precisam poder atualizar o status das suas tarefas:
```sql
CREATE POLICY "Users can update own appointments status"
ON sdr_appointments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### 2. `src/services/sdrApi.ts` — Expor `taskStatus` no tipo e adicionar método

- Adicionar `taskStatus` ao `SDRAppointment` interface
- Mapear `task_status` no `fetchAppointments`
- Adicionar `updateTaskStatus(id, status)` que faz `UPDATE sdr_appointments SET task_status = status`

### 3. `src/pages/sdr/SDRSchedulingPage.tsx` — Duas mudanças principais

**A) Clicar na data abre modal com lista de tarefas do dia (não o form de criação)**

Novo modal "Tarefas do dia" mostrando todas as tarefas daquela data com:
- Horário, título, tipo (badge colorido), nome do atendente
- Badges de status: Pendente (amarelo), Concluído (verde), Atrasado (vermelho)
- Botões para marcar como concluído/pendente (atendente pode alterar as suas; supervisor/admin todas)
- Botão "+" para abrir o form de criação existente

**B) Cálculo automático de "atrasado"**

No render, se `task_status === 'pending'` e data+horário já passaram → exibir como "Atrasado" visualmente. Ao abrir o modal do dia, verificar e atualizar no banco as que estão atrasadas.

**C) No calendário**, mostrar indicador de cor por status:
- Verde: concluído
- Amarelo: pendente
- Vermelho: atrasado (data/hora passada e ainda pendente)

### Fluxo

```text
Fabio cria tarefa → Yasmin vê na agenda
Yasmin clica no dia → modal com todas tarefas do dia
Yasmin marca "Concluído" → badge verde
Se passou da hora e ainda pendente → badge vermelho "Atrasado"
```

### Detalhes técnicos

- O status "overdue" é calculado client-side comparando `date + time` com `now()`. Não precisa de cron.
- O `task_status` no banco só armazena `pending` e `completed`. O "overdue" é derivado.
- Atendente só pode alterar tarefas onde `user_id = auth.uid()`.

