alter table public.candidate_outreach
  add column if not exists sequence_mark text null;

do $$
begin
  alter table public.candidate_outreach
    add constraint candidate_outreach_sequence_mark_check
    check (
      sequence_mark is null
      or sequence_mark in (
        'need_email',
        'ready',
        'in_sequence',
        'waiting_reply',
        'replied',
        'paused',
        'closed'
      )
    );
exception
  when duplicate_object then null;
end
$$;
