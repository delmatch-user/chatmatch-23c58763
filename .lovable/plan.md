

# Enriquecer dados enviados à Delma para relatórios específicos

## Problema

O `metricsBlock` enviado à IA contém apenas resumos agregados por agente (total de conversas, TMA médio). Quando o gestor pede "relatório do Alex dos últimos 3 dias", a IA não tem dados diários por agente, nem logs problemáticos por agente, então diz que não consegue gerar.

## Solução

Expandir o `metricsBlock` no `brain-analysis/index.ts` para incluir dados granulares que já são calculados mas não são passados à IA:

### Dados a adicionar no prompt

1. **Breakdown diário por agente** — já existe `dailyBuckets` global, criar um equivalente por agente com conversas/dia, TMA/dia, TME/dia
2. **Conversas problemáticas por agente** — filtrar `errorLogs` por `assigned_to_name` e listar no prompt
3. **Tags detalhadas por agente** — já calculadas em `agentStats[name].tags`, incluir todas (não só top 3)
4. **Tendências diárias globais** — já calculadas em `dailyTrends`, incluir no prompt

### Mudança técnica

**Arquivo**: `supabase/functions/brain-analysis/index.ts`

1. Após calcular `agentStats`, criar `agentDailyStats` — um map `agente → dia → { count, tmaSum, tmaCount, tmeSum, tmeCount }`
2. Expandir o `metricsBlock` com:
   - Seção "Dados diários por agente" com tabela por agente mostrando conversas, TMA, TME por dia
   - Seção "Conversas problemáticas por agente" listando erros/reclamações atribuídos a cada agente
   - Seção "Tendências diárias globais" com os dados de `dailyTrends`
   - Todas as tags por agente (não truncadas)
3. Adicionar instrução no system prompt dizendo que a IA tem acesso a **todos os dados** e deve usá-los diretamente sem pedir mais informações

### Exemplo do prompt expandido

```
**Dados diários por agente:**
Alex:
  2026-03-22: 5 conversas, TMA 12.3min, TME 2.1min
  2026-03-23: 8 conversas, TMA 9.1min, TME 1.8min
  2026-03-24: 3 conversas, TMA 15.0min, TME 3.2min
  Tags: Financeiro - Normal(4), Operacional - Geral(6), Acidente - Urgente(2)
  Problemáticas: 2 (prioridade alta/urgente)

**Tendências diárias globais:**
  2026-03-22: TMA 10.5min, TME 2.0min, Urgentes: 3
  2026-03-23: TMA 8.2min, TME 1.5min, Urgentes: 1
  ...
```

Isso garante que a Delma tem tudo que precisa para gerar qualquer relatório específico sem pedir dados ao gestor.

