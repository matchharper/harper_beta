-- "신청했어요" on a "볼 만한 것" event: the user tells Harper they signed up,
-- either with the card button or in chat. Harper cannot see the event site, so
-- this is the user's own word, kept in the same status column as seen/opened.
-- registered items stay on Career home until the event ends, like any other.
begin;

alter table public.career_content_suggestions
  drop constraint career_content_suggestions_status_check,
  add constraint career_content_suggestions_status_check
    check (status in ('new', 'seen', 'opened', 'registered', 'dismissed', 'removed'));

drop index public.career_content_suggestions_visible;
create index career_content_suggestions_visible
  on public.career_content_suggestions(user_id, expires_at)
  where status in ('new', 'seen', 'opened', 'registered');

-- Same operations as before; react also takes registered / unregistered.
create or replace function public.manage_career_content_suggestion(
  p_user_id uuid, p_operation text, p_id uuid default null, p_item jsonb default null,
  p_origin text default null, p_conversation_id uuid default null, p_run_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.career_content_suggestions; v_kind text; v_starts timestamptz; v_ends timestamptz; v_expires timestamptz;
  v_deadline timestamptz; v_reaction text; v_next text;
begin
  if p_conversation_id is not null
     and not exists (select 1 from talent_conversations where id = p_conversation_id and user_id = p_user_id)
    then raise exception 'Conversation not owned'; end if;
  if p_operation = 'add' then
    if p_item is null or not (p_item ?& array['kind', 'url', 'title', 'reason'])
       or (p_item->>'kind') not in ('event', 'article', 'post')
       or coalesce(p_origin, '') not in ('user_request', 'harper_offer', 'harper_background')
       or nullif(btrim(p_item->>'title'), '') is null or nullif(btrim(p_item->>'reason'), '') is null
       or (p_item->>'url') !~* '^https?://'
      then raise exception 'Invalid content suggestion'; end if;
    v_kind := p_item->>'kind';
    v_starts := nullif(p_item->>'startsAt', '')::timestamptz;
    v_ends := nullif(p_item->>'endsAt', '')::timestamptz;
    v_deadline := nullif(p_item->>'deadline', '')::timestamptz;
    if v_kind = 'event' then
      if v_starts is null then raise exception 'Event date required'; end if;
      v_expires := coalesce(v_ends, v_starts + interval '1 day');
      if v_expires <= now() then raise exception 'Event already ended'; end if;
    else
      v_expires := now() + interval '30 days';
    end if;
    -- A deadline stated in the item itself (apply by, registration closes) ends it sooner.
    v_expires := least(v_expires, v_deadline);
    if v_expires <= now() then raise exception 'Deadline passed'; end if;
    insert into career_content_suggestions(user_id, kind, url, title, source, reason, starts_at, ends_at,
        location, published_at, expires_at, origin, conversation_id, run_id)
      values (p_user_id, v_kind, btrim(p_item->>'url'), left(btrim(p_item->>'title'), 300),
        nullif(left(btrim(p_item->>'source'), 80), ''), left(btrim(p_item->>'reason'), 400), v_starts, v_ends,
        nullif(left(btrim(p_item->>'location'), 120), ''), nullif(p_item->>'publishedAt', '')::timestamptz,
        v_expires, p_origin, p_conversation_id, p_run_id)
      on conflict (user_id, url) do nothing returning * into r;
    if r.id is null then
      select * into r from career_content_suggestions where user_id = p_user_id and url = btrim(p_item->>'url');
      return jsonb_build_object('status', 'already_saved', 'id', r.id, 'item', to_jsonb(r));
    end if;
    return jsonb_build_object('status', 'saved', 'id', r.id, 'item', to_jsonb(r));
  end if;

  select * into r from career_content_suggestions where id = p_id and user_id = p_user_id for update;
  if r.id is null then return jsonb_build_object('status', 'not_found', 'id', p_id); end if;
  if p_operation = 'remove' then
    if r.status in ('new', 'seen', 'opened') then
      update career_content_suggestions set status = 'removed', status_at = now(), updated_at = now(), revision = revision + 1
        where id = r.id returning * into r;
    end if;
  elsif p_operation = 'react' then
    v_reaction := coalesce(p_item->>'reaction', '');
    if v_reaction not in ('seen', 'opened', 'dismissed', 'registered', 'unregistered') then raise exception 'Unknown reaction'; end if;
    if v_reaction = 'registered' and r.kind <> 'event' then raise exception 'Only events can be registered'; end if;
    -- new -> seen -> opened move forward only. registered marks an event the user
    -- says they signed up for; unregistered takes that back. dismissed is final.
    v_next := case
      when v_reaction = 'seen' and r.status = 'new' then 'seen'
      when v_reaction = 'opened' and r.status in ('new', 'seen') then 'opened'
      when v_reaction = 'registered' and r.status in ('new', 'seen', 'opened') then 'registered'
      when v_reaction = 'unregistered' and r.status = 'registered' then 'opened'
      when v_reaction = 'dismissed' and r.status in ('new', 'seen', 'opened', 'registered') then 'dismissed'
    end;
    if v_next is not null then
      update career_content_suggestions set status = v_next, status_at = now(), updated_at = now(), revision = revision + 1
        where id = r.id returning * into r;
    end if;
  else raise exception 'Unknown operation'; end if;
  return jsonb_build_object('status', r.status, 'id', r.id, 'item', to_jsonb(r));
end $$;

commit;
