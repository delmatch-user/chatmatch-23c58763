/**
 * Extrai o JID completo das notes do contato.
 * O JID pode ser um número@s.whatsapp.net ou um LID@lid
 * 
 * @param notes - O campo notes do contato
 * @returns O JID completo ou null se não encontrar
 */
export function extractJid(notes?: string): string | null {
  if (!notes) return null;
  
  // Extrai jid:XXXXX@s.whatsapp.net ou jid:XXXXX@lid
  const jidMatch = notes.match(/jid:([^@\s]+@(?:s\.whatsapp\.net|lid))/);
  return jidMatch ? jidMatch[1] : null;
}

/**
 * Extrai o número de telefone real de um contato.
 * Prioriza o telefone do contato se for um número válido (começa com dígitos e tem 10-15 dígitos).
 * Se o phone parecer ser um ID (como LID do WhatsApp), tenta extrair o número real das notes.
 * 
 * @param phone - O campo phone do contato
 * @param notes - O campo notes do contato (pode conter jid:NUMERO@s.whatsapp.net)
 * @returns O número de telefone real ou o phone original se não encontrar alternativa
 */
export function extractRealPhone(phone?: string, notes?: string): string | undefined {
  // Instagram: phone é "ig:SENDER_ID" — retornar como está (sendViaInstagram trata)
  if (phone && phone.startsWith('ig:')) {
    return phone;
  }

  // REGRA: Phone real do contato tem prioridade absoluta sobre JID
  if (phone) {
    const cleanedPhone = phone.replace(/\D/g, '');
    // Validar que é um telefone real (10-13 dígitos, não é LID)
    const looksLikePhone = cleanedPhone.length >= 10 && cleanedPhone.length <= 13 && 
      (cleanedPhone.startsWith('55') || cleanedPhone.length <= 11);
    
    if (looksLikePhone) {
      return phone;
    }
  }

  // Fallback: extrair número das notes (jid:NUMERO@s.whatsapp.net) - NÃO extrai LIDs
  if (notes) {
    const jidMatch = notes.match(/jid:(\d+)@s\.whatsapp\.net/);
    if (jidMatch && jidMatch[1]) {
      return jidMatch[1];
    }
  }

  // Último fallback: retorna phone original se existir E for um número válido
  // NÃO retornar pseudo-phones (LIDs >13 dígitos) como telefone real
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 13) {
      return phone;
    }
    // >13 dígitos = LID, não retornar como telefone
    return undefined;
  }
  return undefined;
}

/**
 * Formata um número de telefone para exibição amigável.
 * 
 * @param phone - O número de telefone
 * @returns Número formatado ou original se não puder formatar
 */
/**
 * Retorna o nome de exibição do contato.
 * Se o nome for "Desconhecido" ou vazio, retorna o telefone formatado.
 */
export function getContactDisplayName(name?: string, phone?: string, notes?: string): string {
  const isInstagramContact = !!phone && phone.startsWith('ig:');
  const isPlaceholder =
    !name ||
    name === 'Desconhecido' ||
    /^Instagram \d+$/.test(name) ||
    name.startsWith('ig:');

  if (isPlaceholder) {
    if (isInstagramContact) {
      const username = extractInstagramUsername(notes);
      if (username) return `@${username}`;

      if (name && /^Instagram \d+$/.test(name)) return name;

      const igId = phone?.slice(3);
      return igId ? `Instagram ${igId.slice(-6)}` : 'Instagram';
    }

    const realPhone = extractRealPhone(phone, notes);
    const formatted = formatPhoneForDisplay(realPhone);
    return formatted || name || 'Desconhecido';
  }

  return name;
}

/**
 * Retorna o handle de exibição do Instagram (@username) ou null.
 * Útil para subtítulos e linhas secundárias.
 */
export function getInstagramDisplayHandle(phone?: string, notes?: string): string | null {
  if (!phone || !phone.startsWith('ig:')) return null;
  const username = extractInstagramUsername(notes);
  if (username) return `@${username}`;
  return null;
}

/**
 * Extrai a cidade do campo notes (formato franqueado:CIDADE ou franqueado:CIDADE|...)
 */
export function extractCidade(notes?: string): string | null {
  if (!notes) return null;
  const match = notes.match(/franqueado:(.+?)(?:\||$)/);
  return match ? match[1].trim() : null;
}

/**
 * Extrai o ID do Instagram do campo phone (formato ig:USERNAME)
 */
export function extractInstagramId(phone?: string): string | null {
  if (!phone) return null;
  if (phone.startsWith('ig:')) {
    return phone.slice(3);
  }
  return null;
}

/**
 * Extrai o @username do Instagram do campo notes (formato ig_username:HANDLE)
 */
export function extractInstagramUsername(notes?: string): string | null {
  if (!notes) return null;
  const match = notes.match(/ig_username:([^\s|]+)/);
  return match ? match[1] : null;
}

/**
 * Gera variantes de um número brasileiro para comparação.
 * Ex: 5588996476068 → ['5588996476068', '88996476068', '8896476068', '5588996476068']
 */
export function phoneBrVariants(digits: string): string[] {
  if (!digits || digits.length < 10) return digits ? [digits] : [];
  const variants = new Set<string>();
  variants.add(digits);

  // Remove country code 55
  const without55 = digits.startsWith('55') ? digits.slice(2) : null;
  if (without55) variants.add(without55);

  // Add country code 55
  if (!digits.startsWith('55')) variants.add('55' + digits);

  // Handle 9th digit (mobile): 11 digits local → remove 9th digit (position 2) → 10 digits
  const local = without55 || digits;
  if (local.length === 11 && local[2] === '9') {
    const without9 = local.slice(0, 2) + local.slice(3);
    variants.add(without9);
    variants.add('55' + without9);
  }
  // Add 9th digit: 10 digits local → insert 9 at position 2 → 11 digits
  if (local.length === 10) {
    const with9 = local.slice(0, 2) + '9' + local.slice(2);
    variants.add(with9);
    variants.add('55' + with9);
  }

  return Array.from(variants);
}

/**
 * Compara dois números de telefone considerando variantes brasileiras.
 * Retorna true se representam o mesmo número.
 */
export function phoneMatchesBr(phoneA: string | undefined | null, phoneB: string | undefined | null): boolean {
  const digitsA = (phoneA || '').replace(/\D/g, '');
  const digitsB = (phoneB || '').replace(/\D/g, '');
  if (digitsA.length < 10 || digitsB.length < 10) return false;
  
  const variantsA = phoneBrVariants(digitsA);
  return variantsA.some(v => {
    const variantsB = phoneBrVariants(digitsB);
    return variantsB.includes(v);
  });
}

export function formatPhoneForDisplay(phone?: string): string {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  // Formato: 55 88 99647 6068 → +55 (88) 99647-6068
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  
  // Formato: 5588996476068 (12 dígitos) → +55 (88) 9964-76068
  if (cleaned.length === 12 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  
  // Formato: 88996476068 (11 dígitos com 9) → (88) 99647-6068
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  
  // Formato: 8896476068 (10 dígitos sem 9) → (88) 9647-6068
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
}
