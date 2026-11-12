-- Display defaults do not authorize or execute the card's action.
-- Updates still preserve their explicit revision and full merged content contract.
begin;
alter table public.career_action_items
  alter column description set default '',
  alter column priority set default 0,
  alter column urgency set default 'normal';

create or replace function public.manage_career_action_item(
  p_user_id uuid, p_conversation_id uuid, p_operation text,
  p_id uuid default null, p_expected_revision integer default null,
  p_item jsonb default null, p_creation_key text default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.career_action_items;
begin
  if not exists (select 1 from talent_conversations where id=p_conversation_id and user_id=p_user_id)
    then raise exception 'Conversation not owned'; end if;
  if p_operation = 'create' then
    p_item := jsonb_build_object('description','','priority',0,'urgency','normal') || p_item;
  end if;
  if p_operation in ('create', 'update') and (
    p_item is null or not (p_item ?& array['title','description','buttonText','action','priority','urgency'])
    or jsonb_typeof(p_item->'action') is distinct from 'object'
    or (p_item->'action'->>'type') is null
    or (p_item->'action'->>'type') not in ('send_message','compose_reply')
    or jsonb_typeof(p_item->'action'->'text') is distinct from 'string'
    or (p_item->>'urgency') not in ('normal','soon','urgent')
  ) then raise exception 'Invalid visible action'; end if;
  if p_operation = 'create' then
    if p_creation_key is null then raise exception 'Creation identity required'; end if;
    insert into career_action_items(user_id,title,description,button_text,action,priority,urgency,creation_key)
      values(p_user_id,p_item->>'title',p_item->>'description',p_item->>'buttonText',p_item->'action',
        (p_item->>'priority')::integer,p_item->>'urgency',p_creation_key)
      on conflict(user_id,creation_key) do nothing returning * into r;
    if r.id is null then
      select * into r from career_action_items where user_id=p_user_id and creation_key=p_creation_key;
      return jsonb_build_object('status',case when r.deleted_at is null then 'already_created' else 'already_deleted' end,'id',r.id,'item',to_jsonb(r));
    end if;
  elsif p_operation in ('update','delete') then
    select * into r from career_action_items where id=p_id and user_id=p_user_id and deleted_at is null for update;
    if r.id is null then return jsonb_build_object('status','not_found','id',p_id); end if;
    if p_expected_revision is null or r.revision <> p_expected_revision then
      return jsonb_build_object('status','conflict','id',r.id,'item',to_jsonb(r));
    end if;
    if p_operation = 'delete' then
      update career_action_items set deleted_at=now(),updated_at=now(),revision=revision+1 where id=r.id returning * into r;
    else
      update career_action_items set title=p_item->>'title',description=p_item->>'description',button_text=p_item->>'buttonText',
        action=p_item->'action',priority=(p_item->>'priority')::integer,urgency=p_item->>'urgency',updated_at=now(),revision=revision+1
        where id=r.id returning * into r;
    end if;
  else raise exception 'Unknown operation'; end if;
  return jsonb_build_object('status',case p_operation when 'create' then 'created' when 'update' then 'updated' else 'deleted' end,'id',r.id,'item',to_jsonb(r));
end $$;

commit;
