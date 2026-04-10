CREATE TABLE insight_checklist_items (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  prompt_hint TEXT,
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_insight_checklist_items_active ON insight_checklist_items (is_active) WHERE is_active = true;

COMMENT ON TABLE insight_checklist_items IS 'Ops-managed global checklist items for talent insight extraction. Merged with code-defined items at runtime.';
COMMENT ON COLUMN insight_checklist_items.key IS 'English snake_case key, normalized same as code checklist keys';
COMMENT ON COLUMN insight_checklist_items.label IS 'Korean display label for the UI';
COMMENT ON COLUMN insight_checklist_items.prompt_hint IS 'Optional hint for LLM extraction prompt';
COMMENT ON COLUMN insight_checklist_items.priority IS 'Sort order. Lower = higher priority. Code items use their .priority field (1-10 with duplicates), custom defaults to 50.';
COMMENT ON COLUMN insight_checklist_items.is_active IS 'Soft-delete flag. Only active items are included in merged checklist.';
