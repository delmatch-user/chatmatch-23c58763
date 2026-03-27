

# Corrigir mensagem de contato já em atendimento

## Problema
O código já tem a lógica para detectar unique constraint e mostrar o nome do atendente (linhas 408-452), mas a condição do `if` não está capturando o erro corretamente. O toast genérico da linha 455 é exibido em vez do tratamento amigável.

## Causa raiz
A comparação `error?.code === '23505'` pode falhar porque o Supabase JS client pode retornar o código em formato diferente ou dentro de um wrapper. A condição precisa ser mais robusta.

## Correção

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `src/components/chat/ConversationList.tsx` | Tornar a detecção do erro de unique constraint mais robusta e mover a lógica de lookup para ser o fallback padrão em qualquer erro de insert |

### Detalhes da mudança (ConversationList.tsx, linhas 404-455)

- Converter `error` para string com `JSON.stringify` + `String(error?.message)` + `String(error?.code)` para capturar qualquer formato
- Verificar se qualquer parte do erro contém `23505`, `unique`, `duplicate`, ou `active_contact`
- Se qualquer desses padrões for detectado, entrar no bloco de lookup que busca quem está com a conversa
- No bloco de lookup, usar o `contactId` já disponível (da variável local) em vez de refazer `find_contact_by_phone` — mais rápido e confiável
- Manter o fallback genérico apenas para erros completamente diferentes (rede, auth, etc)

