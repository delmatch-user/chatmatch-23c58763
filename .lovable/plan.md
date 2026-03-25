

# Enriquecer Treinamento Inteligente com Base de Conhecimento dos Robos

## Resumo
Injetar a base de conhecimento completa de cada robo no prompt da IA antes de gerar sugestoes, adicionar validacao de conformidade nas sugestoes geradas, e exibir indicadores visuais no frontend.

## Mudancas

### 1. Migration: Adicionar campos de conformidade em `robot_training_suggestions`

```sql
ALTER TABLE robot_training_suggestions 
  ADD COLUMN IF NOT EXISTS compliance_status text DEFAULT 'aligned',
  ADD COLUMN IF NOT EXISTS compliance_notes text,
  ADD COLUMN IF NOT EXISTS knowledge_base_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_base_updated_at timestamptz;
```

### 2. Edge Function: `supabase/functions/brain-train-robots/index.ts`

**Construir `robot_knowledge_context` para cada robo** (antes do loop de geracao):
- Montar bloco com: instructions completas, todos Q&As formatados, tom, reference_links (titulos/URLs)
- Truncar a 8000 chars priorizando: instructions > Q&As recentes > Q&As antigos

**Reescrever o system prompt** para incluir:
- Bloco `CONTEXTO OBRIGATORIO — BASE DE CONHECIMENTO DO ROBO [nome]` com o knowledge_context
- 5 regras de validacao (tom, consistencia Q&A, fluxo, ancoragem em dados, descarte silencioso)
- Formato de resposta expandido com campos `compliance_status` (`aligned` | `review` | `conflict`) e `compliance_notes` em cada sugestao

**No insert de sugestoes**, salvar os novos campos:
- `compliance_status`, `compliance_notes` vindos da resposta da IA
- `knowledge_base_snapshot`: objeto com `{ qa_count, instructions_excerpt, tone, updated_at }`
- `knowledge_base_updated_at`: `robot.updated_at`

### 3. Frontend: `src/pages/admin/AdminBrain.tsx`

**Card "Base consultada"** — acima da lista de sugestoes pendentes:
- Collapsible mostrando: nomes dos robos analisados, qtd Q&As lidos, trecho das instrucoes, data da base
- Aviso se `updated_at > 30 dias`

**Badge de conformidade em cada sugestao**:
- `aligned` → badge verde "Alinhado as normas"
- `review` → badge amarela "Revisar" + tooltip com `compliance_notes`
- `conflict` → badge vermelha "Conflito detectado" + texto expandido obrigatorio

**Secao separada para conflitos**:
- Sugestoes com `conflict` vao para secao colapsada "Sugestoes com conflito — requer atencao"
- Botao "Aprovar" desabilitado ate expandir e ler o conflito

**Validacao pre-geracao**:
- Antes de chamar `generateTrainingSuggestions`, buscar robos do Suporte e verificar:
  - Se algum tem base vazia (sem instructions e sem Q&As): bloquear e mostrar toast
  - Se algum tem < 3 Q&As: mostrar aviso (nao bloquear)

### Arquivos a editar

| Arquivo | Mudanca |
|---------|---------|
| Migration (nova) | Adicionar 4 colunas em `robot_training_suggestions` |
| `supabase/functions/brain-train-robots/index.ts` | Injetar knowledge_context no prompt + retornar compliance fields |
| `src/pages/admin/AdminBrain.tsx` | Card base consultada, badges conformidade, secao conflitos, validacao pre-geracao |

### Detalhes tecnicos

- O `robot_knowledge_context` e montado concatenando `instructions + "\n\nQ&As:\n" + qa_pairs_formatted + "\nTOM: " + tone`
- Truncagem: `instructions` ate 4000 chars, Q&As ate 3500 chars, tom/links ate 500 chars
- A IA retorna `compliance_status` e `compliance_notes` dentro de cada objeto do array `suggestions`
- Os dados do snapshot sao capturados do robo no momento da geracao (nao consulta posterior)
- Sugestoes `conflict` renderizam `compliance_notes` inline no card, sem collapsible extra

