

## Diagnóstico Confirmado

Analisei os logs detalhadamente. O problema é claro:

**O `META_INSTAGRAM_APP_SECRET` configurado nao pertence ao mesmo App que gerou o Access Token.**

Evidencia dos logs:
- Token: `EAAbXzLt...` (DB)
- Secret: prefixo `4865` (configurado)
- Meta retorna code 100 (`Invalid appsecret_proof`) em TODAS as tentativas - tanto envio quanto perfil
- O webhook de **recebimento** funciona normalmente (nao precisa de appsecret_proof)

O `appsecret_proof` e um HMAC do token usando o App Secret. Se o secret e de um App diferente do que gerou o token, o hash nunca vai bater.

## Solucao

Como o "Require App Secret" pode nao estar habilitado no App da Meta (muitos apps nao habilitam), a solucao mais robusta e: **tentar com proof e, se falhar com code 100, tentar sem proof**.

### Alteracoes

**1. `supabase/functions/instagram-send/index.ts`**
- Na funcao `callGraphAPI`: quando o erro for `appsecret_proof` (code 100), fazer retry da mesma request SEM o parametro `appsecret_proof`
- Se funcionar sem proof, logar aviso de que o App Secret esta incorreto para orientar correcao futura

**2. `supabase/functions/ig-test/index.ts`**
- `fetchIGProfile`: mesma logica - tentar com proof, fallback sem proof
- `sendInstagramMessage`: mesma logica de fallback

### Logica do fallback (pseudocodigo)
```
1. Tentar com appsecret_proof
2. Se erro code=100 (Invalid proof):
   a. Tentar SEM appsecret_proof
   b. Se funcionar: logar warning "App Secret incorreto, funcionando sem proof"
   c. Se falhar com "require appsecret_proof": logar erro pedindo correcao do secret
```

### Beneficio
- Resolve o envio imediatamente sem precisar que o usuario descubra qual App Secret correto
- Continua tentando com proof primeiro (mais seguro)
- Logs claros para correcao futura do secret

