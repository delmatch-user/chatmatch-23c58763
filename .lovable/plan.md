
Objetivo: fazer o Arthur sempre enviar resposta ao cliente (principalmente simulação por cidade) após transferência com motivo, sem ficar “silencioso”.

1) Diagnóstico confirmado
- O problema atual não é mais o motivo da transferência em si.
- Nos logs do `sdr-robot-chat` a sequência está clara:
  - IA chama `edit_contact` com cidade (ex: Praia Grande).
  - Não retorna texto no `content`.
  - O follow-up entra em 429 repetido.
  - Resultado final: `No text to send (transfer/advance only), skipping message send`.
- Ou seja: a cidade é capturada, mas a mensagem para o cliente não é enviada.

2) Correção principal (garantir texto já no tool call)
- Ajustar a tool `edit_contact` para exigir `message_to_client` (texto de resposta ao cliente).
- No processamento de `edit_contact`, usar `args.message_to_client` como `responseText` quando existir.
- Isso remove dependência do follow-up em casos de “atualizei contato + preciso responder”.

3) Correção de robustez do follow-up (quando ainda for necessário)
- Reutilizar o mesmo contexto completo do primeiro prompt no follow-up:
  - `systemPrompt`
  - contexto de transferência
  - histórico
- Hoje o follow-up não leva o contexto de transferência; isso será corrigido.
- Implementar fallback real no follow-up (igual ao call principal), incluindo gateway alternativo, para evitar silêncio em 429.

4) Evitar timeout/silêncio em cascata
- Reduzir estratégia de espera longa no follow-up (25/35/45s) para não estourar tempo de execução.
- Se, mesmo com fallback, ainda não houver texto em tool calls não-transferência, enviar mensagem de segurança ao cliente (não ficar mudo), mantendo continuidade comercial.

5) Observabilidade e validação
- Logs explícitos de:
  - origem do texto final (tool args vs follow-up),
  - fallback acionado,
  - motivo de contingência.
- Garantir que não apareça mais `No text to send` para casos com `edit_contact`.

Detalhes técnicos (implementação)
- Arquivo: `supabase/functions/sdr-robot-chat/index.ts`
  - Tool schema `edit_contact`: adicionar `message_to_client` obrigatório.
  - Handler `edit_contact`: além de atualizar contato, definir `responseText` com `message_to_client`.
  - Extrair `baseMessages` único (com contexto de transferência) e reutilizar no primeiro call e follow-up.
  - Unificar rotina de chamada de IA com retry/fallback para não duplicar lógica.
  - Ajustar política de retry para não ultrapassar janela de execução.
  - Adicionar fallback textual final para evitar silêncio.

Critérios de aceite (E2E)
- Cenário: transferir para Arthur com motivo “envie simulação de Praia Grande”.
- Resultado esperado:
  1) Arthur envia mensagem ao cliente (não apenas atualiza contato).
  2) Mensagem é salva em `messages` com sender do robô.
  3) Entrega no canal ocorre (baileys/meta/machine conforme conversa).
  4) Logs não mostram `No text to send` nesse fluxo.
