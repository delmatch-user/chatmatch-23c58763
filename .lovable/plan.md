

# Visualizador de Memorias da Delma — Drawer Lateral

## Resumo
Criar um novo componente `DelmaMemoryDrawer.tsx` que abre como drawer lateral ao clicar no card "Memorias Ativas" na aba Evolucao. O card existente recebe apenas `onClick` e `cursor-pointer` — nenhuma outra alteracao no `DelmaEvolutionTab.tsx`.

## Arquivos

### 1. Novo: `src/components/admin/DelmaMemoryDrawer.tsx`
Componente completo com:

**Props:** `open: boolean`, `onOpenChange: (open: boolean) => void`, `memories: any[]`, `onMemoriesUpdate: () => void`

**Estrutura do drawer (Sheet side="right", ~600px):**

- **Cabecalho:** "O que a Delma sabe" + subtitulo dinamico com contagem e timestamp da memoria mais recente
- **3 mini-cards horizontais:** Total | Sinais de Dados | Feedbacks do Gestor
- **Busca + Filtros:**
  - Input de busca (filtra client-side no `content` stringificado)
  - Select tipo: Todas | data_signal | manager_feedback
  - Select area: Todas | Treinamento | Metas | Relatorios | Erros (derivado de `source`)
  - Select peso: Todas | Alta (>=0.8) | Media (0.4-0.79) | Baixa (<0.4)
  - Select ordenacao: Recentes | Maior peso | Menor peso | Proximas a expirar
- **Lista paginada (20 por vez):** cards expansiveis via Collapsible
  - Colapsado: icone tipo, titulo (de `source` ou `content`), badge area, barra peso colorida, data criacao, "Expira em X dias"
  - Expandido: `content` JSON formatado legivel (chaves traduzidas pt-BR), detalhes por tipo, botao "Esquecer" com AlertDialog confirmacao → `update expires_at = now()`
- **Secao "O que a Delma aprendeu a nao fazer":** memorias peso <= 0.1, botao "Reabilitar" → `update weight = 0.5`
- **Secao "Memorias proximas de expirar":** expires_at < 7 dias, badge laranja, botao "Renovar" → `update expires_at += 90 dias`
- **Estado vazio:** icone Brain + texto orientativo
- **Botao "Carregar mais"** para paginacao

### 2. Editar: `src/components/admin/DelmaEvolutionTab.tsx`
Mudancas minimas e aditivas:
- Importar `DelmaMemoryDrawer` e `useState` para `memoryDrawerOpen`
- Adicionar `onClick` e `cursor-pointer` ao card de Memorias Ativas (linhas 177-190)
- Renderizar `<DelmaMemoryDrawer>` no final do JSX, passando `memories`, `open`, `onOpenChange`, `onMemoriesUpdate={loadData}`

### Detalhes tecnicos
- Usa `Sheet` (side="right") do shadcn para o drawer lateral com overlay escuro
- Paginacao client-side: slice dos dados ja carregados, botao "Carregar mais" incrementa o limite em 20
- Soft delete = `supabase.from('delma_memory').update({ expires_at: new Date().toISOString() }).eq('id', memoryId)`
- Renovar = `update({ expires_at: new Date(Date.now() + 90*24*60*60*1000).toISOString() })`
- Reabilitar = `update({ weight: 0.5 })`
- JSON content rendering: funcao helper que percorre o objeto traduzindo chaves comuns (ex: `total_conversations` → `Total de Conversas`)

