

# Corrigir: Observações manuais devem ser a prioridade do relatório

## Problema

As observações manuais do gestor são inseridas no final do prompt como uma nota secundária (`**Observações manuais do gestor:** ...`). A IA trata isso como contexto adicional e gera o relatório padrão, ignorando o pedido específico (ex: "relatório do atendente Alex dos últimos 3 dias").

## Solução

Quando há observações manuais, reestruturar o prompt para que a instrução do gestor seja a **diretriz principal** do relatório, não um apêndice.

## Mudança

**Arquivo**: `supabase/functions/brain-analysis/index.ts`

1. **Quando `reqUserContext` existe**: alterar o system prompt e o user prompt para priorizar a solicitação do gestor. O prompt passa a instruir a IA a **focar exclusivamente no que foi pedido**, usando as métricas como base de dados de apoio.

2. **Quando `reqUserContext` está vazio**: manter o comportamento atual (relatório geral).

Lógica resumida:

```typescript
const systemMessage = reqUserContext
  ? "Você é a Delma, gerente de suporte. O gestor fez uma solicitação específica. " +
    "Você DEVE responder EXATAMENTE o que foi pedido, usando as métricas disponíveis. " +
    "NÃO gere um relatório genérico. Foque 100% na solicitação."
  : "Você é a Delma, uma gerente de suporte altamente analítica e proativa. " +
    "Gere relatórios claros e acionáveis.";

const userMessage = reqUserContext
  ? `**SOLICITAÇÃO DO GESTOR (PRIORIDADE MÁXIMA):**\n${reqUserContext}\n\n` +
    `Use os dados abaixo para atender a solicitação acima:\n\n${metricsBlock}`
  : analysisPrompt; // prompt atual com estrutura fixa
```

Isso garante que ao digitar "quero um relatório do atendente Alex dos últimos 3 dias", a IA filtre e foque nos dados desse atendente específico.

