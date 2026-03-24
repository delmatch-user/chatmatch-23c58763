
Objetivo: corrigir os 3 fluxos que você confirmou com falha (Teste de conexão Claude, Relatório da Delma, Robô Delma Cérebro) e deixar o sistema resiliente mesmo quando um provedor estiver sem crédito/indisponível.

Diagnóstico confirmado
- Do I know what the issue is? Sim.
- Relatório Delma: logs da função `brain-analysis` mostram `AI gateway error: 402`, então a análise falha por crédito/limite do provedor atual.
- Teste de conexão Claude: hoje o teste usa geração em `/v1/messages`; isso falha por billing/model access e vira “conexão falhou”, mesmo quando a chave pode estar válida.
- Robôs Delma Cérebro: fluxo Claude está frágil para erros não-429 e para payload multimodal; sem fallback robusto, a conversa quebra em vez de continuar com outro provedor/modelo.

Plano de correção (implementação)

1) Corrigir base de modelos do provider Anthropic (DB migration)
- Criar migration para atualizar `public.ai_providers` (provider `anthropic`) com modelo correto:
  - `claude-sonnet-4-20250514`
  - `claude-3-5-haiku-20241022` (corrigindo o id inválido salvo hoje)
- Garantir `default_model` consistente e `updated_at = now()`.

2) Tornar “Testar Conexão” confiável em `manage-ai-keys`
- Arquivo: `supabase/functions/manage-ai-keys/index.ts`
- Para `provider === 'anthropic'`:
  - Trocar teste principal para `GET https://api.anthropic.com/v1/models` (valida chave sem depender de consumo de tokens).
  - Validar se o modelo default esperado existe na lista e retornar status claro:
    - sucesso total (chave válida + modelo disponível),
    - sucesso parcial (chave válida, mas sem acesso ao modelo default),
    - falha real (401/403).
  - Padronizar retorno `{ success, message, statusCode, details }` com mensagens detalhadas para a UI.
- Manter logs técnicos no backend para diagnóstico rápido.

3) Blindar `robot-chat` (Delma Cérebro) com fallback real
- Arquivo: `supabase/functions/robot-chat/index.ts`
- Melhorias:
  - Ajustar adaptação para Anthropic com normalização segura de conteúdo (texto/imagem) para não quebrar quando houver conteúdo não-string.
  - Tratar falhas não-429 (400/401/402/403/404/5xx) com fallback em cadeia:
    1) Claude Sonnet (primário),
    2) Claude Haiku (fallback de modelo),
    3) Lovable AI (modelo estável),
    4) Gemini/OpenAI conforme chaves disponíveis.
  - Preservar tool-calls e formato de resposta para não quebrar transferências/finalização.
  - Melhorar mensagens de erro retornadas ao cliente (`provider`, `status`, `reason`).

4) Blindar `sdr-robot-chat` com a mesma estratégia
- Arquivo: `supabase/functions/sdr-robot-chat/index.ts`
- Aplicar o mesmo pacote de robustez:
  - normalização de payload Anthropic,
  - fallback de modelo/provedor,
  - tratamento uniforme de erro + logs detalhados,
  - garantir continuidade do fluxo SDR sem travar conversa.

5) Fazer o Relatório da Delma funcionar sempre
- Arquivo: `supabase/functions/brain-analysis/index.ts`
- Alterar geração de relatório para:
  - Primário: Anthropic (Delma Cérebro),
  - Fallback: Lovable AI,
  - Fallback final: relatório determinístico (sem IA) usando as métricas já calculadas.
- Resultado: sempre retorna conteúdo de relatório útil (nunca tela “não foi possível…”).
- Incluir metadados no retorno (`providerUsed`, `fallbackUsed`, `warning`) para transparência na UI.

6) Ajuste fino da UI do Cérebro para feedback correto
- Arquivo: `src/pages/admin/AdminBrain.tsx`
- Exibir aviso contextual quando relatório veio por fallback (sem parecer erro fatal).
- Mensagens de toast mais claras (ex.: “Gerado com fallback Claude Haiku” / “Gerado em modo automático sem IA”).

Validação (fim-a-fim)
1. Admin > Integrações de IA:
- Testar conexão Claude deve retornar status explicativo correto.
2. Admin > Cérebro > Relatório IA:
- Gerar relatório deve sempre produzir conteúdo (Claude, fallback, ou automático).
3. Robô com inteligência “Delma Cérebro 🧠”:
- Testar conversa real (incluindo caso com transferência/tool-call) sem quebra.
4. SDR com “Delma Cérebro”:
- Validar avanço de etapa + transferência sem erro de provedor.
5. Conferir logs:
- erros com status e causa claros; sem falha silenciosa.

Arquivos que serão alterados
- `supabase/migrations/*` (nova migration de ajuste de `ai_providers`)
- `supabase/functions/manage-ai-keys/index.ts`
- `supabase/functions/robot-chat/index.ts`
- `supabase/functions/sdr-robot-chat/index.ts`
- `supabase/functions/brain-analysis/index.ts`
- `src/pages/admin/AdminBrain.tsx`
