

## Plano: Adicionar campo Cidade no Pipeline de Leads

### Problema
O robô Arthur coleta a cidade do lead mas salva apenas no campo `notes` (texto livre) do contato — sem campo estruturado. O pipeline não exibe a cidade.

### Solução

**1. Adicionar coluna `city` na tabela `contacts`**
- Nova migration: `ALTER TABLE contacts ADD COLUMN city TEXT DEFAULT NULL`
- Migrar dados existentes: extrair cidade de `notes` onde possível (padrão `franqueado:Cidade`)

**2. Atualizar `edit_contact` no `sdr-robot-chat`**
- Adicionar parâmetro `city` no schema da tool
- No handler, salvar `city` no campo dedicado (além de `notes`)

**3. Atualizar `fetchPipeline` no `sdrApi.ts`**
- Incluir `city` no select: `contact:contacts(name, phone, city)`
- Adicionar `contactCity` ao tipo `SDRDeal`

**4. Exibir cidade no pipeline UI (`SDRPipelinePage.tsx`)**
- **No card do deal**: mostrar a cidade abaixo do nome da empresa (com ícone MapPin)
- **No drawer lateral**: exibir campo "Cidade" na seção de informações
- Para stages "Qualificado" e "Proposta", a cidade aparecerá automaticamente assim que o Arthur ou o atendente a preencher

### Arquivos alterados
- `supabase/functions/sdr-robot-chat/index.ts` — tool schema + handler
- `src/services/sdrApi.ts` — tipo SDRDeal + query
- `src/pages/sdr/SDRPipelinePage.tsx` — UI cards + drawer
- Migration SQL — nova coluna + migração de dados

