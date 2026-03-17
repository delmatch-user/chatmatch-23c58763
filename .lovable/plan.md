

## Unificar conversas duplicadas "Doce Delicia" + persistir LID map

### Situação

| Conversa | Contato | Phone | JID | Msgs | Status |
|----------|---------|-------|-----|------|--------|
| `6b2873cf` (primária) | `f1f40928` | `+55 16 99753-0152` | `@s.whatsapp.net` | 70 | em_atendimento |
| `73dc6bb6` (duplicada) | `56f8b4df` | null | `70661439516698@lid` | 16 | em_atendimento |

Mesmo caso anterior: contato respondeu via LID sem mapeamento prévio. Não há entrada em `whatsapp_lid_map` para este LID.

### Plano (SQL migration)

1. Mover 16 mensagens da conversa LID (`73dc6bb6`) para a conversa primária (`6b2873cf`)
2. Deletar conversa duplicada
3. Marcar contato LID (`56f8b4df`) como merged
4. Atualizar notes do contato primário para incluir o LID
5. Inserir mapeamento em `whatsapp_lid_map` para prevenir futuras duplicações

```sql
-- Mover mensagens
UPDATE messages SET conversation_id = '6b2873cf-322e-4af6-b946-b9f28e1dbad8'
WHERE conversation_id = '73dc6bb6-dbd5-49a8-8de5-8df251d4129c';

-- Deletar conversa duplicada
DELETE FROM conversations WHERE id = '73dc6bb6-dbd5-49a8-8de5-8df251d4129c';

-- Marcar contato LID como merged
UPDATE contacts SET phone = null, notes = 'merged_into:f1f40928-aae1-4fd6-8ba4-9fca8a87f36b'
WHERE id = '56f8b4df-20ed-472d-be94-56330532bb0a';

-- Persistir mapeamento LID
INSERT INTO whatsapp_lid_map (lid_jid, phone_digits, instance_id)
VALUES ('70661439516698@lid', '5516997530152', 'comercial')
ON CONFLICT (lid_jid, instance_id) DO UPDATE SET phone_digits = '5516997530152', updated_at = now();
```

### Arquivo editado
Nenhum — apenas SQL migration + redeploy do `whatsapp-webhook` (que já contém a Prova 4) para garantir que está ativo.

