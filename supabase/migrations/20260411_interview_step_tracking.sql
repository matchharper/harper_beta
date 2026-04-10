-- Add step tracking for 5-stage structured interview flow
ALTER TABLE talent_conversations
  ADD COLUMN IF NOT EXISTS current_step smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN talent_conversations.current_step IS
  '1=Ice-breaking, 2=Resume Deep-dive, 3=Expectation vs Reality, 4=Logistics, 5=Wrap-up';
