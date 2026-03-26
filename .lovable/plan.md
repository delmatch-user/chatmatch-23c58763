

# Corrigir Arthur (SDR) que nao responde clientes

## Diagnostico

Ha **19 conversas travadas** com o Arthur do Comercial atribuido mas sem atendente humano. O problema tem uma causa raiz clara:

O `sync-robot-schedules` detecta conversas travadas (robo atribuido, sem resposta) e tenta reenviar chamando `robot-chat` (linha 352). Porem, `robot-chat` tem um **SDR Guard** (linha 950) que diz "essa conversa e SDR, ignorando — sdr-robot-chat e responsavel" e retorna sem fazer nada.

**Resultado**: ciclo infinito de retries que nunca resolvem — o retry chama `robot-chat`, que ignora, e na proxima rodada tenta novamente.

Exemplo concreto: conversa `8bb00196` (Iheb Belarbi) — cliente mandou mensagem em 25/03, nunca recebeu resposta do robo. Os logs mostram o retry acontecendo repetidamente sem efeito.

## Correcao

### `supabase/functions/sync-robot-schedules/index.ts`

Na secao de retry de conversas travadas (linhas 339-361):

1. Antes de montar o payload, verificar se a conversa tem `sdr_deal_id`
2. Se sim, chamar `sdr-robot-chat` em vez de `robot-chat`, passando `dealId` no payload
3. Se nao, manter o fluxo atual chamando `robot-chat`

Mudanca localizada — apenas o bloco de retry precisa saber diferenciar SDR de standard.

**Adicionar `sdr_deal_id` no SELECT** da query de conversas travadas (linha 253) para ter essa informacao disponivel.

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/sync-robot-schedules/index.ts` | Incluir `sdr_deal_id` no select + rotear retry para `sdr-robot-chat` quando for SDR |

