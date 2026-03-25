

# Filtrar o Cérebro da Delma exclusivamente para o departamento Suporte

## Situação atual
O Cérebro da Delma busca **todas** as conversas de **todos** os departamentos. Os KPIs globais (total, TMA, TME, tags, erros, taxa de abandono) misturam dados de Suporte com outros departamentos. Apenas os dados de agentes já são filtrados para Suporte.

## O que muda
Filtrar **todos os dados** do Cérebro exclusivamente para o departamento Suporte (`department_name = 'Suporte'`), garantindo que a Delma aprenda apenas com conversas do seu departamento.

## Arquivo

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Adicionar filtro `department_name = 'Suporte'` na query `fetchAllLogs` (tanto período atual quanto anterior) |

## Mudanças técnicas

1. **Filtro na busca de dados (linhas 98-100)**: Adicionar `.eq("department_name", "Suporte")` nas queries de `fetchAllLogs`, ou filtrar os logs após a busca com `logs.filter(l => l.department_name?.toLowerCase() === 'suporte')`. Isso garante que TMA, TME, tags, erros, taxa de abandono e todos os KPIs reflitam exclusivamente o Suporte.

2. **Remover filtros redundantes (linhas 186, 235, 425)**: Como todos os dados já serão do Suporte, os filtros de `department_name === 'suporte'` nos agent stats e conversation details tornam-se desnecessários — simplificando o código.

Resultado: O Cérebro armazenará e analisará 100% das conversas do Suporte, sem poluição de outros departamentos.

