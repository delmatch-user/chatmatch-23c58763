

## Unificar conversas duplicadas + garantir deploy da Prova 4

### Situação atual

| Conversa | Contato | Phone | JID | Status | Mensagens |
|----------|---------|-------|-----|--------|-----------|
| `5ed95d5f` (Mayara) | `d3125f8f` | `5516997307870` | `@s.whatsapp.net` | em_atendimento | 2 outbound |
| `a70c4b78` (fila) | `dca93fe5` | null | `206622320263200@lid` | em_fila | 3 inbound |

A Prova 4 existe no código mas **não foi deployada** — sem logs no edge function. As mensagens de resposta do Alessandro caíram em conversa separada.

### Plano (2 partes)

**1. Merge imediato via SQL** (migration)

```sql
-- Mover mensagens da conversa LID para a conversa original
UPDATE messages SET conversation_id = '5ed95d5f-940e-469a-9c04-396ebff65ce0'
WHERE conversation_id = 'a70c4b78-0fc1-4b4f-980a-a43f14503838';

-- Deletar conversa duplicada
DELETE FROM conversations WHERE id = 'a70c4b78-0fc1-4b4f-980a-a43f14503838';

-- Marcar contato LID como merged
UPDATE contacts SET phone = null, notes = 'merged_into:d3125f8f-5e8d-4264-928b-28870758af5d'
WHERE id = 'dca93fe5-eb7e-4359-b465-b5bf33660d84';

-- Atualizar contato primário com JID do LID e nome correto
UPDATE contacts SET 
  notes = 'jid:206622320263200@lid',
  name = 'Alessandro'
WHERE id = 'd3125f8f-5e8d-4264-928b-28870758af5d' AND name_edited = false;

-- Persistir mapeamento LID para prevenir futuras duplicações
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('206622320263200@lid', '5516997307870', 'comercial')
ON CONFLICT (lid_jid, instance_id) DO UPDATE SET phone_digits = '5516997307870', updated_at = now();
```

**2. Deploy da edge function** — A Prova 4 já está no código mas precisa ser deployada para funcionar em mensagens futuras.

### Resultado esperado
- Conversa de Mayara (`5ed95d5f`) terá todas as 5 mensagens (2 outbound + 3 inbound)
- Conversa duplicada da fila desaparece
- LID mapeado → futuras mensagens do Alessandro vão direto para a conversa certa

