alter table public.candidate_outreach_workspace
  add column if not exists bookmark_folder_id bigint null references public.bookmark_folder(id) on delete set null;

create index if not exists candidate_outreach_workspace_bookmark_folder_idx
  on public.candidate_outreach_workspace (bookmark_folder_id);
