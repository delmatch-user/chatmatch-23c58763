

# Tornar o sistema completamente responsivo para mobile

## Problemas identificados

1. **Sem navegacao inferior mobile** -- O app usa sidebar com Sheet drawer no mobile, mas nao tem bottom navigation bar para acesso rapido (Fila, Conversas, Interno, Historico). O usuario precisa abrir o menu hamburger toda vez.

2. **Topbar sobrecarregada** -- A barra de busca, popovers de departamento e informacoes de usuario ocupam espaco desnecessario no mobile. O titulo longo e cortado.

3. **Admin pages sem adaptacao mobile** -- Paginas como AdminRobos, AdminDashboard, AdminUsers usam `p-6` fixo e grids que nao se adaptam bem a 390px. Dialogs de configuracao de robos nao sao responsivos.

4. **Tabelas em tela pequena** -- AdminUsers, AdminConversationLogs, SDRContactsPage usam tabelas que transbordam no mobile.

5. **Dialogs e modais** -- Muitos dialogs usam largura fixa que pode ultrapassar a tela.

6. **Paginas de chat** -- ConversationList e ChatPanel ja tem logica mobile, mas ContactDetails so aparece em `xl:block` e nao e acessivel no mobile.

7. **Filtros empilhados** -- Em paginas como History e Queue os filtros ja usam `flex-wrap`, mas podem ser melhorados com layout de coluna no mobile.

---

## Plano de implementacao

### 1. Criar MobileBottomNav component
Criar `src/components/layout/MobileBottomNav.tsx` com barra fixa no rodape visivel apenas em telas `< md`. Itens: Fila (com badge), Conversas (com badge), Interno (com badge), Historico. Usar `safe-area-bottom` para iOS.

### 2. Atualizar MainLayout
- Integrar `MobileBottomNav` no layout
- Adicionar `pb-16 md:pb-0` no `<main>` para compensar a nav inferior
- Manter o Sheet drawer para itens secundarios (admin, configs, etc.)

### 3. Compactar Topbar no mobile
- Esconder barra de busca no mobile (ja esta `hidden md:block`)
- Reduzir o titulo para abreviacoes quando necessario
- Esconder popovers de departamento no mobile (ja esta `hidden md:flex`)
- Reduzir padding e gap em telas pequenas

### 4. Admin pages -- padding e grids
- Todas as paginas admin: trocar `p-6` por `p-3 sm:p-6`
- Grids de stats: trocar `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` com tamanhos menores
- AdminRobos config dialog: usar `max-h-[90vh]` e scroll interno

### 5. Tabelas para cards no mobile
- AdminUsers: ja tem layout mobile (cards), verificar se esta funcionando
- SDRContactsPage: converter tabela para cards no mobile
- AdminConversationLogs: ja usa cards

### 6. ContactDetails como Drawer no mobile
- Em `Conversations.tsx`, trocar o painel fixo de ContactDetails por um `Sheet` (bottom ou right) no mobile quando o usuario tocar no cabecalho do chat

### 7. Dialogs responsivos
- Garantir que todos os `DialogContent` tenham `max-w-[95vw]` no mobile e `max-h-[90vh]` com scroll

### 8. CSS global ajustes
- Adicionar regra para inputs terem `font-size: 16px` no mobile (evitar zoom no iOS)

---

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/layout/MobileBottomNav.tsx` | **Criar** -- Barra de navegacao inferior mobile |
| `src/components/layout/MainLayout.tsx` | Integrar MobileBottomNav + padding inferior |
| `src/components/layout/Topbar.tsx` | Ajustes de padding/gap mobile |
| `src/pages/Conversations.tsx` | ContactDetails como Sheet no mobile |
| `src/pages/admin/AdminRobos.tsx` | Padding responsivo |
| `src/pages/admin/AdminDashboard.tsx` | Padding responsivo |
| `src/pages/admin/AdminUsers.tsx` | Verificar cards mobile |
| `src/pages/admin/AdminDepartments.tsx` | Padding responsivo |
| `src/pages/admin/AdminReports.tsx` | Padding responsivo |
| `src/pages/admin/AdminBrain.tsx` | Padding responsivo |
| `src/pages/admin/AdminStorage.tsx` | Padding responsivo |
| `src/pages/admin/AdminConversationLogs.tsx` | Padding responsivo |
| `src/pages/admin/AdminAIIntegrations.tsx` | Padding responsivo |
| `src/pages/admin/AdminIntegrations.tsx` | Padding responsivo |
| `src/pages/admin/AdminRankingConfig.tsx` | Padding responsivo |
| `src/pages/admin/AdminDeletionLogs.tsx` | Padding responsivo |
| `src/pages/sdr/SDRContactsPage.tsx` | Tabela para cards no mobile |
| `src/pages/sdr/SDRPipelinePage.tsx` | Pipeline horizontal scroll no mobile |
| `src/pages/sdr/SDRSchedulingPage.tsx` | Calendario compacto no mobile |
| `src/pages/QuickMessages.tsx` | Filtros empilhados + grid 1col no mobile |
| `src/pages/Ranking.tsx` | Cards compactos no mobile |
| `src/pages/FranqueadoPanel.tsx` | Verificar layout mobile |
| `src/index.css` | Input font-size 16px para iOS |

