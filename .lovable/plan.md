

## Plano: Permitir que robôs (Julia/Sebastião) finalizem conversas por inatividade

### Problema atual
A auto-finalização em `sync-robot-schedules` filtra `.is("assigned_to_robot", null)` — ou seja, **ignora** conversas atendidas por robôs. Julia e Sebastião nunca conseguem finalizar conversas mesmo quando o cliente para de responder.

### Solução

Duas frentes: (A) auto-finalização por inatividade no `sync-robot-schedules` e (B) ferramenta de finalização no `robot-chat` para quando o robô identifica que resolveu.

---

#### 1. `supabase/functions/sync-robot-schedules/index.ts` — Nova varredura para robôs

Após a terceira varredura existente (auto-finalização humana), adicionar uma **quarta varredura** dedicada a conversas com robô:

- Buscar conversas `em_atendimento` onde `assigned_to_robot IS NOT NULL` (no departamento configurado)
- Mesma lógica de inatividade: última mensagem (não-sistema) enviada pelo robô (`sender_id IS NOT NULL`) + `created_at` anterior ao cutoff (6 min fixo ou usar o mesmo `afMinutes`)
- Enviar protocolo, salvar `conversation_logs` com `finalized_by_name: "[AUTO-IA]"`, deletar mensagens e conversa
- Buscar nome do robô em `robots` para `assigned_to_name`

#### 2. `supabase/functions/robot-chat/index.ts` — Nova tool `finalize_conversation`

Adicionar uma ferramenta que o robô pode chamar quando identifica que o problema foi resolvido:

- Tool `finalize_conversation` com parâmetros: `farewell_message` (mensagem de despedida ao cliente) e `resolution_summary` (resumo do que foi resolvido)
- Na execução: enviar `farewell_message` ao cliente via canal, inserir mensagem de protocolo, salvar `conversation_logs`, deletar mensagens e conversa
- Adicionar ao prompt do sistema uma instrução: "Quando você resolver completamente o problema do cliente e ele confirmar que está tudo certo, use `finalize_conversation` para encerrar o atendimento"

#### 3. Configuração na tabela `robots`

Usar o campo `tools` (jsonb) existente para adicionar uma flag `canFinalize: true`. No `buildOpenAITools`, só incluir a tool `finalize_conversation` se `config.tools.canFinalize` estiver ativo.

### Detalhes técnicos

- A varredura de robôs no sync reutiliza a mesma lógica de protocolo/log/deleção já existente
- O tempo de inatividade para robôs será o mesmo configurado em `app_settings` (`auto_finalize_minutes`)
- A tool `finalize_conversation` segue o mesmo padrão das outras tools (transfer, labels, etc.)
- Atualizar `defaultTools` em `useRobots.tsx` para incluir `canFinalize: false` por padrão

