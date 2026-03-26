

# Remover Classificacao por Tags — Classificar pela Leitura da Conversa

## Problema
Hoje a classificacao de conversas como "estabelecimento" ou "motoboy" depende de listas de tags (`ESTABELECIMENTO_TAGS`, `MOTOBOY_TAGS`). Muitas conversas nao tem tags corretas, caindo em "geral" e sendo ignoradas. O conteudo da conversa quase sempre deixa claro se e sobre motoboy ou estabelecimento.

## Solucao
Substituir a classificacao por tags por uma classificacao baseada no texto das mensagens da conversa. Usar keywords no conteudo das mensagens (nao nas tags).

## Mudancas

### 1. `supabase/functions/brain-train-robots/index.ts`

- Remover `ESTABELECIMENTO_TAGS` e `MOTOBOY_TAGS` (linhas 123-124)
- Reescrever `classifyConversation` para receber o array de `exchanges` em vez de `tags`
- Concatenar todo o texto das mensagens e buscar keywords de motoboy (`motoboy`, `entregador`, `corrida`, `agendamento`, `repasse`, `antecipacao`, `saque`, `delbeneficios`, `veiculo`, `fila`, `coleta`, `rota`, `app do entregador`, `bloqueio`) e estabelecimento (`loja`, `estabelecimento`, `restaurante`, `recarga`, `cardapio`, `pedido`, `cancelamento`, `integracao`, `ifood`, `saipos`, `pin`, `franquia`, `parceiro`) diretamente no conteudo
- Atualizar a chamada `classifyConversation(logTags)` (linha 164) para `classifyConversation(exchanges)`

### 2. `supabase/functions/brain-learn-instruction-patterns/index.ts`

- Mesma mudanca: remover `ESTABELECIMENTO_TAGS` e `MOTOBOY_TAGS` (linhas 89-90)
- Reescrever `classifyConversation` para ler o conteudo das mensagens
- Na linha 132, em vez de `classifyConversation(l.tags || [])`, extrair o texto das mensagens do log e passar para a funcao

### Logica da nova `classifyConversation`

```typescript
function classifyByContent(messages: any[]): "estabelecimento" | "motoboy" | "geral" {
  const text = messages.map(m => (m.content || "").toLowerCase()).join(" ");
  const MOTOBOY_KW = ["motoboy", "entregador", "corrida", "agendamento", "repasse", 
    "antecipacao", "antecipação", "saque", "delbeneficios", "delbenefícios", "veiculo", 
    "veículo", "fila", "coleta", "rota", "bloqueio", "app do entregador", "entrega"];
  const ESTAB_KW = ["loja", "estabelecimento", "restaurante", "recarga", "cardapio", 
    "cardápio", "pedido", "cancelamento", "integracao", "integração", "ifood", "saipos", 
    "drogavem", "pin", "franquia", "parceiro", "agrupamento"];
  const isMotoboy = MOTOBOY_KW.some(kw => text.includes(kw));
  const isEstab = ESTAB_KW.some(kw => text.includes(kw));
  if (isMotoboy && !isEstab) return "motoboy";
  if (isEstab && !isMotoboy) return "estabelecimento";
  if (isMotoboy && isEstab) return "geral"; // ambiguo
  return "geral";
}
```

## Arquivos a editar

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/brain-train-robots/index.ts` | Remover tag lists, classificar pelo conteudo das mensagens |
| 2 | `supabase/functions/brain-learn-instruction-patterns/index.ts` | Idem |

Nenhuma outra funcionalidade alterada. Deploy das duas EFs apos edicao.

