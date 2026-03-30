

# Unificar conversas duplicadas do Robson Escatamburlo

## Causa raiz
O contato original (`da97506b`) só tem o LID (`211368342986941@lid`) sem telefone. Quando o Robson respondeu, o webhook resolveu o telefone real mas não encontrou o contato existente (que não tinha `phone`), criando um segundo contato e uma segunda conversa.

## Correção (migration SQL)

### 1. Mover mensagens da conversa nova para a original
```sql
UPDATE messages SET conversation_id = '3dad9b82-eea8-41bb-8e39-2add2a9f7452'
WHERE conversation_id = 'ad362ee4-2f2a-450f-8315-d3c4fd853051';
```

### 2. Deletar a conversa duplicada (na fila)
```sql
DELETE FROM conversations WHERE id = 'ad362ee4-2f2a-450f-8315-d3c4fd853051';
```

### 3. Atualizar o contato original com o telefone real e JID
```sql
UPDATE contacts SET 
  phone = '+55 14 98147-7889',
  notes = 'jid:5514981477889@s.whatsapp.net | jid:211368342986941@lid'
WHERE id = 'da97506b-8027-4fbb-92ca-130ca290445a';
```

### 4. Deletar o contato duplicado
```sql
DELETE FROM contacts WHERE id = '9e7fdd71-6416-479a-9ac3-13cdd8aee0bc';
```

### Resultado
- Conversa única com Yasmin contendo todas as mensagens (inclusive as respostas do Robson)
- Contato único com telefone + ambos os JIDs nas notas
- Conversa sai da fila e volta a aparecer normalmente no chat da Yasmin

