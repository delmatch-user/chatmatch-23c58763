

## Plano: Nova aba "Conhecimento & Fluxos" no Cerebro

### O que sera feito

Uma nova tab **"Conhecimento"** no Cerebro da Delma que mostra:

1. **Base de Conhecimento dos Robos** — Lista cada robo ativo do Suporte com resumo do que ele sabe: quantidade de Q&A pairs, links de referencia, tamanho das instrucoes, e canais ativos.

2. **Gaps de Conhecimento Detectados** — Cruzando as tags mais frequentes de conversas problematicas com o conteudo dos robos, identificar temas que nao estao cobertos na base.

3. **Sugestoes de Melhoria de Fluxo** — Analise automatica baseada nas metricas existentes gerando sugestoes concretas (ex: "Criar Q&A sobre tema X que aparece em 30% dos erros", "Robo Y nao tem instrucoes sobre financeiro mas 20% dos tickets sao financeiros").

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Nova tab "Conhecimento", fetch de robos, logica de gap analysis, UI com cards de robos + sugestoes |

### Detalhes tecnicos

**Dados dos robos** — Buscar da tabela `robots` via Supabase client (ja acessivel por authenticated users). Campos relevantes: `name`, `status`, `qa_pairs` (jsonb array), `reference_links` (jsonb array), `instructions` (text), `departments` (text[]), `channels` (text[]).

**Gap analysis (client-side):**
- Comparar `topTags` das metricas com keywords nas `instructions` e `qa_pairs` dos robos
- Se uma tag frequente nao aparece em nenhum Q&A ou instrucao, sinalizar como gap
- Calcular cobertura percentual: "X de Y temas cobertos"

**UI da nova tab:**
- Secao 1: Cards por robo mostrando nome, status, qtd Q&A, qtd links, tamanho instrucoes
- Secao 2: Card "Gaps Detectados" com lista de tags frequentes sem cobertura
- Secao 3: Card "Sugestoes de Melhoria" com acoes concretas geradas automaticamente

**Nova tab position:** Entre "Atendentes" e "Relatorio IA"

