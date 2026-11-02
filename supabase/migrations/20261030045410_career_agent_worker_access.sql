begin;

-- The trusted Opportunity Worker uses read_talent_profile_v1 during internal
-- evaluation. Its first read may initialize the default immutable snapshot;
-- it does not edit existing profile revisions or choose role materials.
grant select, insert on public.talent_profiles, public.talent_profile_revisions to harper_worker;
grant select on public.talent_role_materials to harper_worker;
grant execute on function public.capture_talent_profile_snapshot_v1(uuid),
  public.ensure_talent_profile_v1(uuid),
  public.read_talent_profile_v1(uuid,uuid,bigint),
  public.publish_evaluated_internal_role_v1(uuid,uuid,uuid[],uuid,text)
  to harper_worker;

-- Existing Worker recommendation INSERT/feedback UPDATE operations invoke
-- these SECURITY INVOKER triggers too, including an in-flight old release.
grant select, insert, update on public.talent_opportunity_memberships to harper_worker;
grant execute on function public.ensure_career_opportunity_membership(),
  public.archive_career_rejected_memberships() to harper_worker;

commit;
