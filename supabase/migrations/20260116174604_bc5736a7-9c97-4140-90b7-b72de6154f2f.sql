-- Criar bucket para mídias de chat (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-uploads',
  'chat-uploads',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800;

-- Política de leitura pública
DROP POLICY IF EXISTS "Public read access for chat-uploads" ON storage.objects;
CREATE POLICY "Public read access for chat-uploads" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-uploads');

-- Política de insert para service role (usado pelo Baileys)
DROP POLICY IF EXISTS "Service role can upload to chat-uploads" ON storage.objects;
CREATE POLICY "Service role can upload to chat-uploads" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'chat-uploads');