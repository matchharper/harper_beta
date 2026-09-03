with duplicate_priority_reviews as (
  select
    id,
    row_number() over (
      partition by talent_id, role_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.talent_progress
  where kind = 'candidate_requested_connection'
)
delete from public.talent_progress as progress
using duplicate_priority_reviews as duplicate
where progress.id = duplicate.id
  and duplicate.duplicate_rank > 1;

create unique index if not exists talent_progress_candidate_requested_connection_uidx
  on public.talent_progress (talent_id, role_id)
  where kind = 'candidate_requested_connection';

comment on index public.talent_progress_candidate_requested_connection_uidx is
  'Keeps one candidate priority-review request per internal role while preserving its first request time.';
