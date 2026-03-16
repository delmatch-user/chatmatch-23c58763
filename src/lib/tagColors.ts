export const PREDEFINED_TAGS = ['Cardápio Digital', 'Estabelecimento', 'Motoboy', 'Lead'] as const;

const TAG_COLOR_MAP: Record<string, string> = {
  'Cardápio Digital': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Estabelecimento': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Motoboy': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Lead': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const TAG_DOT_COLOR_MAP: Record<string, string> = {
  'Cardápio Digital': 'bg-blue-400',
  'Estabelecimento': 'bg-amber-400',
  'Motoboy': 'bg-green-400',
  'Lead': 'bg-purple-400',
};

export function getTagColorClasses(tag: string): string {
  return TAG_COLOR_MAP[tag] || 'bg-secondary text-foreground border-border';
}

export function getTagDotColor(tag: string): string {
  return TAG_DOT_COLOR_MAP[tag] || 'bg-muted-foreground';
}
