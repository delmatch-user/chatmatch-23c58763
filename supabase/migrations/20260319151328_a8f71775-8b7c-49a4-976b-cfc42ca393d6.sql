CREATE OR REPLACE FUNCTION public.normalize_phone_variants(phone_input text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  cleaned text;
  stripped text;
  variants text[];
BEGIN
  cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');
  
  IF length(cleaned) = 0 THEN
    RETURN ARRAY[]::text[];
  END IF;
  
  variants := ARRAY[cleaned];
  
  stripped := regexp_replace(cleaned, '^0+', '');
  IF stripped <> cleaned AND length(stripped) > 0 THEN
    variants := variants || ARRAY[stripped];
    variants := variants || ARRAY['0' || stripped];
  END IF;
  
  IF stripped IS NULL OR length(stripped) = 0 THEN
    stripped := cleaned;
  END IF;
  
  IF stripped ~ '^55' AND length(stripped) BETWEEN 12 AND 13 THEN
    variants := variants || ARRAY[substring(stripped FROM 3)];
    variants := variants || ARRAY['0' || substring(stripped FROM 3)];
  END IF;
  
  IF length(stripped) BETWEEN 10 AND 11 THEN
    variants := variants || ARRAY['55' || stripped];
  END IF;
  
  IF length(stripped) = 11 AND substring(stripped FROM 3 FOR 1) = '9' THEN
    variants := variants || ARRAY[substring(stripped FROM 1 FOR 2) || substring(stripped FROM 4)];
  END IF;
  
  IF length(stripped) = 10 THEN
    variants := variants || ARRAY[substring(stripped FROM 1 FOR 2) || '9' || substring(stripped FROM 3)];
  END IF;
  
  IF stripped ~ '^55' AND length(stripped) = 13 AND substring(stripped FROM 5 FOR 1) = '9' THEN
    variants := variants || ARRAY[substring(stripped FROM 3 FOR 2) || substring(stripped FROM 6)];
  END IF;
  
  IF stripped ~ '^55' AND length(stripped) = 12 THEN
    variants := variants || ARRAY[substring(stripped FROM 3 FOR 2) || '9' || substring(stripped FROM 5)];
  END IF;

  SELECT array_agg(DISTINCT v) INTO variants FROM unnest(variants) AS v;

  RETURN variants;
END;
$function$;