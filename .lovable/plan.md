

# Reestruturar Treinamento Inteligente — Aprender com Atendentes Humanos

## Problema
O sistema atual gera sugestões baseadas em gaps de tags e tópicos genéricos, resultando em 65 sugestões pouco relevantes. O treinamento deve aprender com as **respostas reais dos atendentes humanos** do Suporte para tornar os robôs mais naturais e humanos.

## Solução

### 1. Botão "Limpar Sugestões Pendentes" no frontend
- Adicionar botão ao lado de "Gerar Sugestões" na aba Treinamento em `AdminBrain.tsx`
- Ao clicar, deletar todos os registros com `status = 'pending'` da tabela `robot_training_suggestions`
- Confirmação via dialog antes de executar

### 2. Reescrever Edge Function `brain-train-robots/index.ts`
Nova abordagem: analisar conversas finalizadas por humanos e extrair padrões de respostas excelentes.

**Fluxo:**
1. Buscar robôs do Suporte (filtro existente mantido)
2. Buscar `conversation_logs` dos últimos 14 dias onde `assigned_to_name IS NOT NULL` (atendidas por humanos)
3. Filtrar apenas membros do Suporte (via `profile_departments`)
4. Do campo `messages` (jsonb), extrair pares pergunta-cliente → resposta-humano
5. Enviar para IA com prompt focado em:
   - Identificar **padrões de linguagem** dos atendentes (saudações, empatia, encerramento)
   - Extrair **respostas frequentes** que o robô não tem no Q&A
   - Sugerir **ajustes de tom** baseados no tom real dos humanos
   - Comparar como o robô responderia vs como o humano respondeu
6. Gerar sugestões de Q&A e tom com exemplos reais dos atendentes

**Prompt da IA reformulado:**
```text
Analise as conversas REAIS entre atendentes humanos e clientes.
Compare com o Q&A atual do robô.
Identifique:
1. Respostas humanas recorrentes que o robô não possui
2. Padrões de linguagem empática dos atendentes
3. Formas de saudação e encerramento que funcionam
4. Respostas onde o humano resolve de forma diferente do robô
Gere sugestões para o robô parecer mais humano e resolver mais.
```

### 3. Atualizar descrição da aba no frontend
- Mudar texto informativo de "analisa gaps de conhecimento" para "aprende com as respostas dos atendentes humanos"

### Arquivos a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-train-robots/index.ts` | Reescrever lógica para aprender com respostas humanas |
| `src/pages/admin/AdminBrain.tsx` | Adicionar botão limpar + atualizar textos descritivos |

