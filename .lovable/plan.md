

## Plano: Padronizar relatório do Logs IA com o padrão do AdminConversationLogs

### Problema
O diálogo de relatório no `AILogs.tsx` (linhas 536-615) usa renderização manual linha-a-linha (`split('\n').map(...)`) que não suporta tabelas, e tem layout/estilo diferentes do padrão já implementado no `AdminConversationLogs.tsx`.

### Correção

**Arquivo: `src/pages/AILogs.tsx`**

1. **Importar `renderMarkdown`** do `AdminConversationLogs` — ou melhor, copiar a função `renderMarkdown` para o `AILogs.tsx` (já que não está exportada como utilitário separado)

2. **Substituir o diálogo de relatório** (linhas 536-615) pelo mesmo padrão do `AdminConversationLogs`:
   - Título: `Relatório IA - Motivos de Contato (Suporte)` com ícone `Bot`
   - Layout `max-w-3xl h-[85vh] flex flex-col overflow-hidden`
   - Filtros na mesma linha: período (Select), agente IA (Select), botão "Gerar Relatório"
   - Botões Copiar e Exportar PDF com o mesmo estilo e lógica de PDF (usando `renderMarkdown` + `html2pdf.js` com estilos inline para PDF)
   - Área de conteúdo: `dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}` com as mesmas classes prose
   - Estado vazio e loading idênticos

3. **Manter os filtros existentes** do Logs IA (período + agente IA: Delma, Sebastião, Julia) — apenas mudar a apresentação visual para o padrão

### Resultado
O relatório do Logs IA terá o mesmo visual, renderização markdown (com suporte a tabelas), e exportação PDF do AdminConversationLogs, mas com os filtros específicos de IA (agente).

