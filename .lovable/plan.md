

## Diagnóstico

Existem dois contatos para a mesma pessoa (Erika Fischi):
- `cbe8b551` — "Erika Fischi IZA", phone `5511910887572`, notes `jid:5511910887572@s.whatsapp.net`
- `fd79ffd9` — "Erika Fischi", phone NULL, notes `jid:24632258240556@lid`

**Sequência que causou o bug:**
1. Mayara enviou mensagem para Erika via phone (`5511910887572@s.whatsapp.net`) → criou conversa `d7c4a1c4` para contato `cbe8b551`
2. Erika respondeu com LID `24632258240556@lid`
3. Webhook encontrou contato `fd79ffd9` pelo JID LID nas notes (step 5 do contact search)
4. Como `fd79ffd9` é um contact_id diferente, a unique constraint não bloqueou → **criou nova conversa** `9f37bbc7`

**Causa raiz:** O `whatsapp_lid_map` está vazio para este LID/phone. A resolução proativa (pós-envio) e o `contacts.sync` não capturaram o mapeamento `24632258240556@lid → 5511910887572`. Sem esse mapeamento, o webhook não tem como saber que os dois contatos são a mesma pessoa.

---

## Plano de Correção

### 1. Cross-contact dedup no webhook (whatsapp-webhook)
Após encontrar um contato por LID (step 5) e antes de criar uma nova conversa, adicionar lógica de deduplicação cruzada:

**Localização:** `supabase/functions/whatsapp-webhook/index.ts`, entre as linhas ~1166 e ~1177 (após o lookup de `existingConv`, antes do `if (!existingConv)`)

**Lógica:**
- Se `existingConv` é null E o contato foi encontrado por LID E NÃO tem phone:
  1. Buscar conversas ativas na mesma instância (`whatsapp_instance_id = effectiveInstanceId`) para OUTROS contacts
  2. Para cada uma dessas conversas, buscar o contato associado e verificar se tem phone
  3. Chamar `/check/{phone}` no Baileys para ver se o phone retorna o mesmo LID do sender
  4. Se confirmar match: chamar `merge_duplicate_contacts` (phone-based é primário) e reusar a conversa existente

### 2. Persistir LID no lid_map durante o match
Quando o cross-dedup confirmar o match via `onWhatsApp`, persistir no `whatsapp_lid_map` para que futuras mensagens não precisem dessa verificação.

### 3. Limpeza dos dados atuais
- Executar merge dos dois contatos Erika (`cbe8b551` primário, `fd79ffd9` duplicado)
- Mover mensagens da conversa duplicada para a original
- Finalizar a conversa duplicada

---

## Resumo técnico

```text
Mensagem LID recebida
  ↓
Contact search step 5: encontra contato LID (sem phone)
  ↓
Conversation lookup: nenhuma ativa para esse contact
  ↓
[NOVO] Cross-contact dedup:
  → Buscar conversas ativas na mesma instância (outros contacts)
  → Para cada: check(phone) → retorna LID?
  → Se LID do check == senderLID → MERGE + reusar conversa
  ↓
Se não fez match → cria conversa normalmente
```

**Arquivos a editar:**
- `supabase/functions/whatsapp-webhook/index.ts` — adicionar cross-contact dedup (~40 linhas)

**Migrations:** Nenhuma (usa RPC `merge_duplicate_contacts` já existente)

**Data fix:** Merge manual dos contatos Erika via insert tool

