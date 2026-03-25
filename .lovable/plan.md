

# Reestruturar Aba Sugestões + Nova Edge Function brain-learn-from-conversations

## Status: ✅ Implementado

## O que foi feito

### 1. Edge Function `brain-learn-from-conversations` (NOVA)
- Analisa conversas humanas e de robôs dos últimos 7 dias
- Identifica padrões de resposta eficaz, transferências desnecessárias e gaps
- Gera sugestões tipadas: `aprendizado_humano`, `aprendizado_robo`, `melhoria_delma`
- Deduplicação contra sugestões existentes (14 dias)
- Anonimização de dados de clientes
- Salva padrões no `delma_memory` como `data_signal`

### 2. DelmaSuggestionsTab atualizado
- Sugestões `report_schedule` removidas da Central (redirecionadas para aba Relatório IA)
- 3 novos tipos com ícones e cores: Aprendizado Humano, Aprendizado Robô, Melhoria Delma
- Mini-cards no topo: padrões humanos, padrões robôs, melhorias aplicadas
- Filtro por categoria
- Botão "Analisar Conversas" que invoca `brain-learn-from-conversations`
- Cards expandidos para novos tipos: padrão, exemplos, ação proposta

### 3. DelmaReportScheduleSuggestions (NOVO componente)
- Exibe sugestões de agendamento na aba Relatório IA
- Aprovar/Rejeitar com feedback para memória

### 4. DelmaEvolutionTab atualizado
- Novos tipos adicionados ao `categoryConfig`

### 5. Cron job configurado
- `brain-learn-conversations-weekly`: toda segunda às 10:00 UTC (7h BRT)
