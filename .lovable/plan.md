

## Fix: Prevent Delma's message from being saved during ANY robot transfer

### Root Cause

There are two transfer paths that invoke a destination robot:
1. `transfer_to_robot` (line 1443) — already sets `aiResponse = ''` ✅
2. `transfer_to_department` with a target robot in the destination dept (line 1331) — sets `aiResponse = args.message_to_client` ❌

The DB save guard at line 1547 (`skipSending && aiResponse === ''`) fails for path #2 because `aiResponse` is non-empty. This means Delma's farewell message gets inserted into the `messages` table even though the destination robot will also respond.

### Fix (2 changes in `supabase/functions/robot-chat/index.ts`)

**Change 1** — Line 1331: Clear `aiResponse` when `transfer_to_department` has a target robot (same behavior as `transfer_to_robot`):
```
BEFORE: aiResponse = args.message_to_client || '';
AFTER:  aiResponse = ''; // Robô destino responde, Delma não salva mensagem
```

**Change 2** — Line 1547: Make the guard more robust by using `hasTransferTool` directly instead of relying on `aiResponse === ''`:
```
BEFORE: const hasTransferToolUsed = skipSending && aiResponse === '';
AFTER:  const hasTransferToolUsed = hasTransferTool && skipSending;
```

This ensures that ANY transfer path that sets `skipSending = true` with a transfer tool will skip the DB save, regardless of what `aiResponse` contains.

### Impact
- Delma never saves a message to the DB when transferring to another robot (via either path)
- `transfer_to_human` (no `skipSending`) continues sending its farewell message normally
- `transfer_to_department` without a robot continues working normally

