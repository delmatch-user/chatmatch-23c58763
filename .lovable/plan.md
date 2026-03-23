

## Plano: Remover tags duplicadas no History.tsx

### Problema
A tag de taxonomia aparece duas vezes no card: uma vez no cabeçalho (linha 416-421) e outra na seção de tags inferior (linhas 469-476).

### Correção

**Arquivo: `src/pages/History.tsx`**

Remover o bloco inferior de tags (linhas 469-477) que renderiza `log.tags.map(...)`. A tag superior já exibe a taxonomia corretamente no lugar certo.

