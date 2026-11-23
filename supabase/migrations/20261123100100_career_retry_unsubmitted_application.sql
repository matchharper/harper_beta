-- A web application run that reported it did not submit leaves its effect open for the same application.
-- Before this, the effect stayed bound to that run, so retrying the same application (after a verification code,
-- a missing answer or an expired browser) was refused as "already dispatched".
-- Only a completed browser_run for a role (role_refs) whose own receipt says submitted=no qualifies. yes, unclear,
-- cancelled or failed runs, and runs not for a role (for example a page edit) stay bound.
create function public.release_unsubmitted_career_effect_v1(p_user_id uuid,p_effect_id uuid,p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id
   and kind='browser_run' and status='completed' and lower(btrim(coalesce(result->>'submitted','')))='no'
   and jsonb_typeof(request->'role_refs')='array' and jsonb_array_length(request->'role_refs')>0 for update;
 if not found then return false; end if;
 update public.talent_external_operations set status='reserved',result='{}',revision=revision+1,updated_at=now()
   where id=p_effect_id and user_id=p_user_id and kind='work_effect' and status='dispatching' and result->>'operation_id'=p_operation_id::text;
 return found;
end $$;
revoke all on function public.release_unsubmitted_career_effect_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_unsubmitted_career_effect_v1(uuid,uuid,uuid) to service_role;
