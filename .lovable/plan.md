

## Unificação das Conversas "Paulo Iza" / "Paulo Rocumback"

### Situação Atual

Mesma pessoa, dois contatos e duas conversas:

| Campo | Conversa 00112 (Paulo Iza) | Conversa 00025 (Paulo Rocumback) |
|---|---|---|
| ID | `c03dcd98-855c-46cd-b6c8-05a8181c856d` | `0db2762c-5974-46b9-9e69-4e4e7c034f87` |
| Contato | `aa560aa3` — "Paulo Iza", phone: 5511932095781 | `05487fc1` — "Paulo Rocumback", phone: null |
| JID | `5511932095781@s.whatsapp.net` | `8667864780946@lid` |
| Dept | Comercial | Administrativo |
| Mensagens | 2 (Mayara enviou) | 9 (Paulo respondeu + system) |
| Atendente | Mayara | Mayara |

A Mayara mandou mensagens para Paulo pela conversa 00112 (Comercial). Paulo respondeu pelo LID `8667864780946@lid`, que o sistema não reconheceu — criou contato novo "Paulo Rocumback" e conversa nova no Administrativo.

### Plano

**1. Mover mensagens da conversa 00025 para a conversa 00112** (a 00112 é a original com o contato correto "Paulo Iza" e phone preenchido)

**2. Atualizar contato primário** (`aa560aa3` — Paulo Iza)
- Adicionar o LID `8667864780946@lid` nas notes para futuras resoluções

**3. Marcar contato duplicado** (`05487fc1` — Paulo Rocumback) como merged

**4. Deletar conversa vazia** (`0db2762c`) após mover mensagens

**5. Persistir LID no mapa** para evitar duplicação futura

### SQL a executar (via insert tool)

```sql
-- 1. Mover mensagens da conversa 00025 → 00112
UPDATE messages SET conversation_id = 'c03dcd98-855c-46cd-b6c8-05a8181c856d'
WHERE conversation_id = '0db2762c-5974-46b9-9e69-4e4e7c034f87';

-- 2. Atualizar contato primário com ambos os JIDs
UPDATE contacts SET
  notes = 'jid:5511932095781@s.whatsapp.net | jid:8667864780946@lid'
WHERE id = 'aa560aa3-09b9-4994-aae1-0ec65a83670f';

-- 3. Marcar contato duplicado como merged
UPDATE contacts SET phone = null,
  notes = 'merged_into:aa560aa3-09b9-4994-aae1-0ec65a83670f'
WHERE id = '05487fc1-35fa-4bf2-8f3a-e2d8da8b35bf';

-- 4. Deletar conversa vazia
DELETE FROM messages WHERE conversation_id = '0db2762c-5974-46b9-9e69-4e4e7c034f87';
DELETE FROM conversations WHERE id = '0db2762c-5974-46b9-9e69-4e4e7c034f87';

-- 5. Persistir LID mapping
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('8667864780946@lid', '5511932095781', 'comercial')
ON CONFLICT (lid_jid, instance_id) DO UPDATE SET phone_digits = '5511932095781', updated_at = now();
```

### Resultado
- Uma única conversa (protocolo 00112) com as 2 mensagens da Mayara + 9 respostas do Paulo em ordem cronológica
- Contato "Paulo Iza" com phone e ambos JIDs mapeados
- LID map atualizado para prevenir duplicação futura

### Nenhuma alteração de código necessária
As correções anteriores (Prova 4b + filtro auto_assign) já cobrem este cenário.

