

## Corrigir robôs que não conseguem ver imagens

### Problema raiz
O código atual envia a URL da imagem diretamente ao modelo de IA via `image_url: { url: "https://..." }`. Existem dois cenários de falha:

1. **URLs `meta_media:xxx`**: Quando o upload da Meta falha, a URL armazenada é `meta_media:MEDIA_ID` — não é uma URL HTTP válida, e o modelo IA não consegue acessar.
2. **URLs de Storage externas**: Mesmo URLs válidas do Supabase Storage podem falhar porque os modelos Gemini/OpenAI precisam baixar a imagem externamente, o que pode falhar por timeout ou restrições.

### Solução
Converter todas as imagens para **base64 data URL** (`data:image/jpeg;base64,...`) antes de enviar ao modelo. Isso garante compatibilidade com todos os provedores (Gemini e OpenAI) sem depender do modelo conseguir acessar URLs externas.

### Mudanças

**Arquivo: `supabase/functions/robot-chat/index.ts`**

1. Criar helper `resolveImageToDataUrl(url: string): Promise<string | null>` que:
   - Se URL começa com `meta_media:` → chama `meta-media-proxy` internamente para obter o mediaId, baixa a imagem via Meta API, converte para base64
   - Se URL começa com `http` → faz fetch direto, converte o buffer para base64 data URL
   - Retorna `data:image/jpeg;base64,...` ou null em caso de falha

2. Em `buildMessageHistory`, ao processar imagem: chamar `resolveImageToDataUrl(imageUrl)` e usar o resultado como `image_url.url`

3. Se resolução falhar, inserir texto descritivo em vez de silenciosamente enviar URL inválida

**Arquivo: `supabase/functions/sdr-robot-chat/index.ts`**
- Mesmas alterações para paridade

### Impacto
- Robôs passarão a ver todas as imagens corretamente (Baileys e Meta API)
- Funciona com todos os modelos (Gemini, GPT-4o, fallback Lovable AI)
- Sem alteração no fluxo do usuário

