-- Backfill last_customer_message_at from last customer message
UPDATE sdr_deals d
SET last_customer_message_at = sub.last_msg
FROM (
  SELECT conv.sdr_deal_id, MAX(m.created_at) as last_msg
  FROM conversations conv
  JOIN messages m ON m.conversation_id = conv.id
  WHERE conv.sdr_deal_id IS NOT NULL
    AND m.sender_id IS NULL
    AND m.sender_name NOT LIKE '%[ROBOT]%'
  GROUP BY conv.sdr_deal_id
) sub
WHERE d.id = sub.sdr_deal_id
  AND d.last_customer_message_at IS NULL;

-- For deals that still have NULL (no customer messages found), use deal created_at
UPDATE sdr_deals
SET last_customer_message_at = created_at
WHERE last_customer_message_at IS NULL
  AND won_at IS NULL
  AND lost_at IS NULL;