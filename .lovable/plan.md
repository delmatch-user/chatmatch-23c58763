

## Testes de API do Instagram para App Review da Meta

A Meta exige chamadas reais de API para cada permissão durante o processo de revisão. Vou criar uma edge function temporária que executa as chamadas necessárias para cada permissão pendente.

### Permissões a testar (8 pendentes)

| Permissão | Endpoint de teste |
|---|---|
| `instagram_business_manage_messages` | `POST /{ig-id}/messages` (echo para si mesmo ou read conversations) |
| `instagram_business_basic` | `GET /{ig-id}?fields=id,name,username` |
| `public_profile` | `GET /me?fields=id,name` |
| `instagram_manage_comments` | `GET /{ig-id}/media` → `GET /{media-id}/comments` |
| `instagram_manage_messages` | `GET /{page-id}/conversations?platform=instagram` |
| `instagram_content_publish` | `POST /{ig-id}/media` (container creation, sem publicar de fato) |
| `instagram_basic` | `GET /{ig-id}?fields=id,ig_id,username,media_count` |
| `business_management` | `GET /me/businesses` |

### Implementação

1. **Criar edge function `ig-permission-test`** que recebe o nome da permissão e executa a chamada Graph API correspondente usando o token já salvo no banco
2. **Executar cada teste** via `curl_edge_functions`, registrando sucesso/falha
3. **Remover a edge function** após os testes (é temporária)

### Arquivo a criar
- `supabase/functions/ig-permission-test/index.ts` — edge function temporária com switch/case para cada permissão

### Dados disponíveis
- **IG Account ID:** `17841447900741268`
- **Page ID:** `273187287820589`
- **Token:** salvo em `whatsapp_connections`

### Notas
- Nenhuma publicação real será feita (content_publish só cria container sem publicar)
- Após os testes, a function será deletada
- As chamadas serão feitas com `appsecret_proof` para consistência

