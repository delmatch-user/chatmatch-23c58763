

## ✅ Corrigir histórico incompleto em conversas abertas

### Problema
Conversas abertas perdiam histórico porque o sistema usava `messages.length <= 1` para decidir se carregava o histórico completo. Se mensagens chegavam via realtime antes de abrir a conversa, a contagem passava de 1 e o carregamento completo era pulado permanentemente.

### Solução implementada
- Adicionado flag `historyLoaded: boolean` ao tipo `Conversation`
- `loadConversationMessages` marca `historyLoaded = true` após carga completa
- ChatPanel usa `!conversation.historyLoaded` como gatilho (em vez de contagem)
- `fetchConversations` preserva `historyLoaded` e `messages` ao atualizar metadata
- Polling incremental só roda quando `historyLoaded === true`
- Adicionado botão "Recarregar histórico" no menu de ações da conversa

## ✅ Handoff Estruturado com Taxonomia (Suporte)

### Objetivo
Implementar handoff inteligente estilo Klarna para o departamento Suporte, com resumo invisível, tags de prioridade e proteções automáticas.

### Funcionalidades implementadas

1. **Handoff com Resumo Invisível**
   - Campo `handoff_summary` na tabela `conversations`
   - Exibido no ContactDetails como "📋 Resumo da IA" (caixa amarela)
   - Gerado automaticamente pela IA ao transferir para humano

2. **Tags de Taxonomia (5 tags)**
   - 🔴 ACIDENTE_URGENTE — fura fila, prioridade urgente
   - 🟠 OPERACIONAL_PENDENTE — bugs, erros técnicos
   - 🔵 FINANCEIRO_NORMAL — repasses, saques
   - 🟢 DUVIDA_GERAL — perguntas simples
   - 🟡 COMERCIAL_B2B — donos de lojas, B2B
   - Adicionadas automaticamente à conversa na transferência

3. **Regra do "Não Sei" e Aprendizado**
   - IA inclui `[NOVO_CONHECIMENTO_NECESSARIO]` no handoff_summary quando não sabe responder
   - Filtrar no banco por esse texto para atualizar base de conhecimento

4. **Proteção contra Loop**
   - Após 2 tentativas de solicitar dados, IA transfere automaticamente

5. **Blindagem de Acidentes**
   - Menções a acidente/colisão/emergência → transferência imediata com tag URGENTE

6. **Procedimento de Pedidos Duplicados**
   - IA explica que plataforma é passiva/receptora

### Arquivos modificados
- `src/lib/tagColors.ts` — novas tags de taxonomia
- `src/types/index.ts` — campo `handoffSummary` no tipo Conversation
- `src/contexts/AppContext.tsx` — mapear `handoff_summary` do DB
- `src/components/chat/ContactDetails.tsx` — seção "Resumo da IA"
- `supabase/functions/robot-chat/index.ts` — structured handoff, loop protection, blindagem
- Migration: `handoff_summary TEXT` na tabela `conversations`
