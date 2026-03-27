

# Reduzir delay de resposta após transferência entre robôs

## Problema
Quando a Delma transfere para Sebastião ou Julia, o robô destino demora ~27 segundos para responder:
- 5s lock da transferência (anti-duplicata)
- 2s delay anti-race (linha 974)
- 20s agrupamento de mensagens (linha 1230: `Math.max(15, 20)`)

O agrupamento de mensagens faz sentido para mensagens novas do cliente (esperar ele terminar de digitar), mas numa transferência o contexto já está completo — não há motivo para esperar 20s.

## Correção

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/robot-chat/index.ts` | Reduzir delay de transferência para 3s e pular delay anti-race quando `isTransfer` |

### Detalhes técnicos

**Linha 1221**: Reduzir `transferDelay` de 15 para 3:
```typescript
const transferDelay = 3; // 3s para transferências (contexto já completo)
```

**Linha 1229-1230**: Usar `transferDelay` direto sem `Math.max` com `groupMessagesTime`:
```typescript
if (isFromTransfer) {
  effectiveDelay = transferDelay; // Não aplicar groupMessagesTime em transferências
```

**Linha 973-974**: Pular o delay anti-race de 2s quando é transferência (o lock de 5s da origem já cumpre esse papel):
```typescript
if (!isFromTransfer) {
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

**Resultado**: Tempo total reduzido de ~27s para ~8s (5s lock + 3s delay).

