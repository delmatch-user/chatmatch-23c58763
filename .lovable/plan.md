

## Plano: Corrigir conversa do Fábio (5516997502209)

### Diagnóstico

A conversa do Fábio (5516997502209) foi fragmentada:

- **Conv 64b3b5d9** (protocolo 00022) — Contato `3e7a8dbe` (phone: 5516997502209) — contém a mensagem enviada pelo Fábio ("eu sou Fábio da area comercial...")
- **Conv 091eb816** (protocolo 00131) — Contato `8a2dda93` ("Contato WhatsApp", LID-only: 277291745701923@lid) — contém as respostas "Podemos" e "Boa tarde Fabio" que pertencem à conversa do Fábio

**Causa**: A resposta veio de um LID (277291745701923@lid) que o sistema não conseguiu vincular ao contato 5516997502209, criando um contato órfão.

A conversa da Mayara (92831f09, contato 5516996194049) está correta — suas mensagens ("Lincoln consegue vir amanhã...", "falo com o Lincoln?", "abriu uma nova vaga") estão no lugar certo.

### Ações

**Passo 1 — Mover mensagens para a conversa do Fábio:**
- Mover "Podemos" e "Boa tarde Fabio" (+ mensagem SYSTEM) de conv 091eb816 para conv 64b3b5d9

**Passo 2 — Merge dos contatos:**
- `merge_duplicate_contacts(primary: 3e7a8dbe, duplicate: 8a2dda93)` para unificar o contato LID-only no contato do Fábio

**Passo 3 — Mapear LID → phone:**
- Inserir na `whatsapp_lid_map`: LID `277291745701923@lid` → phone `5516997502209`
- Atualizar notes do contato primário para incluir o LID

**Passo 4 — Deletar conversa órfã vazia:**
- Após mover as mensagens, a conv 091eb816 ficará vazia e será finalizada pelo merge RPC

