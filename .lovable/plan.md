

## Plano: Reformular aba "Conhecimento" — Foco no Aprendizado da Delma

### Problema
A aba "Conhecimento" atualmente duplica conteudo do "Painel" (mesmos insights, padroes, recomendacoes). O usuario quer uma visao unica focada no **aprendizado continuo** da Delma: o que ela ja sabe, o que aprendeu recentemente, onde melhorou, e o que ainda precisa aprender.

### Nova estrutura da aba "Conhecimento"

**1. Evolucao da Delma (KPIs de aprendizado)**
4 cards compactos no topo:
- **Temas Dominados** — quantidade de tags que a IA resolve bem (aiResolved alto para essas tags)
- **Taxa de Melhoria** — % de melhoria no TMA periodo atual vs anterior
- **Gaps Identificados** — quantidade de temas onde a IA falha (tags frequentes em errorLogs)
- **Score de Maturidade** — nota de 0-100 baseada em combinacao de automacao + TMA + TME

**2. O que a Delma ja Sabe**
Card com lista dos temas/tags que a Delma resolve bem (alta taxa de resolucao IA). Para cada tema: nome da tag, quantidade resolvida, badge "Dominado" ou "Aprendendo".

**3. O que a Delma Aprendeu (periodo)**
Card mostrando evolucoes concretas comparando periodo atual vs anterior:
- Melhoria no TMA por agente (quem evoluiu)
- Novos temas que passaram a ser resolvidos por IA
- Reducao de erros em categorias especificas
- Cada item com icone de tendencia (seta verde = melhorou)

**4. Onde a Delma Precisa Melhorar**
Card com gaps concretos:
- Tags frequentes em conversas problematicas onde IA nao resolve
- Temas com alto TME (demora na fila = IA nao esta capturando)
- Canais com baixa automacao
- Cada item com badge de prioridade e sugestao do que fazer

**5. Proximo Passo — O que Aprender**
Card com acoes priorizadas tipo checklist:
- "Criar Q&A sobre [tag X] — aparece em Y% dos erros"
- "Melhorar instrucoes para canal [Instagram] — 0% automacao"
- "Treinar [agente] em [tema] — TMA 3x acima da media"
- Ordenado por impacto estimado

### Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Substituir conteudo completo da TabsContent "knowledge" com as 5 secoes acima. Novas funcoes: `computeKnowledgeScore()`, `computeMasteredTopics()`, `computeImprovements()`, `computeGaps()`, `computeNextSteps()`. Remover uso de `computeManagerialInsights`, `computePatterns`, `computeRecommendations` desta tab (manter apenas para referencia interna dos calculos). |

### Detalhes tecnicos

- Todos os dados vem do `BrainMetrics` ja disponivel — sem backend novo
- Score de maturidade: formula ponderada `(aiPct * 0.4) + (tmaMelhoria * 0.3) + (100 - errorPct * 0.3)`
- "Dominado" = tag aparece em conversas onde `assigned_to_name` e vazio (resolvido por IA)
- "Gap" = tag frequente em `errorLogs` mas rara em resolucoes IA
- Comparativo usa `prevTma`, `prevTotalConversas` etc do backend

