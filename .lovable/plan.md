
Objetivo: impedir que conversas abertas apareçam com histórico incompleto e explicar a causa.

Diagnóstico (causa provável já identificada no código):
1) O AppContext carrega conversas inicialmente só com preview (`last_message_preview`) e não com histórico completo.
2) No ChatPanel, o carregamento completo só dispara quando `conversation.messages.length <= 1`.
3) Se entrar mensagem em tempo real antes de abrir a conversa, ela fica com 2+ itens (preview + nova), então o carregamento completo é pulado.
4) Depois disso, o polling incremental busca apenas mensagens novas (`created_at > último timestamp`) e não recupera as antigas. Resultado: conversa parece “perdida/incompleta” sem ter sido finalizada.

Plano de correção:
1) Trocar a regra de “histórico carregado”
- Arquivos: `src/contexts/AppContext.tsx`, `src/types/index.ts`.
- Adicionar um estado explícito por conversa (ex.: `historyLoaded: boolean`) em vez de inferir por quantidade de mensagens.
- Conversas vindas de `fetchConversations` (preview) iniciam com `historyLoaded = false`.

2) Ajustar gatilho de carregamento no ChatPanel
- Arquivo: `src/components/chat/ChatPanel.tsx`.
- Substituir condição atual (`messages.length <= 1`) por: “se conversa selecionada não está hidratada, carregar histórico completo”.
- Garantir que ao trocar de conversa o carregamento completo aconteça sempre na primeira abertura daquela conversa.

3) Marcar hidratação somente após carga completa do banco
- Arquivo: `src/contexts/AppContext.tsx` (`loadConversationMessages`).
- Após buscar todas as mensagens + reações com sucesso, atualizar `messages` e marcar `historyLoaded = true`.
- Se falhar, manter `historyLoaded = false` (para permitir nova tentativa), sem sobrescrever o que já existe na tela.

4) Preservar integridade durante realtime/polling
- Arquivo: `src/contexts/AppContext.tsx`.
- Realtime de INSERT/UPDATE não deve “promover” conversa para carregada.
- Polling incremental só complementa mensagens quando `historyLoaded = true`; se não estiver carregada, ele não substitui o fluxo de hidratação completa.
- Assim evita estado “parcial permanente”.

5) Ação de recuperação manual (segurança operacional)
- Arquivo: `src/components/chat/ChatPanel.tsx`.
- Adicionar opção “Recarregar histórico completo” no menu da conversa para forçar `loadConversationMessages(conversation.id)`.
- Útil para atendimento em produção sem depender de refresh geral da página.

6) Validação final (cenários críticos)
- Cenário A: conversa antiga com preview recebe nova mensagem antes de abrir → ao abrir, deve carregar todo histórico.
- Cenário B: conversa com muitas mensagens (paginação >1000) → histórico completo deve aparecer.
- Cenário C: queda temporária de rede durante load → não marcar como carregada; botão de recarga deve recuperar.
- Cenário D: fila (`/fila`) e conversas (`/conversas`) com comportamento consistente.

Impacto esperado:
- Não haverá mais conversa “aberta com histórico incompleto” por falha de hidratação.
- As mensagens antigas deixam de depender da condição frágil de quantidade em memória.
- Sem migração de banco e sem alteração de políticas; correção é de estado/fluxo no frontend.
