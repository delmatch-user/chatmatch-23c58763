

# Corrigir Fluxo de Treinamento: Excluir Delma das Sugestoes

## Entendimento do Fluxo Real

```text
Cliente → Delma (triagem) → Júlia (estabelecimentos)
                           → Sebastião (motoboys)
```

Delma faz triagem e transfere para os especialistas. O cerebro da Delma e gerenciado separadamente (aba Sugestoes, analise autonoma). O Treinamento Inteligente deve focar APENAS nos especialistas Julia e Sebastiao.

## Problema Atual

Na Edge Function `brain-train-robots`, a Delma tem scope "all" (linha 175), recebendo TODAS as conversas e gerando sugestoes misturadas. Isso polui a aba Treinamento com sugestoes irrelevantes para a Delma (que tem seu proprio modulo de aprendizado).

## Solucao

### 1. Edge Function `brain-train-robots/index.ts`

Excluir a Delma do loop de treinamento. Alterar `getRobotScope` para retornar `"skip"` quando o nome contem "delma":

```typescript
function getRobotScope(name: string): "estabelecimento" | "motoboy" | "skip" {
  const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lower.includes("delma")) return "skip";
  if (lower.includes("julia")) return "estabelecimento";
  if (lower.includes("sebastiao")) return "motoboy";
  return "skip"; // Robos sem escopo definido nao recebem treinamento
}
```

No loop principal, pular robos com scope "skip":
```typescript
if (robotScope === "skip") {
  console.log(`Skipping robot ${robot.name} (triager/unknown scope)`);
  continue;
}
```

Isso garante que:
- Delma nunca recebe sugestoes de treinamento (tem seu proprio cerebro)
- Robos de outros departamentos que passem pelo filtro tambem sao ignorados
- Apenas Julia e Sebastiao recebem sugestoes segmentadas

### 2. Nenhuma mudanca no frontend

A logica de aprovacao/rejeicao em `AdminBrain.tsx` ja funciona corretamente para Julia e Sebastiao. Com a Delma excluida, as sugestoes ficam naturalmente separadas por robo.

## Arquivo a editar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/brain-train-robots/index.ts` | Excluir Delma do loop + robos sem escopo retornam "skip" |

