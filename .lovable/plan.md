

## Fazer robôs entenderem áudios e imagens

### Problema atual
As mensagens de mídia (áudio/imagem) são armazenadas no banco como JSON: `[{"name":"audio.ogg","url":"https://...","type":"audio/ogg"}]`. O robot-chat tenta verificar `msg.content.startsWith('http')` que falha para JSON, resultando em:
- **Imagens**: robô não consegue ver (cai no fallback `[Mídia recebida: image]`)
- **Áudios**: robô recebe o JSON bruto como "transcrição", que é inútil

### Correções

**1. Extrair URLs de conteúdo JSON em ambos os backends**

Em `robot-chat/index.ts` e `sdr-robot-chat/index.ts`, criar uma função helper `extractMediaUrl(content, expectedType)` que:
- Tenta `JSON.parse(content)` e extrai `url` do primeiro item que bate com o tipo
- Se o conteúdo já começa com `http`, retorna direto
- Caso contrário retorna `null`

**2. Auto-transcrever áudios no robot-chat**

Quando o robô encontra uma mensagem de áudio com URL (não texto transcrito):
- Chamar a edge function `transcribe-audio` internamente (via `fetch` direto ao Supabase URL)
- Usar a transcrição retornada no histórico
- Fallback: `[Áudio recebido - não foi possível transcrever]`

**3. Parsear JSON para imagens**

Quando `message_type === 'image'`, usar `extractMediaUrl` para extrair a URL da imagem do JSON, e passá-la como `image_url` para a API de vision.

### Arquivos modificados
- `supabase/functions/robot-chat/index.ts` — helper + parse JSON para imagens e áudios + auto-transcrição
- `supabase/functions/sdr-robot-chat/index.ts` — mesmas correções

