
## Corrigir duplicação da Delma

### Diagnóstico
Pelos logs e pelo código, a duplicação não está vindo só da IA “respondendo duas vezes sozinha”. O problema principal hoje é este fluxo:

1. `webhook-machine` recebe eventos repetidos da mesma conversa.
2. Alguns desses eventos parecem ser metadados, não mensagem real do cliente. Exemplo encontrado no log:
   - `mensagem: "João Vitor Israel"`
3. Mesmo assim, o código salva isso como mensagem do cliente e dispara `robot-chat`.
4. A Delma então responde de novo para a mesma conversa.

Além disso, ainda falta uma proteção final no `robot-chat`: mesmo que outro gatilho passe, ele ainda pode salvar/enviar uma resposta repetida se o conteúdo for igual e muito recente.

### O que vou implementar
#### 1) Corrigir o build primeiro
Antes de publicar a correção, vou revisar e ajustar o arquivo alterado no cron (`sync-robot-schedules`) para remover o erro de build pendente e garantir que a base volte a compilar.

#### 2) Bloquear duplicação no `webhook-machine`
No `supabase/functions/webhook-machine/index.ts` eu vou adicionar duas travas:

- **Ignorar payloads que não são mensagem real**
  - quando o conteúdo recebido for claramente um update de nome/metadado
  - exemplo: mensagem igual ao nome do contato, vazia, ou evento sem texto útil

- **Dedupe por janela curta**
  - antes de inserir a mensagem, verificar a última mensagem de entrada da mesma conversa
  - se for o mesmo conteúdo em poucos segundos, não inserir de novo
  - se não inserir, também não disparar `robot-chat`

Isso impede que retry do webhook ou evento duplicado gere nova resposta da Delma.

#### 3) Endurecer o lock antes de chamar a IA
Em `webhook-machine` e no retry do `sync-robot-schedules`, vou deixar o disparo do `robot-chat` dependente de uma “tomada de lock” real da conversa, em vez de apenas atualizar e seguir.

Objetivo:
- só um processo pode acionar a Delma por vez
- webhook repetido ou cron paralelo não conseguem reacionar a mesma conversa simultaneamente

#### 4) Adicionar dedupe de saída no `robot-chat`
No `supabase/functions/robot-chat/index.ts` vou colocar uma proteção final antes de salvar/enviar a resposta:

- buscar a última mensagem do robô na conversa
- se a mensagem nova for igual (ou praticamente igual) e muito recente, abortar o envio
- limpar o lock e registrar log de “duplicate_outbound_skipped”

Isso vira a última barreira caso algum gatilho externo ainda passe.

### Arquivos que entram na correção
- `supabase/functions/webhook-machine/index.ts`
- `supabase/functions/robot-chat/index.ts`
- `supabase/functions/sync-robot-schedules/index.ts`

### Resultado esperado
Depois da correção:
- evento repetido do Machine não gera nova resposta da Delma
- update de nome/metadata não vira mensagem do cliente
- cron e webhook não disputam a mesma conversa
- mesmo se houver dois gatilhos, o `robot-chat` não envia a mesma resposta duas vezes

### Validação que vou fazer na implementação
1. Confirmar que o build voltou a passar.
2. Simular webhook repetido com o mesmo conteúdo.
3. Simular payload de nome/metadado.
4. Confirmar que só uma resposta da Delma é salva/enviada.
5. Validar uma conversa normal para garantir que a Delma continua respondendo normalmente quando a mensagem é legítima.

### Detalhe técnico importante
A evidência mais forte do bug atual é o próprio log do `webhook-machine` recebendo:
```text
mensagem: "João Vitor Israel"
```
Isso indica que a função está tratando evento administrativo/metadata como se fosse fala do cliente. Esse é o ponto mais provável da duplicação mostrada.
