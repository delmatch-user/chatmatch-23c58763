

# Corrigir Treinamento: Separar Sugestões por Robô + Aplicar Q&A Corretamente

## Problemas Identificados

1. **Sugestões misturadas**: A Edge Function envia as MESMAS conversas para Júlia e Sebastião. Deveria filtrar por tags — conversas com tags de estabelecimento vão para Júlia, conversas com tags de motoboy vão para Sebastião.

2. **Aprovação não aplica Q&A corretamente**: Ao aprovar, o código adiciona `{ question, answer }` sem o campo `id` obrigatório. O hook `useRobots` espera `{ id, question, answer }`, então o Q&A fica invisível na interface do robô.

3. **Prompt não especifica escopo do robô**: A IA não sabe que Júlia atende estabelecimentos e Sebastião atende motoboys, gerando sugestões genéricas.

## Solução

### 1. Edge Function `brain-train-robots/index.ts`

**Filtrar conversas por robô baseado em tags**:
- Antes do loop de robôs, classificar cada conversa como `estabelecimento` ou `motoboy` com base nas tags (mesma lógica do `brain-analysis`)
- Para cada robô, enviar apenas as conversas relevantes ao seu escopo
- Usar o nome do robô para determinar o filtro: se contém "Julia"/"Júlia" → estabelecimento, se contém "Sebastião"/"Sebastiao" → motoboy
- Robôs sem match (ex: Delma) recebem todas as conversas

**Adicionar contexto de escopo no prompt**:
- Incluir no system prompt: "Este robô atende exclusivamente [estabelecimentos/motoboys]. Gere sugestões APENAS para esse público."

### 2. Frontend `AdminBrain.tsx`

**Corrigir aplicação de Q&A aprovado**:
- Na função `handleSuggestionAction`, ao inserir novo Q&A, gerar um `crypto.randomUUID()` para o campo `id`
- Formato correto: `{ id: crypto.randomUUID(), question, answer }`

**Agrupar sugestões por robô na UI**:
- Renderizar sugestões pendentes agrupadas por `robot_name` com header visual separando cada robô (ícone Store para Júlia, Bike para Sebastião)

### Arquivos a editar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-train-robots/index.ts` | Filtrar conversas por tags do robô + adicionar escopo no prompt |
| `src/pages/admin/AdminBrain.tsx` | Gerar `id` no Q&A aprovado + agrupar sugestões por robô |

### Detalhes técnicos

Classificação de conversas por tags (mesmo padrão do `brain-analysis`):
```text
ESTABELECIMENTO_TAGS = ["erro_sistema", "cancelamento", "financeiro", "operacional", ...]
MOTOBOY_TAGS = ["motoboy", "entregador", "entrega", ...]
```

Mapeamento robô → escopo:
```text
nome contém "julia" → filtra conversas com tags de estabelecimento
nome contém "sebastião" → filtra conversas com tags de motoboy
outros → todas as conversas
```

