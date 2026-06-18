alter table if exists public.talent_activity_events
  drop column if exists related_entity_type,
  drop column if exists related_entity_id,
  drop column if exists metadata,
  drop column if exists occurred_at;

create index if not exists talent_activity_events_talent_created_idx
  on public.talent_activity_events (talent_id, created_at desc);

create index if not exists talent_activity_events_type_created_idx
  on public.talent_activity_events (event_type, created_at desc);
