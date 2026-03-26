

# Corrigir Atribuicao de robot_id nas Sugestoes de Treinamento

## Diagnostico

Apos analise do codigo, identifiquei dois problemas raiz:

1. **`brain-train-robots/index.ts`**: A classificacao de conversas por tags usa listas muito restritas. Tags como "agendamento", "repasse", "antecipacao", "delbeneficios", "veiculo", "fila", "coleta" para motoboys e "recarga", "integracao", "pin", "cardapio", "franquia" para estabelecimentos NAO estao presentes. Muitas conversas caem em "geral" e sao ignoradas para o Sebastiao.

2. **`brain-learn-from-conversations/index.ts`**: O prompt pede `content.robot_id` e `content.robot_name` mas nao fornece classificacao obrigatoria com IDs reais. A IA decide livremente e tende a atribuir tudo a Julia.

3. **Frontend (AdminBrain.tsx)**: O agrupamento por `robot_name` ja existe (linhas 2400-2477) mas depende do campo `robot_name` estar correto na tabela.

## Plano de Correcao

### 1. Expandir tags de classificacao (brain-train-robots)

Adicionar as keywords solicitadas pelo usuario nas listas:

```
ESTABELECIMENTO_TAGS += ["recarga", "integracao", "pin", "cardapio", "franquia", "ifood", "saipos", "drogavem", "loja", "parceiro", "restaurante"]
MOTOBOY_TAGS += ["agendamento", "repasse", "antecipacao", "saque", "delbeneficios", "veiculo", "fila", "coleta", "app"]
```

Mesma expansao no `brain-learn-instruction-patterns/index.ts`.

### 2. Classificacao obrigatoria no prompt (brain-learn-from-conversations)

Injetar os IDs reais dos robos (buscados da tabela `robots`) no prompt com bloco de classificacao:

```
CLASSIFICAÇÃO OBRIGATÓRIA:
- Motoboy/entregador/corrida/agendamento/repasse/antecipação → robot_id = [ID_SEBASTIAO], robot_name = "Sebastião"
- Loja/estabelecimento/restaurante/recarga/cardápio/franquia → robot_id = [ID_JULIA], robot_name = "Júlia"
- Triagem/classificação geral → robot_id = [ID_DELMA], robot_name = "Delma"
- Se houver dúvida → Delma
```

### 3. Validacao antes de inserir (ambas EFs)

Antes de salvar em `delma_suggestions` ou `robot_training_suggestions`:
- Verificar coerencia: se texto menciona keywords de motoboy mas robot_id aponta Julia → corrigir
- Se robot_id nulo → classificar por keywords ou marcar como nao classificado
- Se ambos escopos presentes → dividir em duas sugestoes

### 4. Frontend — secao "Nao classificadas" (AdminBrain.tsx)

No agrupamento por robot (linhas 2400-2477), adicionar secao para sugestoes com `robot_name` nulo ou desconhecido:
- Icone ⚠️ com label "Nao classificadas"
- Exibicao no final da lista

### 5. Reprocessar sugestoes pendentes incorretas

SQL via insert tool para corrigir sugestoes existentes com `status = 'pending'`:
- Analisar `content` e `title` por keywords
- Atualizar `robot_id` e `robot_name` quando incorretos

## Arquivos a editar

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/brain-train-robots/index.ts` | Expandir MOTOBOY_TAGS e ESTABELECIMENTO_TAGS |
| 2 | `supabase/functions/brain-learn-instruction-patterns/index.ts` | Idem |
| 3 | `supabase/functions/brain-learn-from-conversations/index.ts` | Injetar IDs reais + classificacao obrigatoria + validacao |
| 4 | `src/pages/admin/AdminBrain.tsx` | Secao "Nao classificadas" no agrupamento |
| 5 | SQL (insert tool) | Reprocessar sugestoes pendentes |

