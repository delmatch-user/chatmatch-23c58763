## Reestruturação dos Robôs: Delma (triagem) → Júlia/Sebastião (especialistas)

### Situação atual

- **Delma** (Suporte, WhatsApp+Machine) — `inactive`
- **Júlia** (Suporte, Machine) — `paused`
- **Sebastião** (Suporte, WhatsApp) — `paused`
- `sync-robot-schedules` atribui qualquer robô ativo que bata dept+canal a conversas na fila
- Não existe ferramenta de transferência direta entre robôs (só `transfer_to_department` e `transfer_to_human`)

### Problema

Júlia e Sebastião não devem pegar conversas da fila — só receber de Delma. Hoje não há como distinguir robôs "triagem" de robôs "especialistas".

### Plano

**1. Nova coluna `auto_assign` na tabela `robots**`

- `boolean NOT NULL DEFAULT true`
- Quando `false`, `sync-robot-schedules` pula o robô (não atribui da fila)
- Transferências manuais e robot-to-robot continuam funcionando normalmente

**2. Nova tool de IA: `transfer_to_robot**`

- Permite que um robô transfira diretamente para outro robô pelo nome
- No `robot-chat/index.ts`: adicionar ao `buildOpenAITools` e tratar no bloco de tool calls
- Lógica: busca robô por nome (case-insensitive), atualiza `assigned_to_robot`, chama `robot-chat` para o robô destino
- Na `buildSystemPrompt`: listar robôs disponíveis para transferência (buscar do banco)

**3. Atualizar `sync-robot-schedules**`

- Adicionar filtro `auto_assign = true` na query de robôs ativos (linha ~28)

**4. Atualizar dados dos robôs**

- **Delma**: ativar (`active`), `auto_assign = true`, garantir canais `whatsapp + machine`
- **Júlia**: ativar (`active`), `auto_assign = false`
- **Sebastião**: ativar (`active`), `auto_assign = false`
- Atualizar instruções da Delma para usar `transfer_to_robot` ao invés de `transfer_to_human` quando encaminhar para Júlia/Sebastião

**5. Base de Consulta (reference_links)**

- O sistema já injeta `fileContent` dos arquivos no prompt (linhas 128-135 do robot-chat)
- Basta garantir que os 3 robôs tenham seus arquivos configurados na aba "Conhecimento" da UI
- Nenhuma mudança de código necessária para isso

**6. UI: toggle `auto_assign` na página AdminRobos**

- Adicionar switch "Assumir conversas da fila automaticamente" na aba Ferramentas
- Quando desligado, o robô só atende via transferência

### Arquivos modificados

- **Migration SQL**: adicionar coluna `auto_assign` em `robots`
- `supabase/functions/robot-chat/index.ts`: nova tool `transfer_to_robot` + prompt + handler
- `supabase/functions/sync-robot-schedules/index.ts`: filtro `auto_assign`
- `src/hooks/useRobots.tsx`: adicionar campo `autoAssign` ao tipo `Robot`
- `src/pages/admin/AdminRobos.tsx`: toggle na UI
- **Data update**: ativar Delma, setar `auto_assign=false` em Júlia/Sebastião

### Fluxo resultante

```text
Conversa nova na fila
       │
       ▼
sync-robot-schedules → só considera robôs com auto_assign=true
       │
       ▼
  Delma assume (triagem)
       │
       ├── Entregador → transfer_to_robot("Sebastião")
       │                      │
       │                      ▼
       │                 Sebastião assume
       │
       ├── Estabelecimento → transfer_to_robot("Júlia")
       │                          │
       │                          ▼
       │                     Júlia assume
       │
       └── Outros Urgentes → transfer_to_department / transfer_to_human
```