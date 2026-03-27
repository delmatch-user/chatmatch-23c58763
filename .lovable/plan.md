

# Corrigir mensagem de transferencia aparecendo como se fosse do cliente

## Problema
Quando a Delma envia "Vou te transferir para o Sebastiao...", a mensagem aparece no lado do cliente no chat. Causa raiz:

1. No `robot-chat/index.ts` (linha 1662-1669), a mensagem de transferencia e salva com `sender_id: null` e `sender_name: robot.name` (ex: "Delma")
2. No `AppContext.tsx` (linha 354-358), a logica de mapeamento faz: `senderId = sender_id || (isRobotMessage ? 'robot' : 'contact')`
3. `isRobotMessage` so e `true` se `sender_name` contem `[ROBOT]` ou `(IA)`
4. Como "Delma" nao contem nenhum desses marcadores, `senderId` vira `'contact'` e a mensagem renderiza no lado esquerdo (cliente)

## Correcao

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/robot-chat/index.ts` | Adicionar marcador `[ROBOT]` no `sender_name` da mensagem de transferencia |

### Detalhe

Linha 1665, trocar:
```typescript
sender_name: robot.name,
```
por:
```typescript
sender_name: `${robot.name} [ROBOT]`,
```

O marcador `[ROBOT]` ja e removido na exibicao pelo `cleanSenderName` (linha 1453 do ChatPanel). Isso garante que a mensagem aparece no lado direito (atendente/robo) sem mostrar o marcador ao usuario.

Mesma correcao deve ser aplicada em qualquer outro insert de mensagem do robo que use `sender_id: null` sem o marcador.

