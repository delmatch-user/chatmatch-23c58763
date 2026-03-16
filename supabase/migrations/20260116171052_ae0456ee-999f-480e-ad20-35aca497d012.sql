-- Criar tabela de categorias personalizadas para mensagens rápidas
CREATE TABLE public.quick_message_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(name, user_id)
);

-- Habilitar RLS
ALTER TABLE public.quick_message_categories ENABLE ROW LEVEL SECURITY;

-- Políticas: cada usuário só vê suas categorias
CREATE POLICY "Users can view their own categories"
ON public.quick_message_categories FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own categories"
ON public.quick_message_categories FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own categories"
ON public.quick_message_categories FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own categories"
ON public.quick_message_categories FOR DELETE
USING (user_id = auth.uid());

-- Adicionar coluna department_id na tabela quick_messages
ALTER TABLE public.quick_messages 
ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;