

## Corrigir duplicação de conversa quando resposta vem de LID desconhecido

### Problema

Quando um atendente inicia conversa buscando um número (ex: `5516997307870`), o sistema cria contato com `jid:5516997307870@s.whatsapp.net`. Quando o destinatário responde, o WhatsApp entrega a mensagem de um LID (`206622320263200@lid`) que o sistema nunca viu antes. Sem nenhuma forma de vincular esse LID ao telefone original, o webhook cria um **novo contato + nova conversa**, resultando em duplicação.

A detecção de conversa órfã (Prova 1/2/3) falha porque:
- **Prova 1** (JID match): `5516997307870@s.whatsapp.net` ≠ `206622320263200@lid`
- **Prova 2** (phone match): `effectiveResolvedPhone` é `null` (LID sem resolução)
- **Prova 3** (LID map): tabela `whatsapp_lid_map` vazia para este LID

### Solução: Prova 4 — Resolução ativa via `onWhatsApp`

Adicionar uma **Prova 4** na detecção de conversa órfã: quando temos um LID sem resolução e encontramos uma conversa órfã cujo contato tem telefone válido, chamar o endpoint `check` do Baileys server para verificar se aquele telefone resolve para o LID do sender.

A lógica:
1. Pegar o `phone` do contato órfão (ex: `5516997307870`)
2. Chamar `/instances/{instanceId}/check/{phone}` no Baileys server
3. Se o resultado retorna um JID que é um LID, comparar com o `senderJid` (normalização canônica)
4. Se match → vincular a conversa, persistir LID map

Isso é seguro porque usa verificação direta do WhatsApp (não inferência por nome).

### Arquivo editado

**`supabase/functions/whatsapp-webhook/index.ts`** — Após Prova 3 (linha ~879), antes do `if (jidMatchesLid || phoneMatchesIncoming || orphanPhoneMatchesViaLidMap)`:

```typescript
// Prova 4: Para LIDs sem resolução, verificar via onWhatsApp se o phone do órfão 
// resolve para o mesmo LID do sender
let orphanPhoneMatchesViaCheck = false;
if (!jidMatchesLid && !phoneMatchesIncoming && !orphanPhoneMatchesViaLidMap 
    && isLid && senderJid?.endsWith('@lid') && orphanContact.phone) {
  const orphanDigits = orphanContact.phone.replace(/\D/g, '');
  if (orphanDigits.length >= 10 && orphanDigits.length <= 13) {
    try {
      const checkUrl = `${BAILEYS_SERVER_URL}/instances/${effectiveInstanceId}/check/${encodeURIComponent(orphanDigits)}`;
      const checkResp = await fetch(checkUrl, { method: 'GET' });
      if (checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData?.exists && checkData?.jid) {
          const checkedJid = String(checkData.jid).toLowerCase();
          const senderBase = senderJid.split(':')[0];
          const checkedBase = checkedJid.split(':')[0];
          if (checkedJid.endsWith('@lid') && senderBase === checkedBase) {
            orphanPhoneMatchesViaCheck = true;
            // Persistir no LID map imediatamente
            supabase.from('whatsapp_lid_map').upsert({
              lid_jid: senderJid,
              phone_digits: orphanDigits,
              instance_id: effectiveInstanceId,
              updated_at: new Date().toISOString()
            }, { onConflict: 'lid_jid,instance_id' });
          }
        }
      }
    } catch (e) { /* silencioso */ }
  }
}
```

E ajustar o `if` final para incluir `orphanPhoneMatchesViaCheck`.

### Ganho secundário

Uma vez que a Prova 4 persiste o LID map, todas as mensagens futuras do mesmo LID serão resolvidas automaticamente via Prova 3 ou pela busca normal de contato.

