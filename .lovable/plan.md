

## Plano: Insights autonomos da Delma + Performance individual dos atendentes

### O que muda

1. **Insights autonomos mais ricos** — Expandir `computeLearnings()` com analises mais profundas: comparativo entre agentes (quem melhorou/piorou), deteccao de sobrecarga, taxa de resolucao por agente, horarios de pico por agente, e sugestoes automaticas de acao.

2. **Nova secao "Performance Atendentes"** — Uma tab dedicada no Cerebro mostrando cada atendente do Suporte com:
   - Conversas finalizadas no periodo
   - TMA individual (com indicador visual verde/amarelo/vermelho)
   - TME individual
   - Tags mais frequentes por agente
   - Grafico de barras comparativo entre agentes
   - Comparativo com periodo anterior (tendencia de melhora/piora)

3. **Edge function enriquecida** — Adicionar ao `agentStats` dados de TME individual, tags por agente e comparativo com periodo anterior.

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Enriquecer `agentStats` com TME, tags frequentes, e stats do periodo anterior |
| `src/pages/admin/AdminBrain.tsx` | Nova tab "Atendentes", insights autonomos expandidos |

### Detalhes tecnicos

**Edge function — agentStats enriquecido:**
```typescript
agentStats: [{
  name: string,
  count: number,
  avgTime: number,        // TMA
  avgWaitTime: number,    // TME individual
  topTags: [string, number][],  // top 3 tags do agente
  prevCount: number,      // conversas periodo anterior
  prevAvgTime: number,    // TMA periodo anterior
}]
```

Calculado a partir dos `logs` e `prevLogs` ja buscados, agrupando por `assigned_to_name`.

**Frontend — nova tab "Atendentes":**
- Tab "Atendentes" entre "Erros & Gaps" e "Relatorio IA"
- Grafico de barras horizontal comparando TMA de cada agente
- Cards individuais por agente com metricas + tendencia
- Badge de status: verde (TMA abaixo da media), amarelo (na media), vermelho (acima)

**Frontend — insights autonomos expandidos no `computeLearnings`:**
- Agente que mais melhorou TMA vs periodo anterior
- Agente sobrecarregado (>30% do volume total)
- Alerta se algum agente tem TME muito acima da media
- Sugestao de redistribuicao de carga quando desbalanceado

