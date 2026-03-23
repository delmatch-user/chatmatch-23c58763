

## Plano: Auto-finalização de robôs com timeout de 5 minutos

### Situação atual
- A auto-finalização de conversas por robôs já existe em `sync-robot-schedules`, mas usa o timeout global `auto_finalize_minutes` (padrão 10 min, configurável pelo admin).
- A ferramenta `finalize_conversation` já existe no `robot-chat` para finalização proativa.
- Os logs já são salvos com `finalized_by: null` e `finalized_by_name: "[AUTO-IA]"`, aparecendo corretamente na página Logs IA.

### O que precisa mudar

#### 1. `supabase/functions/sync-robot-schedules/index.ts`
- Na 4ª varredura (auto-finalização de robôs), usar **5 minutos fixos** em vez do `auto_finalize_minutes` global.
- Remover a dependência de `afEnabled` para robôs — robôs devem SEMPRE auto-finalizar após 5 min de inatividade do cliente, independentemente da configuração de auto-finalização para humanos.

#### Alteração específica (linha ~593-596):
```text
Antes: if (afEnabled) { ... afMinutesRobot = parseInt(afMinutesRow2?.value || "10", 10) }
Depois: Sempre executar com 5 minutos fixos, sem depender de afEnabled
```

### Detalhes técnicos
- O timeout de 5 min se aplica quando a última mensagem é do robô e o cliente não respondeu
- A ferramenta `finalize_conversation` no `robot-chat` continua funcionando para finalização imediata quando o robô resolve o problema
- Logs continuam salvos com `finalized_by_name: "[AUTO-IA]"` para aparecer na página Logs IA
- Não afeta o timeout de auto-finalização para humanos (continua usando a configuração global)

