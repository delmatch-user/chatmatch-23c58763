
Objetivo: restaurar imediatamente Conversas, Leads e Pipeline sem perder as outras funcionalidades recentes.

1) Reversão cirúrgica (sem voltar histórico inteiro)
- Criar uma nova migration apenas para desfazer a mudança de RLS aplicada em `public.contacts` na migration `20260330125220_...`.
- Motivo: reverter pelo histórico apagaria também entregas novas (alertas de agenda, ajustes SDR etc). A reversão por migration preserva tudo e corrige só o problema.

2) SQL de rollback da policy problemática
- Remover policies restritivas atuais de `contacts`:
  - `Contacts viewable by department members`
  - `Contacts updatable by authorized users`
- Restaurar policies originais:
  - `Contacts viewable by authenticated users` com `USING (true)`
  - `Contacts updatable by authenticated users` com `USING (true) WITH CHECK (true)`
- Manter INSERT como está (já está funcional).

3) Validação funcional imediata (E2E)
- Validar com usuário não-admin e com supervisor:
  - `/conversas`: lista volta a carregar.
  - `/fila`: conversas em fila visíveis.
  - `/sdr/pipeline`: colunas + cards de leads aparecem.
  - fluxo de abrir conversa e carregar contato/mensagens continua funcionando.
- Conferir que não surgem erros de RLS no carregamento inicial.

4) Pós-restauração (segurança sem quebrar operação)
- Em seguida, preparar hardening seguro em etapa separada:
  - evitar política de `contacts` dependente de `conversations` diretamente.
  - aplicar controle de acesso via função `SECURITY DEFINER` (sem ciclo de dependência) e validar antes de publicar.
- Isso evita repetir o sumiço de dados em produção.

Detalhes técnicos
- Causa provável: a policy nova de `contacts` passou a depender de `conversations/profile_departments`, impactando consultas encadeadas usadas por Conversas (`AppContext`) e SDR (`sdrApi` com embed de `contacts`), resultando em listas vazias para perfis operacionais.
- Escopo da correção: somente RLS da tabela `contacts`; sem alteração de frontend.
