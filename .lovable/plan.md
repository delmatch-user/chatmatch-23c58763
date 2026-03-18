

## Corrigir permissões de edição/exclusão de Mensagens Rápidas para o Suporte

### Problema
As políticas RLS atuais da tabela `quick_messages` restringem UPDATE e DELETE apenas ao `user_id = auth.uid()` (o criador da mensagem). Isso impede que outros membros do departamento Suporte editem ou excluam mensagens, mesmo que tenham acesso de visualização.

### Solução

**1. Migration SQL — Adicionar políticas RLS para membros do Suporte**

Criar duas novas políticas na tabela `quick_messages`:
- **UPDATE**: permitir que membros do departamento "Suporte" (via `user_in_department_by_name`) atualizem qualquer mensagem rápida
- **DELETE**: permitir que membros do departamento "Suporte" excluam qualquer mensagem rápida

```sql
-- Suporte members can update any quick message
CREATE POLICY "Suporte members can update quick messages"
ON public.quick_messages FOR UPDATE TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Suporte'))
WITH CHECK (user_in_department_by_name(auth.uid(), 'Suporte'));

-- Suporte members can delete any quick message
CREATE POLICY "Suporte members can delete quick messages"
ON public.quick_messages FOR DELETE TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Suporte'));
```

**2. Corrigir erros de build existentes**

Corrigir os 12 erros TypeScript em edge functions herdados de edições anteriores:
- `admin-delete-user`: tipar `err` como `Error`
- `admin-update-password`: tipar `err` como `Error`
- `baileys-proxy`: cast `Uint8Array`
- `meta-media-proxy`: tipar `error` como `Error`
- `robot-chat`: tipar parâmetro `p`
- `sync-robot-schedules`: corrigir variável `afDeptName` e tipar `error`
- `webhook-machine`: null check em `autoConfig`
- `whatsapp-webhook`: corrigir `.catch` e null check em `autoConfig`

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| Nova migration SQL | 2 novas políticas RLS (UPDATE + DELETE para Suporte) |
| Edge functions (7 arquivos) | Correções de tipos TypeScript |

