

## Correção definitiva: Prevenir duplicação de conversas por LID

### Causa raiz

Quando a Mayara envia para `5516996395420@s.whatsapp.net`, o Baileys entrega com sucesso. Mas o WhatsApp internamente usa o LID `230343458160685@lid` para esse contato. Como o envio bem-sucedido retorna `usedJid = 5516996395420@s.whatsapp.net` (o mesmo que foi enviado), nenhum mapeamento LID e persistido.

Quando o Vinicius responde, as primeiras mensagens chegam via `@s.whatsapp.net` (ok, match direto), mas eventualmente uma mensagem chega via `230343458160685@lid`. Sem mapeamento no `whatsapp_lid_map`, o webhook cria um novo contato e conversa.

A "Prova 4" (busca de conversas órfãs) não dispara porque a conversa `ab612eaa` JÁ TEM mensagens inbound (as 2 primeiras que chegaram via JID normal), então não é considerada órfã.

### Correção (2 partes)

**1. Captura proativa de LID no envio (baileys-server/index.js)**

Após cada envio bem-sucedido para `@s.whatsapp.net`, o servidor chama `onWhatsApp(phone)` para descobrir se existe um LID associado. Se existir, persiste no `lidMap` em memória E inclui na resposta para o proxy persistir no banco.

```text
Fluxo atual:
  send(5516996395420@s.whatsapp.net) → sucesso → retorna usedJid=5516996395420@s.whatsapp.net
  (LID nunca é capturado)

Fluxo corrigido:
  send(5516996395420@s.whatsapp.net) → sucesso
  → onWhatsApp(5516996395420) → retorna 230343458160685@lid
  → lidMap.set(230343458160685@lid → 5516996395420)
  → resposta inclui resolvedLid: 230343458160685@lid
```

Arquivo: `baileys-server/index.js` (rota `/instances/:instanceId/send` e `/send`)
- Após `result = await instance.sock.sendMessage(jid, ...)`, se `usedJid` termina em `@s.whatsapp.net`, chamar `instance.sock.onWhatsApp(usedJid)` com timeout de 3s
- Se o resultado inclui um JID `@lid`, salvar no `lidMap` e incluir campo `resolvedLid` na resposta

**2. Persistência do LID capturado no proxy (baileys-proxy/index.ts)**

O pós-envio do proxy já persiste mapeamentos. Basta adicionar tratamento para o novo campo `resolvedLid`.

Arquivo: `supabase/functions/baileys-proxy/index.ts` (bloco pós-envio, linha ~782)
- Se `data.resolvedLid` existe, persistir `data.resolvedLid → phone` no `whatsapp_lid_map`

**3. SQL: Unificar o caso atual do Vinicius**

```sql
UPDATE messages SET conversation_id = 'ab612eaa-7740-467c-884d-fcdad32068b5'
WHERE conversation_id = '3fe81a49-e283-4a9e-8e30-14888135ff42';

DELETE FROM conversations WHERE id = '3fe81a49-e283-4a9e-8e30-14888135ff42';

UPDATE contacts SET phone = null, notes = 'merged_into:e4346748-b7d6-4d6c-85cf-f5560f568e44'
WHERE id = '2cb6e5e8-a4e9-4618-a55b-2c12ed40d3cd';

INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('230343458160685@lid', '5516996395420', 'comercial')
ON CONFLICT (lid_jid, instance_id) DO UPDATE SET phone_digits = '5516996395420', updated_at = now();
```

### Resumo de arquivos

| Arquivo | Mudança |
|---|---|
| `baileys-server/index.js` | Proactive `onWhatsApp` após envio para capturar LID |
| `supabase/functions/baileys-proxy/index.ts` | Persistir `resolvedLid` do post-send no `whatsapp_lid_map` |
| SQL migration | Unificar caso Vinicius + persistir mapeamento |

### Por que isso resolve de vez

Hoje o LID só é descoberto quando o contato RESPONDE via LID. Com a correção, o LID é capturado no MOMENTO DO ENVIO, antes de qualquer resposta. Assim, quando a resposta chegar via LID, o `whatsapp_lid_map` já terá o mapeamento e o webhook encontrará o contato correto.

