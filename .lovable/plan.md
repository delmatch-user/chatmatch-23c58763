

## Unificação das Conversas "Dona Formiguinha"

### Situação Atual

Duas conversas ativas para a mesma pessoa:

| Campo | Conversa Original (f3cea653) | Conversa Duplicada (3a132e21) |
|---|---|---|
| Contato | `3b084005` — "016991663580", phone: 016991663580 | `429ef4f1` — "Dona Formiguinha", phone: null |
| Mensagens | 2 (enviadas pela Yasmin) | 8 (respostas da cliente + Yasmin) |
| Protocolo | 20260319-00024 | 20260319-00028 |
| Instance | comercial | suporte |

### Plano

**1. Mover mensagens da conversa original para a duplicada** (a duplicada tem mais contexto e o nome correto)

A conversa `3a132e21` (protocolo 00028) é a que tem as respostas da cliente e o nome "Dona Formiguinha". Vamos mover as 2 mensagens de `f3cea653` para `3a132e21` e depois deletar `f3cea653`.

**2. Atualizar contato primário** (`429ef4f1` — Dona Formiguinha)
- Preencher `phone = '016991663580'`
- Atualizar `notes` para incluir ambos os JIDs

**3. Atualizar conversa mantida** (`3a132e21`)
- Mudar `whatsapp_instance_id` para o correto da instância usada (ou manter `suporte`)

**4. Marcar contato duplicado** (`3b084005`) como merged

**5. Deletar conversa vazia** (`f3cea653`) após mover mensagens

### Ações (todas via SQL insert tool — dados, não schema)

```sql
-- 1. Mover mensagens da conversa f3cea653 → 3a132e21
UPDATE messages SET conversation_id = '3a132e21-42cb-42e2-9a91-5940c96778a8' 
WHERE conversation_id = 'f3cea653-457e-49f7-8c61-f04507b291d7';

-- 2. Atualizar contato primário com phone e JIDs
UPDATE contacts SET phone = '016991663580', 
  notes = 'jid:781767975119@lid | jid:5516991663580@s.whatsapp.net',
  name = 'Dona Formiguinha', name_edited = true
WHERE id = '429ef4f1-a906-4167-95c5-3650af9f2b1b';

-- 3. Marcar contato duplicado como merged
UPDATE contacts SET phone = null, 
  notes = 'merged_into:429ef4f1-a906-4167-95c5-3650af9f2b1b'
WHERE id = '3b084005-9472-46cf-84c5-ce890c2b9a8a';

-- 4. Deletar mensagens da conversa original (já movidas)
-- 5. Deletar conversa original
DELETE FROM messages WHERE conversation_id = 'f3cea653-457e-49f7-8c61-f04507b291d7';
DELETE FROM conversations WHERE id = 'f3cea653-457e-49f7-8c61-f04507b291d7';

-- 6. Persistir LID mapping para ambos os JIDs
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('781767975119@lid', '5516991663580', 'suporte')
ON CONFLICT (lid_jid, instance_id) DO UPDATE SET phone_digits = '5516991663580', updated_at = now();
```

### Resultado
- Uma única conversa (`3a132e21`) com todas as 10 mensagens em ordem cronológica
- Contato "Dona Formiguinha" com phone e ambos JIDs
- LID map atualizado para prevenir duplicação futura

### Nenhuma alteração de código necessária
A correção anterior da "Prova 4b" no webhook já cobre este cenário para o futuro.

