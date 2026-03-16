-- Remover política antiga que permite todos verem todas
DROP POLICY IF EXISTS "Quick messages viewable by authenticated users" ON public.quick_messages;

-- Criar nova política para usuário ver apenas suas próprias mensagens
CREATE POLICY "Users can view their own quick messages" 
ON public.quick_messages 
FOR SELECT 
USING (user_id = auth.uid());