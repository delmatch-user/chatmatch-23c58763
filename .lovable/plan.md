

# Adicionar Histórico ao Painel Franqueado

## Objetivo
Adicionar um ícone/botão de "Histórico" no painel do franqueado que mostra as conversas finalizadas (da tabela `conversation_logs`) filtradas apenas pelas cidades do franqueado.

## Abordagem
Adicionar uma alternância entre duas views no painel: **Conversas** (atual) e **Histórico** (novo). Um botão no header alterna entre as duas.

## Mudanças

### `src/pages/FranqueadoPanel.tsx`
1. Adicionar estado `activeView: 'conversations' | 'history'` e estados do histórico (`historyLogs`, `historyLoading`, `historySearch`, `selectedLog`, `showMessages`)
2. No header, adicionar botão com ícone `History` para alternar entre views
3. Criar função `fetchHistory` que consulta `conversation_logs` filtrando por `channel = 'machine'` e fazendo match de `contact_notes` com as cidades do franqueado (usando `ilike` para cada cidade)
4. Quando `activeView === 'history'`, renderizar lista de logs finalizados no lugar da lista de conversas, com:
   - Busca por nome/telefone
   - Card para cada log mostrando: nome do contato, cidade, data de finalização, total de mensagens, tags
   - Ao clicar, abrir Dialog com as mensagens do log (similar ao History.tsx existente)
5. O RLS de `conversation_logs` já permite SELECT para membros do departamento — precisamos verificar se franqueados têm acesso

### Possível migração SQL
- Adicionar política RLS em `conversation_logs` para franqueados poderem ver logs de canal `machine` cujas `contact_notes` contenham suas cidades (similar à política existente em `messages`)

```sql
CREATE POLICY "Franqueados can view machine logs"
ON public.conversation_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'franqueado'::app_role)
  AND channel = 'machine'
  AND EXISTS (
    SELECT 1 FROM franqueado_cities fc
    WHERE fc.user_id = auth.uid()
    AND conversation_logs.contact_notes ILIKE '%franqueado:' || fc.city || '%'
  )
);
```

## Resultado
- Franqueado vê botão "Histórico" no header do painel
- Ao clicar, lista todas as conversas Machine finalizadas das suas cidades
- Pode buscar por nome/telefone e clicar para ver as mensagens
- Botão "Conversas" volta à view atual

