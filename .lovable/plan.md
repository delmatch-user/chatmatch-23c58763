

# Por que Júlia e Sebastião não respondem após transferência

## Diagnóstico (causa raiz confirmada)

O problema está no conflito entre o **lock de 5 segundos** que o robô de origem (Delma) seta ao transferir e o **lock atômico** que o robô de destino (Júlia/Sebastião) tenta adquirir ao iniciar.

Fluxo atual quebrado:
1. Delma decide transferir para Júlia via `transfer_to_robot`
2. Código seta `robot_lock_until = agora + 5s` (linha 1692-1700 do `robot-chat`)
3. Imediatamente chama `robot-chat` para Júlia via `fetch()` (fire-and-forget)
4. Júlia tenta adquirir o lock atômico: `UPDATE ... WHERE robot_lock_until IS NULL OR < NOW()`
5. O lock de 5s AINDA está ativo, então o UPDATE retorna `count: 0`
6. Júlia aborta com "Lock atômico NÃO conquistado"
7. Após 5s o lock expira, mas a chamada já retornou
8. O cron (`sync-robot-schedules`) tem um guard de 3 minutos para transferências recentes, então só tenta retry depois de 3 min
9. Resultado: o cliente espera 3+ minutos ou nunca recebe resposta

Além disso, a chamada de transferência (linha 1733-1747) **não envia o campo `message`**, então mesmo se o lock passasse, o robô destino receberia `message: undefined`.

## O que vou implementar

### 1) Permitir que transferências pulem o lock atômico
No `robot-chat`, quando `isTransfer: true`, o robô destino deve pular a etapa de lock atômico e simplesmente setar seu próprio lock. Isso é seguro porque a transferência já é um evento controlado pelo robô de origem.

### 2) Incluir a mensagem na chamada de transferência
Na seção `transfer_to_robot`, incluir o campo `message` com o conteúdo da última mensagem do cliente, para que o robô destino tenha contexto imediato.

### 3) Limpar o lock antes de chamar o destino
Trocar o lock de 5s por `null` ANTES de chamar o robô destino, já que o destino vai setar seu próprio lock ao processar.

## Arquivos envolvidos
- `supabase/functions/robot-chat/index.ts`

## Detalhes técnicos

**Mudança 1** — No lock atômico (linhas ~972-989), adicionar bypass para `isTransfer`:
```typescript
if (isTransfer) {
  // Transferência: setar lock diretamente sem competir
  await supabase.from('conversations')
    .update({ robot_lock_until: immediateLockUntil })
    .eq('id', conversationId);
} else {
  // Fluxo normal: lock atômico competitivo
  const { count } = await supabase...
  if (!count) return skipped;
}
```

**Mudança 2** — Na seção `transfer_to_robot` (linhas ~1690-1748):
- Setar `robot_lock_until: null` em vez de 5s
- Incluir `message: lastCustomerContent` no payload do fetch

## Resultado esperado
- Após Delma transferir para Júlia/Sebastião, o robô destino responde imediatamente (sem esperar lock expirar)
- O campo `message` sempre chega preenchido
- O cron continua como safety net para casos onde a chamada direta falha

