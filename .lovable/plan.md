
# Restabelecer recebimento da API Oficial (quando “está tudo certo” mas não chega POST)

## Diagnóstico atual (com base no que já medi)
- A integração interna **processa corretamente** quando recebe POST (teste manual gerou `processed_queue` no `meta_webhook_audit`).
- A conexão `meta_api` está ativa e com `phone_number_id` preenchido.
- Nas últimas horas, entrou apenas evento de teste (`wamid.TEST_DIAG_001`), ou seja: o problema é **falta de entrega de eventos reais** antes do processamento da fila.

## Plano de implementação (focado em causa raiz e auto-recuperação)

1) **Fortalecer telemetria de entrada no webhook (primeiro ponto da cadeia)**
- Arquivo: `supabase/functions/meta-whatsapp-webhook/index.ts`
- Registrar auditoria logo no início de cada POST, antes de qualquer filtro, com:
  - `field` recebido (messages/statuses/outros),
  - `entry_id` (WABA),
  - `phone_number_id` do payload,
  - `signature_valid`,
  - marcador `is_test` (ex.: `wamid.TEST_`).
- Resultado: fica impossível “sumir sem rastro”; saberemos se chegou e por que foi ignorado.

2) **Adicionar diagnóstico ativo da assinatura/inscrição no provedor (dentro do backend)**
- Novo backend function: `supabase/functions/meta-webhook-diagnose/index.ts`
- A função consulta, usando token salvo da conexão:
  - validade do token,
  - vínculo do app com o WABA (`subscribed_apps`),
  - consistência `phone_number_id`/WABA.
- Incluir modo `repair=true` para reinscrever app automaticamente quando detectar não inscrição.
- Resultado: elimina tentativa manual repetitiva e confirma tecnicamente onde está quebrando.

3) **Expor diagnóstico operacional na aba API Oficial**
- Arquivos:
  - `src/pages/admin/AdminIntegrations.tsx`
  - `src/components/admin/MetaWebhookAuditPanel.tsx`
- Adicionar card “Saúde do Webhook” com:
  - último POST real recebido (tempo relativo),
  - último POST de teste,
  - status de assinatura,
  - status de inscrição no WABA,
  - botão “Diagnosticar agora” e “Reparar inscrição”.
- Resultado: time consegue agir em 1 clique sem abrir painéis externos.

4) **Ajustar schema da auditoria para suportar o novo nível de diagnóstico**
- Nova migration em `supabase/migrations/...`
- Acrescentar colunas em `meta_webhook_audit` para: `field`, `entry_id`, `signature_valid`, `is_test`.
- Índices por `received_at`, `is_test`, `field`.

5) **Validação fim a fim (obrigatória)**
- Rodar “Diagnosticar agora” e confirmar:
  - token válido,
  - app inscrito no WABA,
  - `messages` ativo.
- Enviar mensagem real para API Oficial e validar sequência:
  - `webhook_received` (entrada crua) →
  - decisão (`processed_queue`/`processed_robot`/`skipped_*`) →
  - conversa visível na fila ou motivo explícito no painel.

## Escopo
- Alterações restritas ao fluxo da API Oficial:
  - `meta-whatsapp-webhook`
  - novo `meta-webhook-diagnose`
  - painel de integrações (API Oficial)
  - migration da tabela de auditoria
- Sem mexer em abas não relacionadas.

## Detalhes técnicos (resumo)
- Objetivo não é “mascarar” falha externa: é **detectar automaticamente** se o evento não chegou, chegou inválido, ou foi descartado por regra interna.
- Com isso, qualquer nova falha deixa evidência objetiva em banco e ação de correção guiada na interface.
