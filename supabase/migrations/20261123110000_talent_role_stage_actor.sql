-- Who moved a recommendation's saved stage. '지원함' (applied) used to mix three facts: a browser run's confirmed
-- submission, the candidate's own button and Harper's record from a conversation. The stage change keeps its
-- existing activity row (move_talent_role_saved_stage_v1); this records the actor on that same row, in the same
-- transaction:
--   harper_submission  a Harper browser run whose own receipt says the site received the application
--   harper             Harper recorded it from the conversation (set_stage)
--   user               the candidate changed it on the page
-- v1 stays unchanged for its existing callers (the private application stage trigger, older code).
create function public.move_talent_role_saved_stage_v2(
  p_talent_id uuid, p_recommendation_id uuid, p_saved_stage text, p_record_activity boolean, p_actor text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result := public.move_talent_role_saved_stage_v1(p_talent_id, p_recommendation_id, p_saved_stage, p_record_activity);
  if p_actor is not null and result->>'activityId' is not null then
    update public.talent_role_activity set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('actor', p_actor)
      where id = (result->>'activityId')::uuid;
  end if;
  return result || jsonb_build_object('actor', p_actor);
end $$;
revoke all on function public.move_talent_role_saved_stage_v2(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.move_talent_role_saved_stage_v2(uuid,uuid,text,boolean,text) to service_role;
