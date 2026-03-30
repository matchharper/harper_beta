create unique index if not exists unlock_profile_company_user_candid_uidx
on public.unlock_profile (company_user_id, candid_id);

create or replace function public.can_access_candidate_profile(target_candid_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unlock_profile up
    where up.company_user_id = auth.uid()
      and up.candid_id = target_candid_id
  );
$$;

create or replace function public.reveal_candidate_profile(target_candid_id uuid)
returns table (
  already_revealed boolean,
  new_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_id bigint;
  v_new_balance integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if target_candid_id is null then
    raise exception 'Missing candidate id';
  end if;

  insert into public.unlock_profile (company_user_id, candid_id)
  values (v_user_id, target_candid_id)
  on conflict (company_user_id, candid_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select coalesce(c.remain_credit, 0)::integer
      into v_new_balance
    from public.credits c
    where c.user_id = v_user_id
    limit 1;

    return query
    select true, coalesce(v_new_balance, 0);
    return;
  end if;

  v_new_balance := public.deduct_user_credits(1)::integer;

  insert into public.credits_history (user_id, charged_credits, event_type)
  values (v_user_id, 1, 'candidate_profile_reveal');

  return query
  select false, coalesce(v_new_balance, 0);
end;
$$;

revoke all on function public.can_access_candidate_profile(uuid) from public;
revoke all on function public.reveal_candidate_profile(uuid) from public;
grant execute on function public.can_access_candidate_profile(uuid) to authenticated;
grant execute on function public.reveal_candidate_profile(uuid) to authenticated;

revoke insert, update, delete on table public.unlock_profile from authenticated, anon;
grant select on table public.unlock_profile to authenticated;

alter table public.unlock_profile enable row level security;
drop policy if exists unlock_profile_select_own on public.unlock_profile;
create policy unlock_profile_select_own
on public.unlock_profile
for select
to authenticated
using (company_user_id = auth.uid());

alter table public.candid enable row level security;
drop policy if exists candid_select_revealed on public.candid;
create policy candid_select_revealed
on public.candid
for select
to authenticated
using (public.can_access_candidate_profile(id));

alter table public.experience_user enable row level security;
drop policy if exists experience_user_select_revealed on public.experience_user;
create policy experience_user_select_revealed
on public.experience_user
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.edu_user enable row level security;
drop policy if exists edu_user_select_revealed on public.edu_user;
create policy edu_user_select_revealed
on public.edu_user
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.publications enable row level security;
drop policy if exists publications_select_revealed on public.publications;
create policy publications_select_revealed
on public.publications
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.extra_experience enable row level security;
drop policy if exists extra_experience_select_revealed on public.extra_experience;
create policy extra_experience_select_revealed
on public.extra_experience
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.summary enable row level security;
drop policy if exists summary_select_revealed on public.summary;
create policy summary_select_revealed
on public.summary
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.synthesized_summary enable row level security;
drop policy if exists synthesized_summary_select_revealed on public.synthesized_summary;
create policy synthesized_summary_select_revealed
on public.synthesized_summary
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.scholar_profile enable row level security;
drop policy if exists scholar_profile_select_revealed on public.scholar_profile;
create policy scholar_profile_select_revealed
on public.scholar_profile
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.scholar_contributions enable row level security;
drop policy if exists scholar_contributions_select_revealed on public.scholar_contributions;
create policy scholar_contributions_select_revealed
on public.scholar_contributions
for select
to authenticated
using (
  exists (
    select 1
    from public.scholar_profile sp
    where sp.id = scholar_profile_id
      and public.can_access_candidate_profile(sp.candid_id)
  )
);

alter table public.github_profile enable row level security;
drop policy if exists github_profile_select_revealed on public.github_profile;
create policy github_profile_select_revealed
on public.github_profile
for select
to authenticated
using (public.can_access_candidate_profile(candid_id));

alter table public.github_repo_contribution enable row level security;
drop policy if exists github_repo_contribution_select_revealed on public.github_repo_contribution;
create policy github_repo_contribution_select_revealed
on public.github_repo_contribution
for select
to authenticated
using (
  exists (
    select 1
    from public.github_profile gp
    where gp.id = github_profile_id
      and public.can_access_candidate_profile(gp.candid_id)
  )
);

alter table public.shortlist_memo enable row level security;
drop policy if exists shortlist_memo_select_revealed on public.shortlist_memo;
create policy shortlist_memo_select_revealed
on public.shortlist_memo
for select
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_candidate_profile(candid_id)
);

drop policy if exists shortlist_memo_insert_own on public.shortlist_memo;
create policy shortlist_memo_insert_own
on public.shortlist_memo
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists shortlist_memo_update_own on public.shortlist_memo;
create policy shortlist_memo_update_own
on public.shortlist_memo
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists shortlist_memo_delete_own on public.shortlist_memo;
create policy shortlist_memo_delete_own
on public.shortlist_memo
for delete
to authenticated
using (user_id = auth.uid());

alter table public.messages enable row level security;
drop policy if exists messages_select_scoped on public.messages;
create policy messages_select_scoped
on public.messages
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    candid_id is null
    or public.can_access_candidate_profile(candid_id)
  )
);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
on public.messages
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own
on public.messages
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
on public.messages
for delete
to authenticated
using (user_id = auth.uid());
