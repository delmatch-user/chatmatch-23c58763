

## Fazer Delma ler a mensagem do cliente antes de perguntar

### Problema

O system prompt da Delma não tem uma instrução explícita de **triagem contextual**: ela deve ler o que o cliente já disse e, se o assunto já está claro, transferir diretamente para o especialista sem fazer perguntas desnecessárias. A diretriz atual foca apenas em responder com base na base de conhecimento, mas não orienta o robô a analisar a mensagem recebida para decidir se precisa ou não perguntar mais.

### Correção

**Arquivo: `supabase/functions/robot-chat/index.ts`** — função `buildSystemPrompt`, após as diretrizes de comportamento (linha ~332).

Adicionar uma diretriz de triagem contextual quando o robô tem `transfer_to_robot` disponível (ou seja, é um robô de triagem):

```
## Regras de Triagem
- **LEIA ATENTAMENTE** todas as mensagens do cliente antes de responder.
- Se o cliente já descreveu seu assunto ou problema na mensagem, NÃO pergunte novamente o que ele precisa. Use a informação já fornecida para classificar e transferir imediatamente para o agente especialista adequado.
- Pergunte "como posso ajudar?" ou "qual o assunto?" SOMENTE se o cliente enviou apenas uma saudação genérica (ex: "oi", "olá", "bom dia") sem mencionar nenhum assunto.
- Ao transferir, inclua no campo "reason" tudo que o cliente já informou, para que o especialista não repita perguntas.
```

Esta diretriz será injetada apenas quando `availableRobots.length > 0` (robô de triagem com especialistas disponíveis), não afetando robôs que não fazem triagem.

### Impacto
- Cliente manda "oi" → Delma pergunta o assunto (comportamento atual mantido)
- Cliente manda "preciso de ajuda com minha franquia em Goiânia" → Delma lê, classifica e transfere direto para o especialista sem perguntar de novo
- Nenhuma mudança estrutural, apenas adição de diretriz no prompt

