alter table public.talent_conversations
  drop column if exists resume_file_name,
  drop column if exists resume_text,
  drop column if exists resume_links,
  drop column if exists title,
  drop column if exists current_step;
