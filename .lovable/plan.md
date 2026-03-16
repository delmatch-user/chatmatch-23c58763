

## Plano: Varredura completa e correção de contatos duplicados

### Diagnóstico

Auditoria no banco revelou os seguintes problemas:

**Duplicatas ativas (com conversas abertas simultâneas):**
1. **Vitor Thomazini** — 2 contatos (428f91c1 com JID phone, 60fed90e com LID), cada um com 1 conversa ativa no Comercial

**Duplicatas latentes (mesmo telefone, sem conversas ativas em ambos):**
- Matheus Del Match Delivery (5514997663502)
- Delmatch Delivery (5516997010060)
- Delma (5516997151725)
- Pancho San Delivery (5516997687653)
- Wagner (5516997704579)
- Diogo Almeida (5516997774509)
- Deikisson (5518997352935)
- André Del Match Delivery (5519995786080)

**Caso Mayara/Fábio:**
- Conv da Mayara (92831f09): mensagens da Mayara + resposta "Bom dia, tudo bom?" — parece correto
- Conv do Fábio (091eb816): "Podemos" + "Boa tarde Fabio" — parece correto
- Contato do Fábio (8a2dda93) tem apenas LID sem phone — precisa verificar se há algo invertido

---

### Ações de dados (via insert tool — UPDATE/DELETE)

**Passo 1 — Merge Vitor Thomazini (caso ativo):**
- Usar `merge_duplicate_contacts(primary_id: '428f91c1', duplicate_id: '60fed90e')` para unificar mensagens e conversas no contato primário (o mais antigo com JID phone)

**Passo 2 — Merge das 8 duplicatas latentes:**
- Para cada par, usar `merge_duplicate_contacts(primary_id, duplicate_id)` onde o primário é o mais antigo (criado primeiro)
- O RPC já move mensagens, reatribui conversas, e marca o duplicado como `merged_into:`

**Passo 3 — Caso Mayara/Fábio:**
- Verificar com o usuário se o estado atual está correto (mensagens parecem estar nos lugares certos pela análise cronológica e de conteúdo)

---

### Prevenção (alterações no código)

**Passo 4 — Webhook (`whatsapp-webhook/index.ts`):**
- Na seção de auto-merge (linha ~935), adicionar busca por variantes brasileiras usando `normalize_phone_variants` para cobrir casos onde o mesmo número está salvo com/sem DDI 55 ou com/sem 9o dígito
- Adicionar check cruzado: quando um contato LID-only recebe phone via `contacts.sync` ou `effectiveResolvedPhone`, verificar imediatamente se já existe um contato com esse phone e fazer merge

**Passo 5 — Webhook (busca de contato existente):**
- Na busca por LID (etapa 3, linha ~414), quando `effectiveResolvedPhone` encontra um contato, verificar se já existe OUTRA conversa ativa para um contato LID diferente com o mesmo `senderJid` — se sim, fazer merge automático via RPC em vez de criar duplicata

**Passo 6 — `contacts.sync` handler (linha ~169):**
- Quando atualizamos um contato LID-only com phone real, verificar se já existe outro contato com esse phone e fazer `merge_duplicate_contacts` automaticamente

---

### Resumo técnico

| Ação | Tipo | Escopo |
|------|------|--------|
| Merge 1 duplicata ativa (Vitor) | Data fix | `merge_duplicate_contacts` RPC |
| Merge 8 duplicatas latentes | Data fix | `merge_duplicate_contacts` RPC |
| Validar caso Mayara/Fábio | Verificação | Confirmar com usuário |
| Auto-merge no `contacts.sync` | Code change | `whatsapp-webhook/index.ts` |
| Auto-merge na busca de contato | Code change | `whatsapp-webhook/index.ts` |
| Cross-check LID→phone no merge | Code change | `whatsapp-webhook/index.ts` |

Total: 9 merges de dados + 3 melhorias de código para prevenção.

