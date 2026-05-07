alter table public.talent_conversation_summaries
  add column if not exists segment_summary text not null default '';
