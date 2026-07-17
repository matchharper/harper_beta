create table if not exists public.talent_network_referral_links (
  token text primary key,
  referrer_user_id uuid not null references public.talent_users(user_id) on delete cascade,
  visit_count integer not null default 0 check (visit_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.talent_network_referral_links
  add column if not exists token text;

alter table public.talent_network_referral_links
  add column if not exists referrer_user_id uuid;

alter table public.talent_network_referral_links
  add column if not exists visit_count integer default 0;

alter table public.talent_network_referral_links
  add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'talent_network_referral_links'
      and column_name = 'sharer_email'
  ) then
    update public.talent_network_referral_links links
    set referrer_user_id = users.user_id
    from public.talent_users users
    where links.referrer_user_id is null
      and links.sharer_email is not null
      and links.sharer_email <> ''
      and lower(users.email) = lower(links.sharer_email);
  end if;
end $$;

update public.talent_network_referral_links
set
  created_at = coalesce(created_at, now()),
  visit_count = greatest(coalesce(visit_count, 0), 0);

delete from public.talent_network_referral_links
where token is null
  or token = ''
  or referrer_user_id is null;

with ranked_tokens as (
  select
    ctid,
    row_number() over (
      partition by token
      order by created_at asc nulls last, referrer_user_id asc
    ) as row_number
  from public.talent_network_referral_links
)
delete from public.talent_network_referral_links links
using ranked_tokens ranked
where links.ctid = ranked.ctid
  and ranked.row_number > 1;

with ranked_referrers as (
  select
    ctid,
    row_number() over (
      partition by referrer_user_id
      order by created_at asc nulls last, token asc
    ) as row_number
  from public.talent_network_referral_links
)
delete from public.talent_network_referral_links links
using ranked_referrers ranked
where links.ctid = ranked.ctid
  and ranked.row_number > 1;

do $$
declare
  column_to_drop text;
begin
  for column_to_drop in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'talent_network_referral_links'
      and column_name not in (
        'token',
        'referrer_user_id',
        'visit_count',
        'created_at'
      )
  loop
    execute format(
      'alter table public.talent_network_referral_links drop column if exists %I cascade',
      column_to_drop
    );
  end loop;
end $$;

alter table public.talent_network_referral_links
  alter column token set not null,
  alter column referrer_user_id set not null,
  alter column visit_count set not null,
  alter column visit_count set default 0,
  alter column created_at set not null,
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_network_referral_links'::regclass
      and conname = 'talent_network_referral_links_referrer_user_id_fkey'
  ) then
    alter table public.talent_network_referral_links
      add constraint talent_network_referral_links_referrer_user_id_fkey
      foreign key (referrer_user_id)
      references public.talent_users(user_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_network_referral_links'::regclass
      and conname = 'talent_network_referral_links_visit_count_check'
  ) then
    alter table public.talent_network_referral_links
      add constraint talent_network_referral_links_visit_count_check
      check (visit_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_network_referral_links'::regclass
      and contype = 'p'
  ) then
    alter table public.talent_network_referral_links
      add constraint talent_network_referral_links_pkey
      primary key (token);
  end if;
end $$;

create unique index if not exists talent_network_referral_links_token_key
  on public.talent_network_referral_links (token);

create unique index if not exists talent_network_referral_links_referrer_user_id_key
  on public.talent_network_referral_links (referrer_user_id);

create table if not exists public.talent_network_referral_attributions (
  referred_user_id uuid primary key references public.talent_users(user_id) on delete cascade,
  token text not null references public.talent_network_referral_links(token) on delete cascade,
  hired_at timestamptz
);

create index if not exists talent_network_referral_attributions_token_idx
  on public.talent_network_referral_attributions (token);

alter table public.talent_network_referral_links enable row level security;
alter table public.talent_network_referral_attributions enable row level security;

create or replace function public.record_talent_network_referral_visit(
  p_token text,
  p_visitor_user_id uuid default null
)
returns table (
  token text,
  referrer_user_id uuid,
  visit_count integer,
  is_self_visit boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.talent_network_referral_links links
  set visit_count =
    case
      when p_visitor_user_id is not null
        and links.referrer_user_id = p_visitor_user_id
      then links.visit_count
      else links.visit_count + 1
    end
  where links.token = p_token
  returning
    links.token,
    links.referrer_user_id,
    links.visit_count,
    coalesce(
      p_visitor_user_id is not null
        and links.referrer_user_id = p_visitor_user_id,
      false
    );
end;
$$;
