

## Plano: Preencher campo Cidade nos leads existentes (Qualificado e Proposta)

### Contexto
Encontrei **23 leads** nos stages "Qualificado" e "Proposta" sem cidade preenchida. Analisei as mensagens do Arthur em cada conversa e identifiquei a cidade mencionada na simulação em **21 deles**. Apenas 2 leads (Aniger e Andre) não tiveram cidade identificável nas mensagens.

### Solução
Executar uma migration SQL para atualizar o campo `city` na tabela `contacts` com base nos dados extraídos das conversas:

| Lead | Cidade |
|------|--------|
| Praia Grande | Praia Grande |
| felipequimura | São Paulo |
| Ciceron | São Paulo |
| rogiriotoledo29 | Barretos |
| Roberley Alves | Lorena |
| Cid Monteiro | Piraju |
| (Cris) amor a cristo | Atibaia |
| Pedro Toledo | Franca |
| deisecarvalhocarvalho | Saquarema |
| Eduardo Alcantara Brecht | Itu |
| José Carlos | Guaratinguetá |
| Nelsom | Morro Redondo |
| ita | Itapetininga |
| Paulo Jorge Da Conceição | Araraquara |
| Sergio Nepomuceno | Conselheiro Pena |
| Adriano | Piracaia |
| Marli | Pedra Azul |
| allanmartins190 | Botucatu |
| Alexandro Dias | João Pessoa |
| Hélio Francisco Dos Reis | Pitangueiras |
| José Francisco Lopes | Jaú |

### Implementação
- Uma migration SQL com `UPDATE contacts SET city = '...' WHERE id = (SELECT contact_id FROM sdr_deals WHERE id = '...')` para cada lead identificado.
- Nenhuma alteração de código necessária — o campo `city` já é exibido no pipeline.

### Resultado
Após a migration, os cards desses leads no pipeline mostrarão a cidade com o ícone de MapPin automaticamente.

