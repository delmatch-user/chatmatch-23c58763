

## Unificação das Conversas Duplicadas + Correção Anti-Duplicação

### Problema Raiz

A pessoa "Dona Formiguinha" (telefone 016991663580) tem **dois LIDs diferentes** na mesma instância:
- `551699166358035@lid` (no mapa LID, usado anteriormente)
- `781767975119@lid` (usado na resposta recente)

Quando Yasmin enviou mensagens, a conversa foi criada com JID `5516991663580@s.whatsapp.net`. Quando a cliente respondeu, a resposta veio do LID `781767975119@lid`. O sistema não conseguiu vincular os dois porque:
1. O LID map só tinha `551699166358035@lid` — LID diferente
2. A Prova 4 (check) resolve o telefone do órfão para um LID, mas compara `base` (`781767975119` vs `551699166358035`) — falha porque são bases diferentes

### Plano

**1. Merge imediato dos dados via SQL**
- Mover mensagens da conversa duplicada (`3a132e21`) para a conversa original (`f3cea653`)
- Atualizar contato original com nome "Dona Formiguinha" e JID `781767975119@lid`
- Deletar conversa e contato duplicados
- Persistir novo LID no `whatsapp_lid_map`

**2. Corrigir Prova 4 no webhook (prevenir recorrência)**

O bug: Prova 4 faz `/check/{orphanPhone}` e compara o LID retornado com o LID do sender usando `split(':')[0].split('@')[0]`. Mas quando o mesmo telefone tem dois LIDs completamente diferentes (não apenas variantes com `:NN`), a comparação de base falha.

**Correção**: se a Prova 4 falhar na comparação de LID, fazer uma segunda verificação — chamar `/check/{senderLidDigits}` para ver se retorna um JID `@s.whatsapp.net` cujo telefone bate com o do órfão. Isso resolve o caso em que o sender tem um LID novo que o Baileys ainda consegue resolver para o mesmo telefone.

**3. Adicionar mapeamento reverso no LID map**

Quando o webhook descobre (via Prova 4 ou check) que um LID resolve para um telefone, persistir **também** o novo LID no mapa, garantindo que futuras mensagens do mesmo LID sejam resolvidas diretamente sem precisar da busca órfã.

### Arquivos modificados

- **Migration SQL** — merge das conversas + contatos + LID map
- `supabase/functions/whatsapp-webhook/index.ts` — melhorar Prova 4 para cobrir LIDs múltiplos do mesmo telefone

