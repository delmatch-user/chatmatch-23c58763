

# Corrigir Delma Chat: Re-deploy com prompt JSON

## Problema
Os logs mostram erro 400 repetido:
```
'messages' must contain the word 'json' in some form, to use 'response_format' of type 'json_object'.
```

O código fonte na linha 33 já contém "Responda SEMPRE em formato JSON", mas a versão deployada no backend ainda é antiga e não tem essa instrução.

## Solução
Simplesmente re-deployar a Edge Function `delma-chat-command` para que a versão atual (que já tem "json" no prompt) entre em vigor.

Nenhuma alteração de código necessária — apenas deploy.

