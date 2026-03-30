
ALTER TABLE sdr_appointments ADD COLUMN IF NOT EXISTS task_status text NOT NULL DEFAULT 'pending';

CREATE POLICY "Users can update own appointments status"
ON sdr_appointments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
