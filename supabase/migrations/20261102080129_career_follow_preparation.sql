-- Shared paid search receipts, including successful empty searches. Career reads
-- these facts; the cache never creates a candidate outreach occurrence.
create table public.company_hiring_search_cache (
  cache_key text primary key,
  evidence jsonb,
  checked_at timestamptz,
  refresh_after timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error text
);
alter table public.company_hiring_search_cache enable row level security;
revoke all on public.company_hiring_search_cache from public, anon, authenticated;
grant select, insert, update on public.company_hiring_search_cache to service_role;
create policy service_access on public.company_hiring_search_cache to service_role using (true) with check (true);

create function public.claim_company_hiring_search(p_key text, p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 insert into public.company_hiring_search_cache(cache_key) values(p_key) on conflict do nothing;
 update public.company_hiring_search_cache set lease_token=p_token,lease_expires_at=now()+interval '2 minutes'
 where cache_key=p_key and refresh_after<=now() and (lease_expires_at is null or lease_expires_at<=now())
 returning cache_key into claimed;
 return claimed is not null;
end $$;

-- Reuse the existing invocation ledger for execution receipts. Serialize paid
-- preparation per talent, across queue retries and overlapping schedule runs.
create function public.claim_career_follow_preparation(p_run uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare item public.opportunity_discovery_run;
begin
 select * into item from public.opportunity_discovery_run where id=p_run;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('career-follow-preparation:'||item.talent_id::text,0));
 select * into item from public.opportunity_discovery_run where id=p_run for update;
 if item.status IS DISTINCT FROM 'handed_off' or item.trigger_payload->>'runContract' IS DISTINCT FROM 'career_agent_v1'
   or item.coverage#>>'{followPreparation,status}'='ready'
   or (item.coverage#>>'{followPreparation,leaseExpiresAt}')::timestamptz>now() then return false; end if;
 if exists(select 1 from public.opportunity_discovery_run r where r.talent_id=item.talent_id and r.id<>p_run
   and r.status='handed_off' and r.coverage#>>'{followPreparation,status}' in ('preparing','waiting')) then
   return false;
 end if;
 update public.opportunity_discovery_run set coverage=coalesce(coverage,'{}'::jsonb)||jsonb_build_object('followPreparation',
   coalesce(coverage->'followPreparation','{}'::jsonb)||jsonb_build_object('status','preparing','leaseToken',p_token,'leaseExpiresAt',now()+interval '8 minutes'))
 where id=p_run;
 return true;
end $$;
create function public.save_career_follow_preparation(p_run uuid,p_token uuid,p_patch jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare saved uuid;
begin
 update public.opportunity_discovery_run set coverage=coalesce(coverage,'{}'::jsonb)||jsonb_build_object('followPreparation',
   coalesce(coverage->'followPreparation','{}'::jsonb)||p_patch||jsonb_build_object('leaseToken',null,'leaseExpiresAt',null))
 where id=p_run and status='handed_off' and coverage#>>'{followPreparation,leaseToken}'=p_token::text
 returning id into saved;
 return saved is not null;
end $$;
revoke all on function public.claim_company_hiring_search(text,uuid),public.claim_career_follow_preparation(uuid,uuid),public.save_career_follow_preparation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_company_hiring_search(text,uuid),public.claim_career_follow_preparation(uuid,uuid),public.save_career_follow_preparation(uuid,uuid,jsonb) to service_role;
create index career_follow_preparation_pending_idx on public.opportunity_discovery_run(talent_id)
 where status='handed_off' and coverage#>>'{followPreparation,status}' in ('preparing','waiting');
create index talent_external_evaluations_follow_idx on public.talent_external_evaluations(talent_id,role_id,evaluated_at desc,id desc);
create index career_internal_evaluations_follow_idx on public.company_role_candidate_evaluations(talent_id,role_id,stage desc,evaluated_at desc,id desc);
