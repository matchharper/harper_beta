-- Summary writers use this mutation RPC, never the paginated raw SELECT RPC.
-- Refresh an obsolete cache entry while preserving other locales and the
-- first saved summary for the same source/version. Keep source-change guards.
create or replace function public.save_external_role_summaries_v2(p_locale text, p_rows jsonb)
returns table(role_id uuid, summary jsonb)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_locale not in ('ko','en') or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) > 10 then
    raise exception 'Invalid summary batch';
  end if;

  update public.company_roles cr
  set summary = jsonb_set(coalesce(cr.summary, '{}'::jsonb), array[p_locale], x->'payload', true)
  from jsonb_array_elements(p_rows) x
  where cr.role_id = (x->>'roleId')::uuid
    and cr.name = x->>'roleName'
    and coalesce(cr.description, '') = x->>'description'
    and cr.company_workspace_id = (x->>'companyWorkspaceId')::uuid
    and (
      nullif(btrim(cr.summary->p_locale->>'content'), '') is null
      or cr.summary->p_locale->>'version' is distinct from x->'payload'->>'version'
      or cr.summary->p_locale->>'sourceHash' is distinct from x->'payload'->>'sourceHash'
    );

  return query
  select cr.role_id, cr.summary
  from public.company_roles cr
  join jsonb_array_elements(p_rows) x on cr.role_id = (x->>'roleId')::uuid
  where cr.name = x->>'roleName'
    and coalesce(cr.description, '') = x->>'description'
    and cr.company_workspace_id = (x->>'companyWorkspaceId')::uuid;
end $$;

revoke all on function public.save_external_role_summaries_v2(text, jsonb) from public, anon, authenticated;
grant execute on function public.save_external_role_summaries_v2(text, jsonb) to service_role;
