

## Plano: Erros & Gaps separados por Estabelecimento/Motoboy + Grafico de Motivos

### O que muda

A aba "Erros & Gaps" sera reestruturada com:

1. **Separacao por tipo de contato** — Duas secoes (ou filtro de tabs internas): "Estabelecimento" e "Motoboy", filtrando os errorLogs pela presenca dessas tags no array `tags` do log. Conversas sem nenhuma dessas tags ficam em uma terceira secao "Outros".

2. **Grafico dos principais motivos** — Um grafico de barras horizontais (usando recharts, ja disponivel no projeto via `chart.tsx`) mostrando a contagem das tags de taxonomia (Acidente - Urgente, Operacional - Pendente, Financeiro - Normal, Duvida - Geral, Comercial - B2B) dentro das conversas problematicas, separado por Estabelecimento vs Motoboy.

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Enriquecer `errorLogs` para incluir `contact_notes` no retorno, e adicionar campo `errorsByType` com contagens de motivos agrupadas por Estabelecimento/Motoboy |
| `src/pages/admin/AdminBrain.tsx` | Redesenhar aba "Erros & Gaps": tabs internas Estabelecimento/Motoboy/Todos, grafico de motivos com recharts |

### Detalhes tecnicos

**Edge function — novos campos no metrics:**
```typescript
// Classificar cada errorLog como Estabelecimento, Motoboy ou Outro
// baseado na presenca da tag "Estabelecimento" ou "Motoboy" no array tags[]

errorsByType: {
  estabelecimento: { total: number, motivos: Record<string, number>, logs: ErrorLog[] },
  motoboy: { total: number, motivos: Record<string, number>, logs: ErrorLog[] },
  outros: { total: number, motivos: Record<string, number>, logs: ErrorLog[] },
}
```

Os "motivos" sao extraidos das tags de taxonomia (Acidente, Operacional, Financeiro, Duvida, Comercial) presentes em cada errorLog.

**Frontend — aba Erros & Gaps redesenhada:**
- Sub-tabs: "Todos" | "Estabelecimento" | "Motoboy"
- Card com grafico de barras horizontais (BarChart do recharts) mostrando motivos por tipo
- Lista de conversas problematicas filtrada pela sub-tab ativa
- Cores consistentes com `tagColors.ts` (amber para Estabelecimento, green para Motoboy)

