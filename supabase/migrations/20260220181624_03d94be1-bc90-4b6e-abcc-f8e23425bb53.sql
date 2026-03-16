-- Função para normalizar número de telefone (remove DDI, código de país, etc.)
-- Retorna array de variações possíveis para busca
CREATE OR REPLACE FUNCTION public.normalize_phone_variants(phone_input text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  variants text[];
BEGIN
  -- Limpar: remover tudo que não é dígito
  cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');
  
  IF length(cleaned) = 0 THEN
    RETURN ARRAY[]::text[];
  END IF;
  
  -- Sempre incluir o número limpo original
  variants := ARRAY[cleaned];
  
  -- Se começa com 55 (Brasil) e tem 12-13 dígitos → remover DDI
  IF cleaned ~ '^55' AND length(cleaned) BETWEEN 12 AND 13 THEN
    variants := variants || ARRAY[substring(cleaned FROM 3)];
  END IF;
  
  -- Se tem 10-11 dígitos (sem DDI) → adicionar com DDI 55
  IF length(cleaned) BETWEEN 10 AND 11 THEN
    variants := variants || ARRAY['55' || cleaned];
  END IF;
  
  -- Variante com 9 dígito: 11 dígitos → versão 10 dígitos (sem o 9)
  -- Ex: 88999999999 → 8899999999
  IF length(cleaned) = 11 AND substring(cleaned FROM 3 FOR 1) = '9' THEN
    variants := variants || ARRAY[substring(cleaned FROM 1 FOR 2) || substring(cleaned FROM 4)];
  END IF;
  
  -- Variante sem 9 dígito: 10 dígitos → versão 11 dígitos (adiciona 9)
  -- Ex: 8899999999 → 88999999999
  IF length(cleaned) = 10 THEN
    variants := variants || ARRAY[substring(cleaned FROM 1 FOR 2) || '9' || substring(cleaned FROM 3)];
  END IF;
  
  -- Se tem DDI 55 + 11 dígitos (13 total) → variante sem DDI + sem 9
  IF cleaned ~ '^55' AND length(cleaned) = 13 AND substring(cleaned FROM 5 FOR 1) = '9' THEN
    variants := variants || ARRAY[substring(cleaned FROM 3 FOR 2) || substring(cleaned FROM 6)];
  END IF;
  
  -- Se tem DDI 55 + 10 dígitos (12 total) → variante sem DDI + com 9
  IF cleaned ~ '^55' AND length(cleaned) = 12 THEN
    variants := variants || ARRAY[substring(cleaned FROM 3 FOR 2) || '9' || substring(cleaned FROM 5)];
  END IF;

  RETURN variants;
END;
$$;

-- Função para buscar contato pelo telefone usando variantes normalizadas
CREATE OR REPLACE FUNCTION public.find_contact_by_phone(phone_input text)
RETURNS TABLE(id uuid, name text, name_edited boolean, phone text, notes text, channel text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.name_edited, c.phone, c.notes, c.channel
  FROM contacts c
  WHERE c.phone = ANY(normalize_phone_variants(phone_input))
  LIMIT 1;
$$;