

## Plano: Reformular aba "Conhecimento" para visao gerencial da Delma

### Problema atual
A aba "Conhecimento" mostra dados dos robos (Q&A, links, instrucoes) — isso e conhecimento de **agente**. O usuario quer ver o que a **Delma como gerente** aprendeu: padroes detectados, tendencias, insights operacionais derivados da analise de conversas.

### O que sera feito

Reformular a aba "Conhecimento" em 3 secoes focadas na perspectiva gerencial:

1. **O que a Delma Aprendeu** — Usa a funcao `computeLearnings()` ja existente mas apresentada de forma mais rica, com icones e categorias (volume, performance, automacao, alertas). Hoje esses insights so aparecem na overview como texto simples.

2. **Padroes Detectados** — Analise automatica dos dados de metricas:
   - Tags mais recorrentes com tendencia (crescendo/caindo vs periodo anterior)
   - Horarios/canais com mais problemas
   - Distribuicao de carga entre atendentes (quem esta sobrecarregado)
   - Taxa de resolucao IA vs humana com evolucao

3. **Recomendacoes de Fluxo** — Mantem as sugestoes de melhoria mas reformuladas como recomendacoes da gerente Delma (nao mais vinculadas a robos especificamente):
   - Sugestoes de redistribuicao de carga
   - Alertas de temas sem cobertura adequada
   - Recomendacoes de treinamento baseadas em gaps
   - Sugestoes de automacao baseadas em volume

A secao de "Base de Conhecimento dos Robos" (cards de robos com Q&A count) sera removida desta aba — essa informacao ja existe na pagina de Robos.

### Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Reformular conteudo da TabsContent "knowledge": remover cards de robos, expandir `computeLearnings` com categorias, adicionar secao de padroes detectados, reformular sugestoes como recomendacoes gerenciais |

### Detalhes tecnicos

- Reutiliza dados ja disponiveis em `BrainMetrics` (topTags, agentStats, channelCounts, priorityCounts, errorLogs, aiResolved/humanResolved)
- `computeLearnings` sera expandida para retornar objetos com `{ category, icon, text, severity }` em vez de strings simples
- Nova funcao `computePatterns(m: BrainMetrics)` para detectar padroes (distribuicao de carga, canais problematicos, tags em tendencia)
- Nao requer mudancas no backend — tudo client-side com os dados ja disponíveis

