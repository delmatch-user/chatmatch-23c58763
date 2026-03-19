

## Correção: Duplicação de Conversas e Sincronização dos Robôs

### Problemas identificados

1. **Delma ainda está `paused`** — Os dados da API confirmam: `"status":"paused","manually_activated":false`. A migration anterior não funcionou ou o cron reverteu. Sem Delma ativa, nenhum robô de triagem está funcionando.

2. **Webhooks não filtram `auto_assign`** — Quando uma mensagem chega via WhatsApp, Instagram ou Machine, os webhooks buscam robôs ativos SEM verificar `auto_assign`. Resultado: Júlia ou Sebastião podem ser atribuídos diretamente a conversas novas, ignorando a triagem.
   - `whatsapp-webhook/index.ts` — linhas 1292-1295 e 1450-1452
   - `webhook-machine/index.ts` — linhas 61-63 e 241-243
   - `meta-whatsapp-webhook/index.ts` — linhas 291-294

3. **Conversas duplicadas** — Quando o atendente inicia uma conversa (via busca por número) e a pessoa responde, o webhook cria uma nova conversa em vez de usar a existente. Isso acontece porque o contato criado manualmente pode não ter o JID/LID correto nas notas, e a busca órfã falha.

### Plano de correção

**1. Reativar Delma via migration SQL**
- `UPDATE robots SET status = 'active', manually_activated = true WHERE name ILIKE '%Delma%';`
- `UPDATE robots SET status = 'active', manually_activated = true WHERE name ILIKE '%Júlia%' OR name ILIKE '%Sebastião%';`
- Verificar que `auto_assign` está corretamente definido (Delma: true, outros: false)

**2. Adicionar filtro `auto_assign` nos 3 webhooks**

Em cada webhook, ao buscar robôs para atribuição a novas conversas, adicionar `.eq('auto_assign', true)` na query:

- `whatsapp-webhook/index.ts` — 2 queries (nova conversa linha ~1295 e conversa em_fila linha ~1452)
- `webhook-machine/index.ts` — 2 queries (linhas ~63 e ~243)
- `meta-whatsapp-webhook/index.ts` — 1 query (linha ~293)

**3. Melhorar busca de conversa órfã para evitar duplicação**

Na seção de busca órfã do `whatsapp-webhook` (linhas 872-1041), o filtro `inboundMsgs` usa `is('sender_id', null)` para detectar mensagens inbound. Porém, mensagens enviadas pelo atendente TÊM `sender_id` preenchido. O problema é que a Prova 2 (phoneMatchesIncoming) falha quando o reply vem de LID e o contato órfão foi criado com phone mas sem JID LID nas notas.

Corrigir: na busca de conversa órfã, se o contato órfão tem phone e o sender é LID, usar o `effectiveResolvedPhone` (já resolvido acima via mapa) para match direto com o phone do contato. Atualmente a Prova 2 só verifica `effectiveResolvedPhone` contra `orphanContact.phone` — mas se `effectiveResolvedPhone` foi resolvido, a comparação deveria funcionar. O problema real é que para **não-LID** senders (phone real), a seção órfã nunca é alcançada porque `contactId` já foi definido. Para LIDs, o contato criado manualmente (sem JID LID) não é encontrado pela busca principal (linhas 481-551), e sem `effectiveResolvedPhone`, a busca órfã também falha.

**Solução adicional**: quando o atendente cria uma conversa manualmente, o contato já tem o `phone` preenchido. Quando a resposta vem como LID, precisamos garantir que a busca na seção principal (passo 3, linha 508) encontre o contato pelo `effectiveResolvedPhone`. Se o `effectiveResolvedPhone` não foi resolvido (LID sem mapa), a busca órfã (Prova 4 — check via Baileys) já cobre esse caso. O problema pode estar em: a busca órfã filtra conversas das últimas 48h, mas se a conversa é mais antiga, não é encontrada.

**Correção pragmática**: expandir a janela de busca órfã de 48h para 7 dias, e garantir que a Prova 2 use normalização BR completa.

### Arquivos modificados

- **Migration SQL** — reativar Delma/Júlia/Sebastião
- `supabase/functions/whatsapp-webhook/index.ts` — filtro `auto_assign` (2 locais) + janela órfã 7d
- `supabase/functions/webhook-machine/index.ts` — filtro `auto_assign` (2 locais)
- `supabase/functions/meta-whatsapp-webhook/index.ts` — filtro `auto_assign` (1 local)

