
Objetivo: eliminar o erro `Invalid appsecret_proof` no envio Instagram e voltar a preencher nome real do contato.

1) Diagnóstico confirmado (baseado em logs + banco)
- O webhook de entrada funciona (recebe mensagens), mas isso não valida envio.
- O envio falha na função `instagram-send`.
- Há tentativa com dois “secrets”; um deles aparece com prefixo `EAAb` (formato de token, não App Secret), gerando tentativas inválidas.
- O token atual da conexão Instagram pode estar expirado/incorreto para o app que assina o `appsecret_proof`.

2) Correção de lógica (determinística) em `instagram-send`
- Ajustar seleção de token para priorizar **token salvo na conexão Instagram (banco)** e usar env apenas como fallback.
- Ajustar seleção de secret:
  - se `META_INSTAGRAM_APP_SECRET` existir, usar **somente ele**;
  - usar `META_WHATSAPP_APP_SECRET` apenas quando o secret de Instagram estiver ausente.
- Adicionar validação de formato de secret para ignorar valor com cara de token (`EA...`), evitando assinar com credencial errada.
- Melhorar política de retry:
  - tentar todos os tokens candidatos relevantes antes de encerrar;
  - preservar erro final mais útil (expirado/permissão/proof), sem mascarar por tentativa secundária.

3) Aplicar a mesma política em `ig-test`
- `fetchIGProfile`: reutilizar a mesma estratégia de token/secret para recuperar `name` e `profile_pic`.
- Resposta de robô no Instagram: alinhar com a mesma função de assinatura/retry para evitar divergência entre caminhos de envio.

4) Melhorias de observabilidade (sem vazar segredo)
- Logar apenas: fonte do token (`db`/`env`), status HTTP, code/subcode da Meta e tipo de falha (`proof`, `expired`, `permission`).
- Remover ambiguidade de logs atuais para identificar rapidamente se o problema é token, app secret ou escopo.

5) Validação fim a fim
- Teste 1: enviar mensagem no painel para conversa Instagram e confirmar:
  - mensagem entregue no Instagram;
  - `messages.external_id` preenchido no banco.
- Teste 2: nova mensagem recebida do usuário Instagram e confirmar:
  - contato deixa de ficar como `Instagram 123456` e passa a nome real.
- Teste 3: revisar logs das funções `instagram-send` e `ig-test` para confirmar ausência de `Invalid appsecret_proof`.

Detalhes técnicos (implementação)
- Arquivos-alvo:
  - `supabase/functions/instagram-send/index.ts`
  - `supabase/functions/ig-test/index.ts`
- Refactor principal:
  - criar helpers internos reutilizáveis de “candidatos de token/secret” + “callGraphWithProof”.
- Sem mudança de schema/RLS necessária nesta correção.
