

# Reestruturar Aba Sugestoes + Nova Edge Function brain-learn-from-conversations

## Resumo
Redirecionar sugestoes de tipo `report_schedule` para a aba Relatorio IA, adicionar novos tipos de sugestao (aprendizado_humano, aprendizado_robo, melhoria_delma), criar Edge Function `brain-learn-from-conversations` e atualizar o frontend com mini-cards de origem e filtros por tipo.

## Arquivos a criar/editar

### 1. Nova Edge Function: `supabase/functions/brain-learn-from-conversations/index.ts`
- Busca `conversation_logs` dos ultimos 7 dias, separando:
  - Conversas humanas: `finalized_by IS NOT NULL` (atendente humano finalizou)
  - Conversas de robo: `finalized_by IS NULL` (robo finalizou, sem transferencia)
  - Conversas de robo transferidas: `finalized_by IS NULL` com transferencia posterior
- Para conversas humanas: extrai padroes de resposta eficaz (TMA baixo, resolucao rapida)
- Para conversas de robos: identifica transferencias desnecessarias cruzando com `transfer_logs`
- Envia lote para IA (Gemini Flash) com prompt estruturado pedindo sugestoes tipadas
- Salva em `delma_suggestions` com category = `aprendizado_humano`, `aprendizado_robo` ou `melhoria_delma`
- Salva padroes identificados em `delma_memory` como `data_signal`
- Deduplicacao: verifica sugestoes similares (mesmo robot + mesma categoria) nos ultimos 14 dias
- Anonimizacao: remove nomes, telefones e emails dos exemplos de conversa

### 2. `supabase/config.toml` — adicionar entrada
```toml
[functions.brain-learn-from-conversations]
verify_jwt = false
```

### 3. Editar: `src/components/admin/DelmaSuggestionsTab.tsx`
Mudancas aditivas:
- Filtrar `report_schedule` da lista de sugestoes exibidas (`pending` e `processed` excluem category === 'report_schedule'`)
- Adicionar novos tipos ao `categoryConfig`:
  - `aprendizado_humano`: label "Aprendizado Humano", icone Users, cor azul
  - `aprendizado_robo`: label "Aprendizado Robo", icone Bot, cor roxa
  - `melhoria_delma`: label "Melhoria Delma", icone Brain, cor amber
- Adicionar filtro Select de tipo no header (Todas | Treinamento | Metas | Aprendizado Humano | Aprendizado Robo | Melhoria Delma)
- Substituir o info-box por 3 mini-cards horizontais no topo:
  - 👤 X padroes com humanos (count de `aprendizado_humano` historico)
  - 🤖 X padroes com robos (count de `aprendizado_robo` historico)
  - ✅ X melhorias aplicadas (count de approved/edited de qualquer tipo)
- Adicionar botao "Analisar Conversas Agora" ao lado do "Executar Analise" que invoca `brain-learn-from-conversations`
- Para cards dos novos tipos na visao expandida: exibir justificativa, exemplos de conversa (do campo `content.examples`), acao proposta (`content.proposed_action`), e memorias relacionadas
- Adicionar campo de motivo ao rejeitar (ja existe, manter)
- A logica de aprovacao para novos tipos: `aprendizado_humano` e `aprendizado_robo` seguem o fluxo de `robot_training` se tiverem `content.robot_id` e `content.training_suggestion_id`; caso contrario apenas marcam como aprovado e registram memoria

### 4. Editar: `src/pages/admin/AdminBrain.tsx` — aba Relatorio IA
Mudanca aditiva na `TabsContent value="ai-report"`:
- Apos o bloco de Historico de Relatorios, adicionar secao "Agendamentos Sugeridos pela Delma"
- Buscar `delma_suggestions` com `category = 'report_schedule'` e `status = 'pending'`
- Renderizar cards com botoes Aprovar/Rejeitar (reutilizando logica similar ao DelmaSuggestionsTab)
- Ao aprovar, inserir em `report_schedule` igual ja faz no DelmaSuggestionsTab

### 5. Editar: `src/components/admin/DelmaEvolutionTab.tsx`
Mudanca aditiva no `categoryConfig`:
- Adicionar os 3 novos tipos para que os filtros e labels funcionem na timeline

## Detalhes da Edge Function

```text
Prompt para IA:
"Analise as conversas de suporte dos ultimos 7 dias.

CONVERSAS HUMANAS (atendentes reais):
[resumos anonimizados com TMA e tags]

CONVERSAS DE ROBOS:
[resumos com taxa de transferencia e tags]

Para cada padrao identificado, gere uma sugestao estruturada:
{
  "type": "aprendizado_humano" | "aprendizado_robo" | "melhoria_delma",
  "title": "titulo curto",
  "justification": "dados: volume, periodo, nomes de robos",
  "content": {
    "pattern": "descricao do padrao",
    "examples": ["exemplo anonimizado 1", "exemplo 2"],
    "proposed_action": "acao concreta proposta",
    "robot_name": "nome do robo (se aplicavel)",
    "robot_id": "id (se aplicavel)",
    "agent_alias": "Atendente A (anonimizado)"
  },
  "confidence_score": 75
}"
```

## Fluxo de aprovacao
- Novos tipos seguem o mesmo fluxo existente (Aprovar / Editar e Aprovar / Rejeitar)
- Se `content.robot_id` estiver presente e a acao for Q&A, aplica no robo automaticamente
- Rejeicao continua alimentando `delma_memory` como ja ocorre

## Cron job
- Usar `pg_cron` para agendar `brain-learn-from-conversations` toda segunda 7h BRT (10:00 UTC)
- SQL via insert tool (nao migration):
```sql
SELECT cron.schedule('brain-learn-conversations-weekly', '0 10 * * 1', $$
  SELECT net.http_post(url:='...', headers:='...'::jsonb, body:='{}'::jsonb) as request_id;
$$);
```

