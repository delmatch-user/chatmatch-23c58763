

## Re-executar Testes de API do Instagram para Meta App Review

A screenshot mostra que as permissões ainda estão com 0 chamadas de API. Os testes anteriores provavelmente não foram registrados pela Meta (pode ter havido cache ou o token usado não estava associado ao app correto). Vamos recriar a edge function e executar todos os testes novamente.

### Permissões pendentes (8 com 0 chamadas + 2 com chamadas obrigatórias)

| Permissão | Endpoint | Método |
|---|---|---|
| `instagram_business_manage_messages` | `GET /{page-id}/conversations?platform=instagram` | GET |
| `instagram_business_basic` | `GET /{ig-id}?fields=id,name,username,followers_count` | GET |
| `public_profile` | `GET /me?fields=id,name` | GET |
| `instagram_manage_comments` | `GET /{ig-id}/media` → `GET /{media-id}/comments` | GET |
| `instagram_manage_messages` | `GET /{page-id}/conversations?platform=instagram` | GET |
| `instagram_content_publish` | `POST /{ig-id}/media` (container only) | POST |
| `instagram_basic` | `GET /{ig-id}?fields=id,ig_id,username,media_count` | GET |
| `business_management` | `GET /me/businesses` | GET |

### Implementação

1. **Criar `supabase/functions/ig-permission-test/index.ts`** — edge function temporária que:
   - Recebe `{ permission: "all" }` para testar tudo de uma vez
   - Usa token do banco (`EAAbX...`) com `appsecret_proof`
   - Deriva Page Access Token automaticamente para permissões de página
   - Retorna resultado detalhado de cada chamada

2. **Deploy e executar** — chamar a function com `permission: "all"`, IG Account ID `17841447900741268`, Page ID `273187287820589`

3. **Verificar resultados** — confirmar quais passaram/falharam

4. **Deletar a edge function** após os testes

### Dados
- **IG Account ID:** `17841447900741268`
- **Page ID:** `273187287820589`  
- **Token:** já salvo no banco (ativo)

### Arquivo
- `supabase/functions/ig-permission-test/index.ts` (temporário — será deletado após uso)

