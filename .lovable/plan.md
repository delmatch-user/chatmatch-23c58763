

## Plano: Toggle Ativar/Desativar Ranking

### 1. Migração de banco
Adicionar coluna `is_active BOOLEAN NOT NULL DEFAULT true` na tabela `ranking_config`.

### 2. Alterar `AdminRankingConfig.tsx`
- Adicionar `is_active` ao interface `RankingConfig` e ao `defaultConfig`.
- Adicionar um `Switch` no header (ao lado do botão Salvar) com label "Ranking Ativo/Inativo".
- Incluir `is_active` nos payloads de `insert` e `update` do `handleSave`.

### 3. Alterar `Ranking.tsx`
- Ler `is_active` do config carregado.
- Se `is_active === false`, exibir mensagem "O ranking está desativado" e não renderizar a lista.

### Arquivos
- Nova migração SQL
- `src/pages/admin/AdminRankingConfig.tsx`
- `src/pages/Ranking.tsx`

