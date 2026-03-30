

# Supervisor atribuir tarefas na agenda para atendentes do departamento

## Problema
1. **SDRRoute** só permite acesso a quem está no departamento "Comercial" — supervisores de outros departamentos (como "Cardápio Digital") não conseguem acessar
2. **RLS de `sdr_appointments`** mesma restrição — só "Comercial" ou admin
3. **Edge function** sempre seta `user_id` como o usuário autenticado — não permite atribuir a outro membro
4. **UI** não tem campo para selecionar o atendente que receberá a tarefa

## Mudanças

### 1. `src/components/sdr/SDRRoute.tsx` — Permitir supervisores acessarem

Adicionar verificação: se o usuário é supervisor (`isSupervisor`), permitir acesso à rota SDR (agenda). Isso permite que Fabio (supervisor) acesse `/comercial/agenda`.

### 2. Migration — Expandir RLS de `sdr_appointments`

Adicionar policy para supervisores poderem gerenciar appointments de membros dos seus departamentos:

```sql
-- Supervisores podem gerenciar agendamentos
CREATE POLICY "Supervisors can manage sdr_appointments"
ON public.sdr_appointments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));
```

### 3. `supabase/functions/sdr-meeting-create-with-meet/index.ts` — Aceitar `assigned_to`

Aceitar campo `assigned_to` no body. Se fornecido (e o usuário é supervisor/admin), usar esse ID como `user_id` do appointment. Caso contrário, manter `user.id`.

### 4. `src/pages/sdr/SDRSchedulingPage.tsx` — UI de atribuição

- Carregar membros do departamento do supervisor (via `profile_departments` + `profiles`)
- No modal de criação, se o usuário é supervisor, mostrar `<Select>` com os atendentes do departamento
- Enviar `assigned_to` na chamada à edge function
- No calendário, mostrar o nome do atendente atribuído nos cards (ex: "09:00 - Demo [Yasmin]")

### Detalhes

**Carregamento de membros:**
```typescript
// No useEffect, se supervisor:
const { data } = await supabase
  .from('profile_departments')
  .select('profile_id, profiles!inner(id, name)')
  .in('department_id', userDepartmentIds);
```

**Form atualizado:**
```typescript
formData: { ...existing, assignedTo: '' }
// Select no modal: "Atribuir para:" com lista de membros
```

**Edge function:**
```typescript
const targetUserId = (assigned_to && isAdminOrSupervisor) ? assigned_to : user.id;
// ... insert com user_id: targetUserId
```

