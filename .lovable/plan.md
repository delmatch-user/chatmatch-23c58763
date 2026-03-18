
Diagnóstico rápido (com base no código + logs + banco):
- O webhook `ig-test` ainda falha ao buscar perfil do Instagram: log atual mostra `"[IG] Perfil falhou (db): 403, expired=false"`.
- Isso explica o comportamento da tela: os contatos ficam com fallback `Instagram 172275`, sem `notes` (`ig_username`) e sem `avatar_url`.
- Além disso, a UI ainda exibe `ig:...` em vários pontos porque usa `extractRealPhone` para renderização (isso é correto para envio, mas ruim para exibição).

Plano de correção (implementação):
1) Corrigir resolução de token no `ig-test` (backend)
- Arquivo: `supabase/functions/ig-test/index.ts`
- Ajustar `fetchIGProfile` para:
  - parsear erro Graph (`code` + `message`) ao invés de tratar só “expired”.
  - tentar próximo token candidato também em 403/erros de permissão/autorização (não só 190).
  - adicionar fallback de derivação de Page Access Token (mesma estratégia do `instagram-send`: `/{pageId}?fields=access_token` e `/me/accounts`), com persistência do token derivado no `whatsapp_connections`.
  - melhorar log técnico do erro (`status`, `code`, trecho da mensagem) sem expor token.
- Resultado esperado: a busca de perfil deixa de cair no primeiro 403 e passa a obter `name/username/profile_pic` com token válido.

2) Garantir atualização de contato mesmo quando só vier `username`
- Arquivo: `supabase/functions/ig-test/index.ts`
- Ajustar regra de update do contato existente:
  - se nome atual é placeholder (`Instagram ...` ou `@...`) e vier `profile.name`, usar `profile.name`.
  - se não vier `profile.name`, mas vier `profile.username`, usar `@username`.
  - continuar persistindo `notes` com `ig_username:...` e `avatar_url` quando disponível.
- Resultado esperado: mesmo sem “nome real”, o contato passa a mostrar @ correto.

3) Corrigir exibição no frontend (não mostrar mais `ig:123...` como “telefone”)
- Arquivo base: `src/lib/phoneUtils.ts`
  - ampliar `getContactDisplayName` para tratar `Instagram <números>` como nome placeholder.
  - quando for Instagram e existir `ig_username` em notes, priorizar `@username` para exibição.
  - criar helper de label secundária do Instagram (ex.: `getInstagramDisplayHandle`) para usar nas linhas de subtítulo.
- Ajustar componentes que hoje imprimem `extractRealPhone` em Instagram:
  - `src/components/queue/QueueCard.tsx`
  - `src/components/chat/ConversationList.tsx`
  - `src/components/chat/ChatPanel.tsx`
  - `src/components/queue/ConversationPreviewDialog.tsx`
  - `src/components/chat/ContactDetails.tsx`
- Resultado esperado: fila e chat passam a mostrar Nome/@ corretamente em vez de `ig:...`.

4) Sincronização dos contatos já existentes
- Após deploy da correção, fazer reprocessamento para contatos Instagram já criados:
  - estratégia mínima: atualizar na próxima mensagem recebida (já acontece automaticamente).
  - estratégia imediata (recomendada): executar rotina de refresh de perfis para contatos Instagram existentes, para não depender de nova mensagem.
- Resultado esperado: limpar backlog de contatos antigos com nome fallback.

Validação (fim-a-fim):
- Enviar uma nova DM no Instagram para um contato de teste.
- Confirmar no log do `ig-test` que não há mais `Perfil falhou ... 403` para esse fluxo.
- Confirmar no banco (`contacts`) que o contato recebeu `notes` com `ig_username:...` e (quando disponível) `avatar_url`.
- Validar na rota `/fila` e no chat que:
  - título mostra nome real ou `@username`,
  - subtítulo mostra `@username` (não `ig:...`),
  - card antigo com “Instagram 172275” é corrigido após refresh/reprocessamento.
