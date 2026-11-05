-- Old single-text memories are read through company memory (F1b).
--
-- Two older places still hold company memory and are still written: the
-- company_memories table (role creation writes one text per role) and
-- company_internal_roles.memory. Searches read them separately from
-- company_memory_entries, so each search saw a different memory.
--
-- They stay the original for now (their writers move later). Each change is
-- copied into company_memory_entries in the same transaction (kind legacy,
-- legacy_ref = where it came from), so the memory read functions, versions
-- and point-in-time reads cover them. The copies are written only by these
-- triggers; the memory tool does not list or change them.
--
-- The memory fingerprint keeps reading the old places directly and skips the
-- copies, so scheduled searches do not run again because of this change.

alter table public.company_memory_entries add column if not exists legacy_ref text;
create unique index if not exists company_memory_entries_legacy_ref_idx
  on public.company_memory_entries (legacy_ref) where legacy_ref is not null;

-- Copies change only through the copy triggers.
create or replace function public.guard_company_memory_legacy_copy_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('harper.company_memory_legacy_copy', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'company_memory_legacy_copy_read_only';
  end if;
  return new;
end;
$$;

create trigger company_memory_entries_legacy_copy_insert
  before insert on public.company_memory_entries
  for each row when (new.legacy_ref is not null)
  execute function public.guard_company_memory_legacy_copy_v1();
create trigger company_memory_entries_legacy_copy_update
  before update on public.company_memory_entries
  for each row when (old.legacy_ref is not null or new.legacy_ref is not null)
  execute function public.guard_company_memory_legacy_copy_v1();

-- Writes (or clears) the copy of one old memory text.
create or replace function public.copy_company_legacy_memory_v1(
  p_ref text, p_company_workspace_id uuid, p_role_id uuid, p_content text, p_source text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_content, '')), '');
begin
  perform set_config('harper.company_memory_legacy_copy', 'on', true);
  if v_text is null then
    update public.company_memory_entries
    set deleted_at = now(), updated_at = now(), revision = revision + 1
    where legacy_ref = p_ref and deleted_at is null;
  else
    update public.company_memory_entries
    set content = v_text, role_id = p_role_id,
        scope = case when p_role_id is null then 'company' else 'role' end,
        deleted_at = null, updated_at = now(), revision = revision + 1
    where legacy_ref = p_ref
      and (content, role_id, deleted_at) is distinct from (v_text, p_role_id, null::timestamptz);
    if not exists (select 1 from public.company_memory_entries where legacy_ref = p_ref) then
      insert into public.company_memory_entries (
        company_workspace_id, scope, role_id, label, content, kind, source, legacy_ref
      ) values (
        p_company_workspace_id, case when p_role_id is null then 'company' else 'role' end,
        p_role_id, '', v_text, 'legacy', p_source, p_ref
      );
    end if;
  end if;
  perform set_config('harper.company_memory_legacy_copy', '', true);
end;
$$;

revoke all on function public.copy_company_legacy_memory_v1(text, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.copy_company_memories_row_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.copy_company_legacy_memory_v1(
      'company_memories:' || old.id::text, old.company_workspace_id, old.role_id, null, 'company_memories');
    return old;
  end if;
  perform public.copy_company_legacy_memory_v1(
    'company_memories:' || new.id::text, new.company_workspace_id, new.role_id, new.content, 'company_memories');
  return new;
end;
$$;

create or replace function public.copy_company_role_memory_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.copy_company_legacy_memory_v1(
    'company_internal_roles.memory:' || new.role_id::text,
    (select role.company_workspace_id from public.company_roles role where role.role_id = new.role_id),
    new.role_id, new.memory, 'company_internal_roles.memory');
  return new;
end;
$$;

revoke all on function public.copy_company_memories_row_v1() from public, anon, authenticated, service_role;
revoke all on function public.copy_company_role_memory_v1() from public, anon, authenticated, service_role;

create trigger company_memories_copy
  after insert or update or delete on public.company_memories
  for each row execute function public.copy_company_memories_row_v1();
create trigger company_internal_roles_memory_copy
  after insert on public.company_internal_roles
  for each row
  when (coalesce(btrim(new.memory), '') <> '')
  execute function public.copy_company_role_memory_v1();
create trigger company_internal_roles_memory_copy_update
  after update of memory on public.company_internal_roles
  for each row
  when (old.memory is distinct from new.memory)
  execute function public.copy_company_role_memory_v1();

-- The fingerprint reads the old places directly; the copies are skipped so
-- its value does not change.
create or replace function public.scheduled_company_memory_fingerprint_v1(p_role uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
select md5(jsonb_build_object(
  'entries',(select jsonb_agg(to_jsonb(m) - 'legacy_ref' order by m.id) from public.company_memory_entries m
    where m.company_workspace_id=r.company_workspace_id and m.deleted_at is null and m.legacy_ref is null
      and (m.scope='company' or (m.scope='role' and m.role_id=r.role_id) or (m.scope='team' and m.team_id=i.team_id))),
  'legacy',(select jsonb_agg(to_jsonb(m) order by m.id) from public.company_memories m
    where m.company_workspace_id=r.company_workspace_id and (m.role_id is null or m.role_id=r.role_id)),
  'legacyRole',i.memory)::text)
from public.company_roles r join public.company_internal_roles i using(role_id) where r.role_id=p_role
$$;

-- Copies of what is there now, oldest first. Each keeps the time the old
-- memory was last saved, so reads as of an earlier time (point-in-time reads,
-- company-first search evidence) see it as before; never earlier than the
-- company's other versions, so version numbers stay in time order.
do $$
declare
  item record;
begin
  for item in
    select source.*
    from (
      select 'company_memories:' || memory.id::text as ref, memory.company_workspace_id,
        case when exists (select 1 from public.company_roles role
          where role.role_id = memory.role_id and role.company_workspace_id = memory.company_workspace_id)
          then memory.role_id end as role_id,
        memory.content, 'company_memories' as source, coalesce(memory.updated_at, memory.created_at) as saved_at
      from public.company_memories memory
      union all
      select 'company_internal_roles.memory:' || internal_role.role_id::text, role.company_workspace_id,
        internal_role.role_id, internal_role.memory, 'company_internal_roles.memory',
        coalesce(internal_role.updated_at, internal_role.created_at)
      from public.company_internal_roles internal_role
      join public.company_roles role on role.role_id = internal_role.role_id
      where coalesce(btrim(internal_role.memory), '') <> ''
    ) source
    order by source.saved_at nulls first, source.ref
  loop
    perform public.copy_company_legacy_memory_v1(
      item.ref, item.company_workspace_id, item.role_id, item.content, item.source);
    update public.company_memory_revisions revision
    set created_at = greatest(item.saved_at, (
      select max(other.created_at) from public.company_memory_revisions other
      where other.company_workspace_id = revision.company_workspace_id and other.id < revision.id))
    where item.saved_at is not null
      and revision.id = (
        select max(copy_revision.id) from public.company_memory_revisions copy_revision
        join public.company_memory_entries entry on entry.id = copy_revision.entry_id
        where entry.legacy_ref = item.ref);
  end loop;
end $$;
