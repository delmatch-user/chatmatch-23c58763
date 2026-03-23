

## Plano: Padronizar layout de tags no AILogs.tsx com o History.tsx

### Correção

**Arquivo: `src/pages/AILogs.tsx`**

Mover a tag de taxonomia/priority da linha do título (linhas 439-447) para uma nova linha abaixo, junto com canal e cidade, seguindo o padrão do History.tsx:

1. **Remover** o badge de taxonomia/priority da div do título (linhas 439-447)
2. **Adicionar** uma nova div `flex items-center gap-2 flex-wrap mb-2` entre o título e as outras tags, contendo:
   - Badge do canal (channelLabel com cores por tipo)
   - Cidade (se machine, extraída do contact_notes)
   - Badge de taxonomia tag / fallback priority
3. Manter o badge "Novo conhecimento" na linha do título

