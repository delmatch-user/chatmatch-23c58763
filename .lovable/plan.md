

# Reduzir Delay de Resposta dos Robos para 20s

## Problema
O `groupMessagesTime` padrao e 40s, e conversas "substantivas" caem para metade (20s). O delay inicial de lock e 120s (2 min). Alem disso, ha delays fixos de 3s em varios pontos.

## Mudancas

### 1. `supabase/functions/robot-chat/index.ts`

- **Linha 969**: Reduzir lock imediato de `120000` (120s) para `20000` (20s)
- **Linha 1225**: Reduzir `groupMessagesTime` default de `40` para `20`
- **Linha 1238**: Ajustar delay de mensagem substantiva — `Math.max(5, Math.floor(groupMessagesTime / 2))` (era `Math.max(10, ...)`)
- **Linha 1245**: Reduzir delay sem agrupamento de `5` para `3`
- **Linha 974**: Reduzir delay anti-race de `3000` para `2000`ms
- **Linha 1908**: Reduzir delay pre-envio de `3000` para `2000`ms

### 2. `supabase/functions/sdr-robot-chat/index.ts`

- **Linha 531**: Reduzir lock imediato de `120000` para `20000` (20s)
- **Linha 536**: Reduzir delay anti-race de `3000` para `2000`ms
- **Linha 1387**: Reduzir delay pre-envio de `3000` para `2000`ms

### 3. Deploy ambas Edge Functions

## Resultado
Tempo maximo de espera antes da resposta cai de ~40s para ~20s. Lock de concorrencia reduzido proporcionalmente.

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/robot-chat/index.ts` | Lock 20s, groupMessages default 20, delays menores |
| 2 | `supabase/functions/sdr-robot-chat/index.ts` | Lock 20s, delays menores |

