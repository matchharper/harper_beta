begin;

-- Keep confirmation plus an explicit "send now" instruction atomic. The
-- company-side LLM selects the delivery mode semantically; this function only
-- applies that authorized state transition without a second confirmation turn.
create or replace function public.enqueue_company_talent_request_v1(
  p_workspace_id uuid,
  p_role_id uuid,
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_source_company_message_id bigint,
  p_expects_document boolean,
  p_request_context text,
  p_delivery_mode text
)
returns public.company_talent_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
begin
  if p_delivery_mode is null
     or p_delivery_mode not in ('standard', 'immediate') then
    raise exception using
      errcode = '22023',
      message = 'company_talent_request_delivery_mode_invalid';
  end if;

  select * into v_request
  from public.enqueue_company_talent_request_v1(
    p_workspace_id,
    p_role_id,
    p_recommendation_id,
    p_talent_id,
    p_source_company_message_id,
    p_expects_document,
    p_request_context
  );

  if p_delivery_mode = 'immediate' then
    perform public.change_company_talent_request_v1(
      'immediate',
      v_request.id,
      p_workspace_id,
      p_role_id,
      p_talent_id
    );
  end if;

  return v_request;
end;
$$;

revoke all on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text, text
) to service_role;

commit;
