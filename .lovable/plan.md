

## Correção: Duplicação de Conversas por Leading Zero + Sobrescrita de Notes

### Causa Raiz (2 bugs)

**Bug 1 — Notes sobrescritas em vez de acumuladas**

Quando o webhook atualiza o JID de um contato, ele faz:
```ts
contactUpdates.notes = `jid:${senderJid}`;
```
Isso **substitui** completamente as notes existentes. Se o contato tinha `jid:781767975119@lid | jid:5516991663580@s.whatsapp.net`, após a atualização fica apenas `jid:781767975119@lid`. A referência ao JID real (`@s.whatsapp.net`) é perdida.

Quando Yasmin envia novamente para o número, a busca por JID nas notes não encontra mais o contato, e `find_contact_by_phone` também falha por causa do Bug 2 → cria contato novo → conversa duplicada.

Esse mesmo padrão existe em `ConversationList.tsx` e `useWhatsAppSend.tsx`.

**Bug 2 — Leading zero no phone não normalizado**

O contato "Dona Formiguinha" tem `phone: 016991663580` (com zero à esquerda — formato DDD 016). A função `normalize_phone_variants('5516991663580')` gera variantes `[5516991663580, 16991663580, 1691663580]` — nenhuma delas inclui `016991663580`. O zero à esquerda impede o match.

A função SQL não trata leading zeros: `normalize_phone_variants('016991663580')` retorna apenas `[016991663580]` — sem gerar variantes com DDI 55.

### Plano de Correção

**1. Corrigir `normalize_phone_variants` (migration SQL)**
- Adicionar strip de leading zeros no início da função
- Gerar variantes com e sem o zero para backwards compatibility

**2. Corrigir notes no webhook (`whatsapp-webhook/index.ts`)**
- Nos ~5 pontos onde se faz `notes: \`jid:${senderJid}\``, mudar para lógica de APPEND:
  - Se notes já contém o JID → não alterar
  - Se notes existe mas não contém o JID → concatenar `" | jid:${newJid}"`
  - Se notes é null → definir `jid:${newJid}`

**3. Corrigir notes no frontend (`ConversationList.tsx` e `useWhatsAppSend.tsx`)**
- Mesma lógica de append ao invés de substituir

### Arquivos modificados

- **Migration SQL** — `normalize_phone_variants`: strip leading zeros
- `supabase/functions/whatsapp-webhook/index.ts` — append JID em vez de sobrescrever (~5 locais)
- `src/components/chat/ConversationList.tsx` — append JID em notes
- `src/hooks/useWhatsAppSend.tsx` — append JID em notes

