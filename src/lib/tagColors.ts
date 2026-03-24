export const PREDEFINED_TAGS = ['Cardápio Digital', 'Estabelecimento', 'Motoboy', 'Lead'] as const;

// Tags de taxonomia exclusivas do departamento Suporte
export const SUPORTE_TAXONOMY_TAGS = [
  'Acidente - Urgente',
  'Operacional - Normal',
  'Financeiro - Normal',
  'Duvida - Geral',
  'Comercial - B2B',
] as const;

// Mapa de normalização: formato legado → formato novo
const TAG_NORMALIZATION: Record<string, string> = {
  'ACIDENTE_URGENTE': 'Acidente - Urgente',
  'FINANCEIRO_NORMAL': 'Financeiro - Normal',
  'DUVIDA_GERAL': 'Duvida - Geral',
  'COMERCIAL_B2B': 'Comercial - B2B',
  'OPERACIONAL_PENDENTE': 'Operacional - Normal',
};

/**
 * Normaliza qualquer formato de tag (legado com emoji, UPPER_CASE, etc.)
 * para o formato novo padronizado.
 */
export function normalizeTag(tag: string): string {
  const clean = tag.replace(/^[🔴🟡🟢🔵⚪◆◇●○■□▪▫✦✧⬥⬦♦️◈]\s*/, '').trim();
  return TAG_NORMALIZATION[clean] || clean;
}

const TAG_COLOR_MAP: Record<string, string> = {
  'Cardápio Digital': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Estabelecimento': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Motoboy': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Lead': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Acidente - Urgente': 'bg-red-600/20 text-red-400 border-red-600/30',
  'Operacional - Normal': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Financeiro - Normal': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Duvida - Geral': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Comercial - B2B': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  // Tags legadas simples
  'urgente': 'bg-red-500/20 text-red-400 border-red-500/30',
  'novo': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'retorno': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const TAG_DOT_COLOR_MAP: Record<string, string> = {
  'Cardápio Digital': 'bg-blue-400',
  'Estabelecimento': 'bg-amber-400',
  'Motoboy': 'bg-green-400',
  'Lead': 'bg-purple-400',
  'Acidente - Urgente': 'bg-red-500',
  'Operacional - Normal': 'bg-orange-400',
  'Financeiro - Normal': 'bg-blue-400',
  'Duvida - Geral': 'bg-emerald-400',
  'Comercial - B2B': 'bg-yellow-400',
};

export function getTagColorClasses(tag: string): string {
  const normalized = normalizeTag(tag);
  return TAG_COLOR_MAP[normalized] || 'bg-secondary text-foreground border-border';
}

export function getTagDotColor(tag: string): string {
  const normalized = normalizeTag(tag);
  return TAG_DOT_COLOR_MAP[normalized] || 'bg-muted-foreground';
}
