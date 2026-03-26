

# Delma Chat: Execucao Real com Dados e Renderizacao Rica

## Problema
A Edge Function so busca dados reais para 3 comandos (`status_suporte`, `consultar_metricas`, `listar_sugestoes`). Todos os outros (analise de atendente, performance de robo, comparativo, anomalias) retornam apenas o texto generico da classificacao IA. O frontend tambem nao renderiza HTML rico — so bold e quebra de linha.

## Solucao

### 1. Edge Function `delma-chat-command` — Adicionar handlers de dados reais

Expandir a logica pos-classificacao para que TODOS os comandos analiticos busquem dados antes de responder:

**Novos handlers a adicionar (alem dos 3 existentes):**

- `analisar_atendente` — Buscar N conversas recentes do atendente por nome (join `profiles` + `conversation_logs` + `messages`), calcular TMA/tags, passar dados reais ao prompt IA para formatacao em card HTML
- `performance_robo` — Buscar conversas do robo (`conversations.assigned_to_robot`), calcular resolucao vs transferencia, gaps, comparar com semana anterior
- `comparar_atendentes` — Buscar todos atendentes Suporte, calcular Conv/TMA/Resolucao por atendente, formatar tabela
- `alertas_anomalias` — Buscar `delma_anomalies` nao resolvidas, formatar lista com severidade
- `conversa_livre` com dados — Quando a classificacao detectar que o usuario pede dados (ex: "pegue as 10 ultimas da Milena"), reclassificar como `analisar_atendente`

**Fluxo para cada handler:**
1. Query ao banco (limite 100 registros)
2. Montar JSON com dados reais
3. Enviar ao LLM com prompt: "Formate estes dados reais em HTML estruturado usando os templates de card. NAO invente dados."
4. Retornar HTML formatado

**Classificacao expandida no prompt:**
Adicionar novas acoes: `analisar_atendente`, `performance_robo`, `comparar_atendentes`, `alertas_anomalias` com exemplos

### 2. Frontend `DelmaChatWidget` — Renderizacao HTML rica

- Substituir `renderMarkdown` por renderizador que suporta HTML real (ja usa `dangerouslySetInnerHTML`)
- Adicionar CSS inline/classes para cards, tabelas, badges de severidade, barras de progresso
- Adicionar handler de clique para botoes inline (ex: `data-delma-action="treinar_sebastiao"`) que disparam `sendMessage`
- Manter o fallback markdown para respostas simples

### 3. Templates de resposta (no prompt do LLM)

Definir templates HTML que o LLM deve usar:
- Card de metricas (bordas, icones, cores)
- Tabela comparativa (zebra striping)
- Lista de alertas (🔴/🟡 badges)
- Card de atendente/robo com metricas

## Arquivos a editar

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/delma-chat-command/index.ts` | Expandir classificacao + adicionar handlers `analisar_atendente`, `performance_robo`, `comparar_atendentes`, `alertas_anomalias` com queries reais + prompt de formatacao HTML |
| 2 | `src/components/admin/DelmaChatWidget.tsx` | Melhorar renderizacao para suportar HTML rico (cards, tabelas, botoes de acao), adicionar CSS para cards inline, handler de clique em botoes `data-delma-action` |

Nenhuma outra tabela, Edge Function ou componente sera alterado.

