-- 후보자 링크: a candidate's Harper profile link that travels with what the candidate sends a company (a site
-- application, an application mail, an outreach mail, a follow-up) or that Ops makes by hand. The company opens
-- /c/<token> without signing in, sees what the candidate agreed to share (the snapshot fixed when the link was
-- made), and on sign-up gets a Role from the posting with the candidate already in "연결을 요청할 후보".
--
-- Durable facts no other table keeps: which company a candidate's link went to, under what consent, what it
-- showed (the snapshot, so later profile edits do not change what was shared), and whether the company opened,
-- pressed a button or signed up. Readers: the /c page, the /org claim, the Ops #1 numbers.

create table if not exists public.talent_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  -- Who the link was for.
  company_name text not null check (btrim(company_name) <> ''),
  company_domain text,
  recipient_emails text[] not null default '{}',
  -- The posting it is about ({title, companyName, url, location, description}); null for an outreach mail to a
  -- company without a posting.
  posting jsonb,
  -- One link per candidate, company and posting: follow-ups reuse it.
  posting_key text not null default '',
  source text not null check (source in ('site_application', 'mail_application', 'outreach_mail', 'follow_up', 'ops_manual')),
  -- The Career operation (talent_external_operations) that carried it, when there is one.
  operation_id uuid,
  -- What the candidate agreed the company may see ({compensation: false}); the snapshot follows it.
  scope jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  language text not null default 'en' check (language in ('ko', 'en')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by uuid,
  consented_at timestamptz,
  expires_at timestamptz not null default (now() + interval '90 days'),
  -- What the company did. Opens are counted by the page itself (a mail scanner fetching the URL is not one).
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  cta text,
  cta_at timestamptz,
  claimed_by uuid,
  claimed_workspace_id uuid references public.company_workspace(company_workspace_id) on delete set null,
  claimed_role_id uuid references public.company_roles(role_id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists talent_share_links_target_idx
  on public.talent_share_links (talent_id, lower(coalesce(company_domain, company_name)), posting_key)
  where status = 'active';
create index if not exists talent_share_links_created_idx on public.talent_share_links (created_at desc);
create index if not exists talent_share_links_claimed_ws_idx
  on public.talent_share_links (claimed_workspace_id) where claimed_workspace_id is not null;

alter table public.talent_share_links enable row level security;
revoke all on table public.talent_share_links from public, anon, authenticated;
grant select, insert, update, delete on table public.talent_share_links to service_role;

-- The page reports an open (after it has been on screen) or a button press. Repeated opens within 30 seconds
-- count once. Returns false for an unknown, revoked or expired link.
create or replace function public.record_talent_share_link_event_v1(p_token text, p_event text, p_cta text default null)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_link public.talent_share_links%rowtype;
begin
  if p_event not in ('open', 'cta') then raise exception 'Unknown share link event'; end if;
  select * into v_link from public.talent_share_links
  where token = p_token and status = 'active' and expires_at > now()
  for update;
  if not found then return false; end if;
  if p_event = 'open' then
    if v_link.last_opened_at is null or v_link.last_opened_at < now() - interval '30 seconds' then
      update public.talent_share_links
      set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(),
        open_count = open_count + 1, updated_at = now()
      where id = v_link.id;
    end if;
  else
    update public.talent_share_links
    set cta = coalesce(nullif(btrim(p_cta), ''), cta), cta_at = coalesce(cta_at, now()), updated_at = now()
    where id = v_link.id;
  end if;
  return true;
end;
$$;

revoke all on function public.record_talent_share_link_event_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.record_talent_share_link_event_v1(text, text, text) to service_role;

-- The company that signed up from the link gets the candidate in the Role's "연결을 요청할 후보" at once: the
-- candidate sent this company their application (or mail) and agreed to the link, so no Harper evaluation is
-- waited for. One selection run records why the card exists (trigger_reason candidate_link); the card carries
-- the candidate's own interest (candidateRequestedReview). Nothing is sent to the candidate and no follow-up or
-- internal notice starts here: those begin only when the company asks for an introduction (requested_at).
-- Idempotent: a card this link already made (whatever the company did with it since), or an open card for the
-- same Role and candidate, is returned as it is.
create or replace function public.attach_shared_candidate_v1(
  p_link_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_presentation jsonb,
  p_selection_reason text
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_link public.talent_share_links%rowtype;
  v_role public.company_roles%rowtype;
  v_existing uuid;
  v_run uuid := gen_random_uuid();
  v_card uuid := gen_random_uuid();
begin
  select * into v_link from public.talent_share_links where id = p_link_id and status = 'active' for update;
  if not found then raise exception 'share_link_unavailable'; end if;
  if not exists (select 1 from public.talent_users where user_id = v_link.talent_id and deleted_at is null) then
    raise exception 'share_link_unavailable';
  end if;
  select * into v_role from public.company_roles
  where role_id = p_role_id and company_workspace_id = p_workspace_id and status <> 'deleted';
  if not found then raise exception 'share_link_role_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('company_talent_route:' || p_workspace_id::text || ':' || v_link.talent_id::text, 0));

  -- A card this link already made (whatever the company did with it since) or any open one for this person.
  select id into v_existing from public.company_intro_candidates
  where role_id = p_role_id and talent_id = v_link.talent_id
    and (status in ('ready', 'awaiting_talent', 'connecting', 'connected')
      or role_fingerprint = 'share-link:' || p_link_id::text)
  order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.company_first_search_runs(id, company_workspace_id, role_id, scheduled_slot, trigger_reason,
    contract_version, status, requested_role_ids, request_options, source_snapshot, result, model_manifest,
    source_cutoff, started_at, selection_committed_at, finished_at)
  values (v_run, p_workspace_id, p_role_id, clock_timestamp(), 'candidate_link', 'talent_share_link_v1', 'succeeded',
    array[p_role_id], jsonb_build_object('roleId', p_role_id, 'shareLinkId', p_link_id, 'talentIds', jsonb_build_array(v_link.talent_id)),
    jsonb_build_object('shareLink', jsonb_build_object('id', p_link_id, 'source', v_link.source, 'posting', v_link.posting)),
    jsonb_build_object('selectionMode', 'candidate_link', 'deliveryStatus', 'completed',
      'companyNotice', jsonb_build_object('status', 'not_required', 'reason', 'candidate_link'),
      'counts', jsonb_build_object('selected', 1)),
    jsonb_build_object('writer', 'share_link_snapshot'), now(), now(), now(), now());

  insert into public.company_intro_candidates(id, company_workspace_id, role_id, talent_id, selection_run_id,
    selection_reason, presentation, role_fingerprint, talent_fingerprint, status)
  values (v_card, p_workspace_id, p_role_id, v_link.talent_id, v_run,
    coalesce(nullif(btrim(p_selection_reason), ''), 'candidate_link'), p_presentation,
    'share-link:' || p_link_id::text, 'share-link:' || p_link_id::text, 'ready');
  return v_card;
end;
$$;

revoke all on function public.attach_shared_candidate_v1(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.attach_shared_candidate_v1(uuid, uuid, uuid, jsonb, text) to service_role;
