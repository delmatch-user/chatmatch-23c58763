
Objetivo: parar a duplicação de conversa em respostas via LID e unificar agora o caso atual sem perder mensagens.

Diagnóstico confirmado (caso atual)
- Conversa original em atendimento (Mayara): `4c969421-a980-4548-9415-a1cb69337082`
  - Contato: `4884ac5f-7c57-4b7f-ad7c-71c5f14a7a7c` (phone `5516997551828`, jid `...@s.whatsapp.net`)
- Conversa duplicada em fila: `ae2dcbe1-2944-4787-960f-ee02d5905c17`
  - Contato: `00f8b549-5b7e-44c9-8395-f1abc4a41f6f` (phone `NULL`, jid `46145246105640@lid`)
- Não existe mapeamento em `whatsapp_lid_map` para esse LID.
- Resultado: o webhook não resolve LID→telefone a tempo e cria novo contato/conversa.

Plano de implementação

1) Unificação imediata dos dados (sem perda)
- Manter como canônica a conversa já em atendimento (`4c969...`).
- Executar merge transacional de contatos:
  - `merge_duplicate_contacts(primary_id='4884ac5f-7c57-4b7f-ad7c-71c5f14a7a7c', duplicate_id='00f8b549-5b7e-44c9-8395-f1abc4a41f6f')`
- Ajustar nome do contato canônico para o nome humano (Vanessa), preservando `name_edited` se já tiver sido editado manualmente.
- Persistir mapeamento para evitar novo split:
  - `whatsapp_lid_map`: `46145246105640@lid -> 5516997551828` na instância `comercial`.
- Verificação pós-merge:
  - Mensagens inbound da conversa duplicada movidas para `4c969...`
  - Conversa `ae2dc...` finalizada
  - Apenas 1 conversa ativa para o contato.

2) Correção estrutural no webhook (prevenção real)
Arquivo: `supabase/functions/whatsapp-webhook/index.ts`

2.1) Persistir LID map no fluxo de `message.status` (novo)
- Quando `external_id` for encontrado e `recipient` parecer pseudo-LID:
  - buscar `conversation_id` da mensagem
  - buscar `contact.phone` da conversa
  - se phone válido (10-13), fazer upsert em `whatsapp_lid_map` (`lid_jid = recipient@lid`, `phone_digits = contact.phone`, `instance_id = effectiveInstanceId`)
- Isso cria o vínculo LID→phone imediatamente após o envio, antes da resposta do lead.

2.2) Robustecer resolução no `message.received`
- Validar `effectiveResolvedPhone`: só aceitar 10-13 dígitos; caso contrário, tratar como não resolvido.
- Expandir fallback de resolução LID para testar também candidato “digits only” (além de `@lid`), para aumentar chance de retorno `@s.whatsapp.net`.
- Após criar novo contato LID (quando necessário), recarregar/hidratar `existingContact` para permitir dedup no mesmo request (hoje esse ramo pode não entrar).

2.3) Reconciliar antes de criar conversa nova
- Antes do `insert` de conversa, rodar reconciliação estrita:
  - se contato atual é LID sem phone e não há conversa ativa dele
  - procurar conversa ativa da mesma instância com contato com phone
  - usar evidência forte (lid_map recém-persistido / check consistente) para confirmar match
  - ao confirmar: `merge_duplicate_contacts` e reutilizar conversa já em atendimento.
- Priorizar sempre conversa ativa com agente (`em_atendimento`) ao escolher canônica.

3) Observabilidade (para não “voar no escuro”)
- Adicionar logs explícitos de decisão:
  - “LID map criado via status”
  - “resolvedPhone inválido descartado”
  - “reconciliação aplicada / rejeitada (motivo)”
- Isso permite auditar rapidamente próximos casos.

4) Validação end-to-end (obrigatória)
- Cenário alvo:
  1. atendente inicia conversa por telefone (busca)
  2. envia mensagem
  3. cliente responde via LID
  4. mensagem deve cair na conversa existente (sem nova conversa na fila)
- Checks:
  - nenhum novo contato ativo duplicado
  - nenhuma perda de mensagens
  - `whatsapp_lid_map` preenchido para o LID da resposta.

Detalhes técnicos (resumo)
- Sem nova tabela.
- Sem mudança de UI; correção concentrada no webhook + ajuste pontual de dados.
- Função/RPC já existente reaproveitada: `merge_duplicate_contacts`.
- Segurança: mantém isolamento por `instance_id` no `whatsapp_lid_map`, evitando contaminação entre instâncias/departamentos.
