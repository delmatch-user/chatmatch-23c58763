-- Remover política restritiva atual que bloqueia atendentes
DROP POLICY IF EXISTS "WA connections viewable by admins only" ON whatsapp_connections;

-- Recriar política para permitir leitura por todos autenticados
-- (dados de conexão são necessários para envio de mensagens por qualquer atendente)
CREATE POLICY "WA connections viewable by authenticated users"
ON whatsapp_connections
FOR SELECT
TO authenticated
USING (true);