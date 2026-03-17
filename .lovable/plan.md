

## Correção: Formatação de números brasileira no Arthur (SDR Robot)

### Problema
O Arthur usa formato americano para números (ponto como separador decimal, sem separador de milhar) nas simulações e pesquisas por cidade. Exemplo: escreve "700,000" ou "7,000.00" em vez de "700.000" ou "7.000,00".

### Causa raiz
Dois pontos no código:

1. **Linha 571** (`sdr-robot-chat/index.ts`): `Number(deal.value).toFixed(2)` gera formato US (ex: `7000.00` em vez de `7.000,00`)
2. **System prompt sem instrução de formatação**: O modelo não recebe nenhuma diretriz explícita sobre usar formato brasileiro (pt-BR) para números e moedas

### Correção

**Arquivo: `supabase/functions/sdr-robot-chat/index.ts`**

1. Adicionar helper de formatação brasileira:
```typescript
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

2. Linha 571 — formatar valor do deal em pt-BR:
```typescript
const dealValue = deal.value ? `Valor: R$ ${formatBRL(Number(deal.value))}` : '';
```

3. Nas Diretrizes do system prompt (~linha 651), adicionar instrução explícita:
```
- FORMATAÇÃO NUMÉRICA: Sempre use o padrão brasileiro para números e valores monetários. Use ponto como separador de milhar e vírgula como separador decimal. Exemplos: 700.000 (setecentos mil), R$ 7.000,00 (sete mil reais), 1,5% (um e meio por cento). NUNCA use o formato americano (ex: 700,000 ou R$ 7,000.00).
```

### Resultado esperado
- O contexto do deal já chega formatado corretamente (R$ 7.000,00)
- O modelo recebe instrução explícita para usar formato pt-BR em todas as respostas
- Simulações e pesquisas por cidade usarão vírgula para decimais e ponto para milhares

