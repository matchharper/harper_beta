-- A posting Harper found on the web is copied as a user_submitted Role for the
-- talent who asked (company_roles.information.submittedTalentIds). After it is
-- evaluated, Harper's list writer publishes it to that talent's own New
-- opportunities as a career_agent card. The isolation guard below rejected that
-- card. It now lets only that card through: the same talent, kind career_agent.
-- Every other talent and every other recommendation kind stays blocked, as before.
begin;

create or replace function public.enforce_user_submitted_role_recommendation_isolation_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.kind, '') <> 'user_link_import'
     and exists (
       select 1
       from public.company_roles role
       where role.role_id = new.role_id
         and role.source_provider = 'user_submitted'
         and not (
           new.kind = 'career_agent'
           and coalesce(role.information->'submittedTalentIds', '[]'::jsonb) ? new.talent_id::text
         )
     ) then
    raise exception using
      errcode = '23514',
      message = 'user-submitted roles can only be added through an explicit user link import';
  end if;

  return new;
end;
$function$;

commit;
