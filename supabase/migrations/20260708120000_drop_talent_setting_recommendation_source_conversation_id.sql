alter table public.talent_setting
  drop constraint if exists talent_setting_recommendation_source_conversation_id_fkey;

alter table public.talent_setting
  drop column if exists recommendation_source_conversation_id;
