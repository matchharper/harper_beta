begin;

-- Website-only LinkedIn/company_db attach or detach. The expected association,
-- target uniqueness, flat changes, and one compact event commit as one
-- transaction. A null target deliberately updates workspace mirrors without
-- creating or mutating a company_db row. Flat optimistic conflicts are returned
-- only after the nested mutation subtransaction has rolled the association back.
create or replace function public.reassociate_company_workspace_db_v1(
  p_workspace_id uuid,
  p_expected_company_db_id bigint,
  p_target_company_db_id bigint,
  p_changes jsonb,
  p_event_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.company_workspace%rowtype;
  v_conflicting_workspace_id uuid;
  v_apply_result jsonb;
  v_reassociated boolean;
  v_changed_count integer;
  v_constraint_name text;
  v_now timestamptz := transaction_timestamp();
begin
  if coalesce(jsonb_typeof(p_changes), '') <> 'array' then
    raise exception using errcode = '22023', message = 'changes must be an array';
  end if;
  if jsonb_array_length(p_changes) > 24 then
    raise exception using
      errcode = '22023',
      message = 'changes exceeds the website batch limit';
  end if;
  if p_event_content is null
     or char_length(p_event_content) not between 1 and 300
     or p_event_content ~ E'[\r\n]' then
    raise exception using errcode = '22023', message = 'invalid company event content';
  end if;

  -- Reassociation is rare and the global transaction lock prevents two
  -- workspace swaps from taking workspace/company_db locks in opposite order.
  perform pg_advisory_xact_lock(
    hashtext('reassociate_company_workspace_db_v1')
  );

  select workspace.*
  into v_workspace
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company workspace not found';
  end if;

  if v_workspace.company_db_id is distinct from p_expected_company_db_id then
    return jsonb_build_object(
      'status', 'conflict',
      'key', 'company_db_id',
      'expected_company_db_id', p_expected_company_db_id,
      'current_company_db_id', v_workspace.company_db_id
    );
  end if;

  if p_target_company_db_id is not null then
    perform company.id
    from public.company_db company
    where company.id = p_target_company_db_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'target company_db row not found';
    end if;

    -- The target company_db row is the serialization point for association
    -- races. The conflicting workspace is read-only here: locking it after X
    -- would invert ordinary apply's workspace -> company_db order (A -> X)
    -- into B -> X -> A and permit a deadlock.
    select workspace.company_workspace_id
    into v_conflicting_workspace_id
    from public.company_workspace workspace
    where workspace.company_db_id = p_target_company_db_id
      and workspace.company_workspace_id <> p_workspace_id;
    if found then
      return jsonb_build_object(
        'status', 'conflict',
        'key', 'target_company_db_id',
        'conflicting_workspace_id', v_conflicting_workspace_id
      );
    end if;
  end if;

  v_reassociated := v_workspace.company_db_id is distinct from p_target_company_db_id;

  begin
    update public.company_workspace
    set company_db_id = p_target_company_db_id,
        updated_at = case when v_reassociated then v_now else updated_at end
    where company_workspace_id = p_workspace_id;

    if jsonb_array_length(p_changes) = 0 then
      v_apply_result := jsonb_build_object(
        'status', 'already_reflected',
        'changed_count', 0
      );
    else
      v_apply_result := public.apply_company_data_changes_internal_v1(
        p_workspace_id,
        p_changes,
        'website',
        p_event_content,
        p_target_company_db_id is not null
      );
    end if;

    if v_apply_result ->> 'status' = 'conflict' then
      raise exception using
        errcode = 'P0004',
        message = 'company workspace reassociation flat-data conflict';
    end if;
  exception
    when sqlstate 'P0004' then
      return v_apply_result || jsonb_build_object(
        'reassociated', false,
        'association_rolled_back', true
      );
    when unique_violation then
      get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
      if v_constraint_name is distinct from 'company_workspace_company_db_id_uidx' then
        raise;
      end if;
      select workspace.company_workspace_id
      into v_conflicting_workspace_id
      from public.company_workspace workspace
      where workspace.company_db_id = p_target_company_db_id
        and workspace.company_workspace_id <> p_workspace_id;
      return jsonb_build_object(
        'status', 'conflict',
        'key', 'target_company_db_id',
        'conflicting_workspace_id', v_conflicting_workspace_id,
        'reassociated', false,
        'association_rolled_back', true
      );
  end;

  if v_reassociated and v_apply_result ->> 'status' = 'already_reflected' then
    insert into public.company_events(workspace_id, content, source, created_at)
    values (p_workspace_id, p_event_content, 'website', v_now);
    v_apply_result := jsonb_build_object('status', 'updated', 'changed_count', 1);
  elsif v_reassociated and v_apply_result ->> 'status' = 'updated' then
    v_changed_count := coalesce((v_apply_result ->> 'changed_count')::integer, 0) + 1;
    v_apply_result := v_apply_result || jsonb_build_object(
      'changed_count', v_changed_count
    );
  end if;

  return v_apply_result || jsonb_build_object(
    'reassociated', v_reassociated,
    'company_db_id', p_target_company_db_id
  );
end;
$$;

revoke all on function public.reassociate_company_workspace_db_v1(uuid, bigint, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.reassociate_company_workspace_db_v1(uuid, bigint, bigint, jsonb, text)
  to service_role;

comment on function public.reassociate_company_workspace_db_v1(uuid, bigint, bigint, jsonb, text) is
  'Website-only atomic company_db attach/detach plus flat updates and one compact company event.';

commit;
