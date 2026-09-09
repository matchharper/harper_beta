begin;

-- Role lifecycle writes are shared by the website and the company-side LLM.
-- Keep their structural contract in the public wrapper while preserving the
-- stricter legacy validator for every unrelated company-data field.
create or replace function public.validate_company_data_change_value_v1(
  p_key text,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_key = 'role_status' then
    if jsonb_typeof(p_value) <> 'string'
       or (p_value #>> '{}') not in (
         'top_priority', 'active', 'paused', 'ended', 'deleted'
       ) then
      raise exception using
        errcode = '22023',
        message = 'invalid role status';
    end if;
    return;
  end if;

  -- This key is not exposed through the general company-side LLM mutation
  -- catalog. The dedicated deletion flow sends it with role_status=deleted in
  -- the same transaction, including when that flow originates in chat/Slack.
  if p_key = 'role_is_expired' then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception using
        errcode = '22023',
        message = 'role_is_expired must be boolean';
    end if;
    return;
  end if;

  if p_key = 'role_employment_types' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'role_employment_types must be an array';
    end if;
    if jsonb_array_length(p_value) > 12 then
      raise exception using
        errcode = '22023',
        message = 'role_employment_types exceeds 12 items';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
        or char_length(item #>> '{}') > 120
    ) then
      raise exception using
        errcode = '22023',
        message = 'role_employment_types items must be strings of at most 120 characters';
    end if;
    return;
  end if;

  perform public.validate_company_data_change_value_strict_v1(
    p_key, p_value, p_source
  );
end;
$$;

comment on function public.validate_company_data_change_value_v1(
  text, jsonb, text
) is 'Validates shared company-data writes, including internal Role deletion from website, chat, and Slack.';

revoke all on function public.validate_company_data_change_value_v1(
  text, jsonb, text
) from public, anon, authenticated;

commit;
