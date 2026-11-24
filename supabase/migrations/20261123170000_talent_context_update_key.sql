-- Brief compatibility keys can be set, moved or removed on an existing row.
-- The conversation tool (write_talent_context) addresses rows by ref and may
-- now give a Brief a key. Before this, update ignored `key`, so an unkeyed row
-- could get a key only by deleting it and adding a new row.
-- `key` on update: a non-blank string sets it, a blank string clears it. The
-- partial unique index talent_contexts_active_key_uidx still keeps one active
-- Brief per key; the web tool reports the holder before calling this.
-- Everything else is the production definition as of 2026-11-23.
create or replace function public.mutate_talent_contexts(p_talent_id uuid, p_request_id text, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_existing_response jsonb;
  v_claimed integer;
  v_change jsonb;
  v_index integer;
  v_op text;
  v_collection text;
  v_label text;
  v_key text;
  v_content text;
  v_importance smallint;
  v_source_refs jsonb;
  v_id bigint;
  v_ref bigint;
  v_expected_revision bigint;
  v_active_brief_count bigint;
  v_active_brief_chars bigint;
  v_initial_brief_count bigint;
  v_initial_brief_chars bigint;
  v_touched_brief boolean := false;
  v_row public.talent_contexts%rowtype;
  v_applied jsonb := '[]'::jsonb;
begin
  if p_talent_id is null then
    raise exception 'talent_id is required' using errcode = '22023';
  end if;
  if p_request_id is null or length(btrim(p_request_id)) = 0 then
    raise exception 'request_id is required' using errcode = '22023';
  end if;
  if p_changes is null
    or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) = 0
  then
    raise exception 'changes must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 20 then
    raise exception 'changes exceeds the maximum of 20' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_talent_id::text, 0));

  select count(*), coalesce(sum(length(label) + length(content)), 0)
  into v_initial_brief_count, v_initial_brief_chars
  from public.talent_contexts
  where talent_id = p_talent_id
    and collection = 'brief'
    and deleted_at is null;

  -- A request cannot be retried through the product after this window. Keep
  -- the idempotency ledger bounded instead of accumulating one row forever.
  delete from public.talent_context_write_requests
  where talent_id = p_talent_id
    and created_at < now() - interval '30 days';

  select response
  into v_existing_response
  from public.talent_context_write_requests
  where talent_id = p_talent_id and request_id = btrim(p_request_id);

  if found and v_existing_response is not null then
    return v_existing_response;
  end if;

  insert into public.talent_context_write_requests (talent_id, request_id)
  values (p_talent_id, btrim(p_request_id))
  on conflict do nothing;
  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    select response
    into v_existing_response
    from public.talent_context_write_requests
    where talent_id = p_talent_id and request_id = btrim(p_request_id)
    for update;
    if v_existing_response is not null then
      return v_existing_response;
    end if;
  end if;

  for v_change, v_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_changes) with ordinality
  loop
    v_op := lower(btrim(coalesce(v_change ->> 'op', '')));

    if v_op = 'add' then
      v_collection := lower(btrim(coalesce(v_change ->> 'collection', '')));
      v_label := nullif(btrim(coalesce(v_change ->> 'label', '')), '');
      v_key := nullif(btrim(coalesce(v_change ->> 'key', '')), '');
      v_content := btrim(coalesce(v_change ->> 'content', ''));
      v_importance := nullif(v_change ->> 'importance', '')::smallint;
      v_source_refs := coalesce(v_change -> 'source_refs', '[]'::jsonb);

      if v_collection not in ('brief', 'memory') then
        raise exception 'invalid collection at change %', v_index using errcode = '22023';
      end if;
      if length(v_content) = 0 or length(v_content) > 8000 then
        raise exception 'invalid content at change %', v_index using errcode = '22023';
      end if;
      if v_collection = 'brief' and (v_label is null or length(v_label) > 160) then
        raise exception 'brief label is required at change %', v_index using errcode = '22023';
      end if;
      if v_collection = 'brief' and v_importance is not null then
        raise exception 'brief importance is not allowed at change %', v_index using errcode = '22023';
      end if;
      if v_collection = 'memory' then
        v_label := null;
        v_key := null;
        if v_importance is null or v_importance not between 1 and 3 then
          raise exception 'memory importance must be 1, 2, or 3 at change %', v_index using errcode = '22023';
        end if;
      end if;
      if jsonb_typeof(v_source_refs) <> 'array' then
        raise exception 'source_refs must be an array at change %', v_index using errcode = '22023';
      end if;

      if v_key is not null then
        select *
        into v_row
        from public.talent_contexts
        where talent_id = p_talent_id
          and collection = 'brief'
          and key = v_key
          and deleted_at is null
        for update;
      else
        v_row := null;
      end if;

      if v_row.id is null then
        select coalesce(max(ref), 0) + 1
        into v_ref
        from public.talent_contexts
        where talent_id = p_talent_id;
        insert into public.talent_contexts (
          talent_id, ref, collection, label, key, content, importance, source_refs
        ) values (
          p_talent_id, v_ref, v_collection, v_label, v_key, v_content, v_importance, v_source_refs
        )
        returning * into v_row;
      elsif v_key is not null then
        update public.talent_contexts
        set
          label = v_label,
          content = v_content,
          source_refs = source_refs || v_source_refs,
          revision = revision + 1,
          updated_at = now(),
          embedding = null,
          embedding_model = null,
          embedding_content_hash = null,
          embedding_updated_at = null
        where id = v_row.id
          and talent_id = p_talent_id
          and deleted_at is null
        returning * into v_row;
      end if;

    elsif v_op = 'update' then
      v_id := nullif(v_change ->> 'id', '')::bigint;
      v_expected_revision := nullif(v_change ->> 'expected_revision', '')::bigint;
      if v_id is null or v_expected_revision is null then
        raise exception 'id and expected_revision are required at change %', v_index using errcode = '22023';
      end if;
      if not (v_change ? 'content')
        and not (v_change ? 'label')
        and not (v_change ? 'importance')
        and not (v_change ? 'key')
      then
        raise exception 'update content, label, importance, or key is required at change %', v_index using errcode = '22023';
      end if;
      if v_change ? 'source_refs'
        and jsonb_typeof(v_change -> 'source_refs') <> 'array'
      then
        raise exception 'source_refs must be an array at change %', v_index using errcode = '22023';
      end if;
      if v_change ? 'importance' then
        v_importance := nullif(v_change ->> 'importance', '')::smallint;
        if v_importance is null or v_importance not between 1 and 3 then
          raise exception 'memory importance must be 1, 2, or 3 at change %', v_index using errcode = '22023';
        end if;
      end if;

      update public.talent_contexts
      set
        label = case
          when v_change ? 'label' and collection = 'brief'
            then nullif(btrim(coalesce(v_change ->> 'label', '')), '')
          else label
        end,
        key = case
          when v_change ? 'key' and collection = 'brief'
            then nullif(btrim(coalesce(v_change ->> 'key', '')), '')
          else key
        end,
        content = case
          when v_change ? 'content' then btrim(coalesce(v_change ->> 'content', ''))
          else content
        end,
        importance = case
          when v_change ? 'importance' and collection = 'memory'
            then v_importance
          else importance
        end,
        source_refs = case
          when v_change ? 'source_refs' then source_refs || (v_change -> 'source_refs')
          else source_refs
        end,
        revision = revision + 1,
        updated_at = now(),
        embedding = case when v_change ? 'content' then null else embedding end,
        embedding_model = case when v_change ? 'content' then null else embedding_model end,
        embedding_content_hash = case when v_change ? 'content' then null else embedding_content_hash end,
        embedding_updated_at = case when v_change ? 'content' then null else embedding_updated_at end
      where id = v_id
        and talent_id = p_talent_id
        and deleted_at is null
        and revision = v_expected_revision
        and (not (v_change ? 'label') or collection = 'brief')
        and (not (v_change ? 'key') or collection = 'brief')
        and (not (v_change ? 'importance') or collection = 'memory')
      returning * into v_row;

      if v_row.id is null then
        raise exception 'talent context conflict at change %', v_index using errcode = 'PT409';
      end if;
    elsif v_op = 'delete' then
      v_id := nullif(v_change ->> 'id', '')::bigint;
      v_expected_revision := nullif(v_change ->> 'expected_revision', '')::bigint;
      if v_id is null or v_expected_revision is null then
        raise exception 'id and expected_revision are required at change %', v_index using errcode = '22023';
      end if;

      update public.talent_contexts
      set deleted_at = now(), revision = revision + 1, updated_at = now()
      where id = v_id
        and talent_id = p_talent_id
        and deleted_at is null
        and revision = v_expected_revision
      returning * into v_row;

      if v_row.id is null then
        raise exception 'talent context conflict at change %', v_index using errcode = 'PT409';
      end if;
    else
      raise exception 'invalid operation at change %', v_index using errcode = '22023';
    end if;

    v_touched_brief := v_touched_brief or v_row.collection = 'brief';
    v_applied := v_applied || jsonb_build_array(jsonb_build_object(
      'change_index', v_index - 1,
      'op', v_op,
      'id', v_row.id,
      'ref', v_row.ref,
      'talent_id', v_row.talent_id,
      'collection', v_row.collection,
      'label', v_row.label,
      'key', v_row.key,
      'content', v_row.content,
      'importance', v_row.importance,
      'source_refs', v_row.source_refs,
      'revision', v_row.revision,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'deleted_at', v_row.deleted_at
    ));
    v_row := null;
  end loop;

  if v_touched_brief then
    select count(*), coalesce(sum(length(label) + length(content)), 0)
    into v_active_brief_count, v_active_brief_chars
    from public.talent_contexts
    where talent_id = p_talent_id
      and collection = 'brief'
      and deleted_at is null;

    if v_active_brief_count > 40
      and v_active_brief_count > v_initial_brief_count
    then
      raise exception 'Search Brief exceeds the maximum of 40 active items' using errcode = '22023';
    end if;
    if v_active_brief_chars > 8000
      and v_active_brief_chars > v_initial_brief_chars
    then
      raise exception 'Search Brief exceeds the maximum total text length' using errcode = '22023';
    end if;
  end if;

  v_existing_response := jsonb_build_object('applied', v_applied);
  update public.talent_context_write_requests
  set response = v_existing_response
  where talent_id = p_talent_id and request_id = btrim(p_request_id);

  return v_existing_response;
end;
$function$;
