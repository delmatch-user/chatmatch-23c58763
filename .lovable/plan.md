

## Adicionar upload de arquivos (TXT/PDF) na "Base de Consulta" dos robôs

### Problema
Atualmente, a seção "Links de consulta" só suporta URLs. O usuário quer poder também enviar arquivos TXT/PDF como base de conhecimento para os robôs consultarem. A seção deve ser renomeada para "Base de Consulta".

### Solução

**1. Atualizar interface `ReferenceLink` em `src/hooks/useRobots.tsx`**

Adicionar campos opcionais para arquivo:
```typescript
export interface ReferenceLink {
  id: string;
  url: string;
  title: string;
  type: 'link' | 'file';        // novo
  fileUrl?: string;              // novo - URL do storage
  fileName?: string;             // novo - nome original
  fileContent?: string;          // novo - conteúdo extraído do TXT/PDF
}
```

**2. Criar edge function `extract-file-content` para extrair texto de PDF/TXT**

- Recebe o arquivo via upload ou URL do storage
- Para TXT: lê diretamente o conteúdo
- Para PDF: usa parsing básico para extrair texto
- Retorna o conteúdo textual para armazenar no `fileContent`

**3. Atualizar UI em `src/pages/admin/AdminRobos.tsx`**

Na aba "links" (renomeada para "Base de Consulta"):
- Renomear botão de "Links de consulta" para "Base de Consulta"
- Adicionar dois botões para adicionar itens: "Adicionar link" e "Adicionar arquivo"
- Para arquivos: input de upload que aceita `.txt,.pdf`, faz upload para o bucket `chat-attachments`, extrai conteúdo via edge function, e salva no `referenceLinks`
- Renderizar itens de forma diferenciada (ícone de link vs ícone de arquivo)
- Aumentar limite de 5 para 10 itens (mix de links + arquivos)

**4. Atualizar `buildSystemPrompt` em `robot-chat/index.ts` e `sdr-robot-chat/index.ts`**

- Quando `referenceLink.type === 'file'` e `fileContent` existe, injetar o conteúdo diretamente no prompt:
```
## Base de Consulta - Documentos
### Documento: nome_do_arquivo.pdf
[conteúdo extraído do arquivo]
```

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/hooks/useRobots.tsx` | Expandir `ReferenceLink` com campos de arquivo |
| `src/pages/admin/AdminRobos.tsx` | Renomear para "Base de Consulta", adicionar upload de TXT/PDF, UI diferenciada |
| `supabase/functions/robot-chat/index.ts` | Injetar conteúdo de arquivos no prompt do sistema |
| `supabase/functions/sdr-robot-chat/index.ts` | Injetar conteúdo de arquivos no prompt do sistema |
| `supabase/functions/extract-file-content/index.ts` | Nova edge function para extrair texto de PDF/TXT |

