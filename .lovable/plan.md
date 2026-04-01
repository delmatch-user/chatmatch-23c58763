

# Por que o Arthur não pesquisa mais a população

## Diagnóstico

O problema é uma **instrução conflitante** no prompt do Arthur (`sdr-robot-chat`). Na linha 890 do sistema, existe esta regra:

> *"Responda SOMENTE com base nas informações presentes na sua Base de Conhecimento... NUNCA invente ou alucine informações que não estejam na sua base de conhecimento."*

Essa regra impede o Arthur de usar dados que ele conhece (como população de cidades) porque tecnicamente não estão na Base de Conhecimento do robô. Ele interpreta a regra literalmente e diz "precisamos do dado exato para cálculo".

Além disso, o flag `webSearch` existe na configuração dos robôs, mas **nunca foi implementado como ferramenta** — nem no `robot-chat` nem no `sdr-robot-chat`. Não existe uma function call `web_search` que o robô possa chamar.

## Solução

### 1. Ajustar a instrução do prompt no `sdr-robot-chat` (linha ~890)

Adicionar uma exceção para dados públicos/cálculos:

```
- REGRA: Responda com base na Base de Conhecimento. Para dados públicos amplamente
  conhecidos (população de cidades, dados do IBGE, cálculos matemáticos), você PODE
  usar seu conhecimento geral para enriquecer simulações e respostas. NUNCA invente
  dados sobre o PRODUTO/SERVIÇO que não estejam na base.
```

### 2. (Opcional) Implementar ferramenta web_search no SDR

Se quiser que o Arthur faça pesquisas reais na web (via Perplexity ou similar), seria necessário:
- Adicionar uma tool `web_search` na lista de ferramentas do `sdr-robot-chat`
- Implementar o handler que chama uma API de busca
- Isso é mais complexo e pode ser feito num segundo momento

## Recomendação

A **solução 1 é suficiente** para o caso de uso atual — o Arthur já tem conhecimento sobre população de cidades brasileiras no modelo GPT-4o, só precisa de permissão no prompt para usá-lo em simulações.

## Arquivo a editar
- `supabase/functions/sdr-robot-chat/index.ts` — ajustar a diretriz na construção do `systemPrompt` (linhas ~885-890)

