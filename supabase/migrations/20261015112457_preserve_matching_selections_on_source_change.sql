-- Remove source-edit cancellation, forced fit expiration and automatic input refresh.
-- Current delivery authorization, ordinary fit TTL and explicit searches remain.
-- Historical recovery is a separate, explicitly authorized data operation.
begin;

do $$
declare source_table text;
begin
  foreach source_table in array array[
    'talent_users','talent_setting','talent_contexts','talent_experiences',
    'talent_educations','talent_extras','talent_behavior_contexts','company_roles',
    'company_internal_roles','company_behavior_contexts','company_workspace'
  ] loop
    execute format('drop trigger if exists invalidate_matching_source on public.%I',source_table);
  end loop;
end $$;
drop trigger if exists refresh_matching_after_brief_change on public.talent_contexts;
drop function public.invalidate_matching_source_v1();
drop function public.refresh_matching_after_brief_change_v1();
drop function public.enqueue_matching_input_refresh_v1(uuid,text);

commit;
