

# Diagnóstico: Resposta do agente sai pelo número errado (Baileys em vez de Meta API)

## Causa raiz

No webhook da Meta (`meta-whatsapp-webhook`), quando uma conversa é criada (linha 366-378), o campo `whatsapp_instance_id` **não é preenchido**. Já o webhook do Baileys preenche esse campo corretamente.

Fluxo atual quebrado:
1. Cliente envia mensagem para o número oficial (Meta API)
2. Webhook cria conversa **sem** `whatsapp_instance_id`
3. Agente responde: `getConnectionByInstanceId(null)` retorna null
4. Fallback `getConnectionForDepartment()` **prioriza Baileys** por design
5. Resposta sai pelo número QR Code em vez do oficial

## Solução

**Arquivo**: `supabase/functions/meta-whatsapp-webhook/index.ts`

Duas mudanças:

1. **Ao criar conversa nova** (insert): adicionar `whatsapp_instance_id: phoneNumberId` no objeto de insert
2. **Ao encontrar conversa existente** sem `whatsapp_instance_id`: fazer update para preencher com o `phoneNumberId` atual (auto-correção para conversas que já existem sem o campo)

Isso garante que quando o agente responder, o sistema encontre a conexão Meta API pelo `whatsapp_instance_id` e envie pelo número correto.

