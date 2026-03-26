
# Plano — Diagnóstico e Correção para mensagens da API Oficial que não entram na fila

## Diagnóstico já confirmado com o exemplo enviado (11930837322 em 26/03 às 15:06)
- Para esse número, no dia 26/03, existe registro no histórico apenas às **17:34 UTC** (14:34 BRT) com `whatsapp_instance_id = suporte` (canal QR/Baileys), protocolo `20260326-00043`.
- **Não há registro** desse número no horário informado (15:06 BRT) nem em conversa ativa.
- No mesmo intervalo, o sistema estava funcionando e recebendo outros eventos (inclusive 1 evento da API Oficial de teste), então não é parada geral.
- Conclusão prática: para esse caso específico, o evento não foi persistido no fluxo esperado da API Oficial; hoje falta trilha persistente de “motivo de descarte”, então o motivo exato não fica auditável.

## O que vou implementar (100% aditivo)
1. **Criar auditoria persistente de ingestão da API Oficial**
   - Nova tabela para registrar cada evento recebido pelo webhook (inclusive os descartados), com:
     - `received_at`, `from_phone`, `phone_number_id_payload`, `wamid`, `event_kind` (`message`/`status`),
     - `decision` (`processed_queue`, `processed_robot`, `skipped_duplicate`, `skipped_no_connection`, `skipped_no_department`, `error_contact`, `error_conversation`, `error_message_insert`),
     - `reason`, `connection_id`, `conversation_id`.
   - RLS restrita a admin/supervisor.

2. **Instrumentar `meta-whatsapp-webhook` para gravar decisão em todos os caminhos**
   - Antes de cada `continue`/erro, gravar o motivo na auditoria.
   - Ao processar com sucesso, gravar se foi para fila (`em_fila`) ou atendimento automático (`em_atendimento` por robô).
   - Isso resolve o “precisamos saber o motivo”.

3. **Adicionar fallback de resolução de conexão (sem quebrar regra atual)**
   - Mantém busca principal por `phone_number_id`.
   - Se não encontrar, tenta fallback controlado por `waba_id`/metadados compatíveis e registra que houve fallback.
   - Se ainda falhar, registra `skipped_no_connection` com payload mínimo útil.

4. **Expor diagnóstico no painel de integrações (somente leitura)**
   - Bloco “Diagnóstico API Oficial” em Admin Integrations com últimos eventos da auditoria (ex.: 20/50 últimos), filtros rápidos por número e status.
   - Permite o gestor ver imediatamente “por que caiu/não caiu”, sem depender de log técnico.

5. **Validação end-to-end com o caso real informado**
   - Testar novo envio para o número 11930837322.
   - Confirmar no painel:
     - se entrou em `processed_queue` (caiu na fila),
     - ou `processed_robot` (foi direto para robô),
     - ou algum `skipped_*`/`error_*` com motivo explícito.
   - Confirmar criação de conversa/histórico e rastreabilidade completa.

## Arquivos/artefatos planejados
1. `supabase/migrations/<timestamp>_create_meta_webhook_audit.sql` (nova tabela + índices + RLS)
2. `supabase/functions/meta-whatsapp-webhook/index.ts` (instrumentação + fallback + reason codes)
3. `src/pages/admin/AdminIntegrations.tsx` (seção de diagnóstico em leitura)

## Detalhes técnicos (resumo)
- A correção não altera comportamento existente de roteamento; ela adiciona observabilidade e fallback seguro.
- O problema “não caiu na fila” será diferenciado entre:
  - **não recebido**,
  - **recebido e descartado** (com razão),
  - **recebido e direcionado ao robô** (não fila por regra),
  - **recebido e entrou na fila**.
- Com isso, cada novo caso terá causa objetiva em banco, sem depender de inferência por log volátil.
