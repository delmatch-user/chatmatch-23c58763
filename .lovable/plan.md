

# Implementar finalização inteligente por IA/robô

## O que já existe
- A tool `finalize_conversation` já está implementada no `robot-chat` e já salva no `conversation_logs` com `finalized_by_name: "NomeDoRobô (IA)"` e `agent_status_at_finalization: "finalized_by_robot"`.
- O fluxo completo já funciona: envia despedida, protocolo, salva log, deleta conversa.

## O que precisa mudar

O problema é que o **prompt da IA** é muito restritivo. Atualmente diz:
> "Use quando você resolver COMPLETAMENTE o problema do cliente e ele **confirmar** que está tudo certo"

Isso faz a IA esperar uma confirmação explícita, quando na verdade deveria interpretar sinais de encerramento naturais.

### Mudança 1 — Prompt mais inteligente para finalização (robot-chat)
No `buildSystemPrompt`, quando `canFinalize` está ativo, atualizar a instrução para:

```
- **finalize_conversation**: Use quando identificar que o atendimento foi 
  concluído. Sinais de encerramento incluem:
  • Cliente agradece: "obrigado", "valeu", "agradeço", "thanks"
  • Cliente confirma resolução: "já resolvi", "resolvido", "deu certo", 
    "consegui", "era isso", "tá bom"
  • Cliente se despede: "tchau", "até mais", "falou", "abraço"
  • Você resolveu o problema e o cliente não tem mais dúvidas
  NÃO finalize se o cliente ainda tem perguntas pendentes ou se a 
  conversa está no meio de uma resolução.
```

### Mudança 2 — Description da tool mais descritiva
Atualizar o `description` da function `finalize_conversation` para refletir os mesmos critérios, ajudando o modelo a decidir quando chamá-la.

### Mudança 3 — Garantir visibilidade nos Logs IA
As conversas finalizadas por robô já aparecem nos Logs IA (filtro `finalized_by IS NULL`). Confirmar que `finalized_by: null` + `finalized_by_name: "Robot (IA)"` é o padrão usado — já está correto no código atual.

## Arquivo alterado
- `supabase/functions/robot-chat/index.ts` (prompt + tool description)

## O que NÃO muda
- Nenhuma alteração no módulo autônomo da Delma
- Nenhuma alteração em tabelas ou edge functions pré-existentes além do `robot-chat`
- O `sdr-robot-chat` não é afetado (robôs comerciais não finalizam atendimento de suporte)

