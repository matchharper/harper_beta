-- Show the latest version of each review linked to this user's opportunity.
-- Existing forms, answers and execution authority remain in their original conversation.
create function public.list_career_opportunity_reviews_v1(
  p_user uuid, p_role uuid, p_opportunity uuid, p_before bigint default null, p_limit integer default 21
) returns table(conversation_id uuid, form_id bigint, revision integer)
language sql stable security invoker set search_path='' as $$
  with recursive targets(id) as (
    select o.id from public.career_opportunities o
    left join public.talent_opportunity_recommendation r on r.id=o.recommendation_id and r.talent_id=o.talent_id
    where o.talent_id=p_user and o.deleted_at is null and o.merged_into_id is null
      and (o.id=p_opportunity or (p_opportunity is null and r.role_id=p_role))
    union
    select alias.id from public.career_opportunities alias join targets t on t.id=alias.merged_into_id
    where alias.talent_id=p_user and alias.deleted_at is null
  ), refs(ref) as (
    select jsonb_build_object('type','opportunity','id',id::text) from targets
    union all
    select jsonb_build_object('type','role','id',p_role::text) where p_role is not null
  ), work_links(conversation_id, ref) as (
    select w.conversation_id, jsonb_build_object('type','work','id',w.id::text)
    from public.talent_external_operations w
    where w.user_id=p_user and w.kind='delegated_work' and exists (
      select 1 from refs where w.request->'resource_refs' @>
        jsonb_build_array(jsonb_build_object('kind',ref->>'type','id',ref->>'id'))
    )
  )
  select m.conversation_id, (m.payload->>'formId')::bigint, (m.payload->>'revision')::integer
  from public.talent_messages m
  where m.user_id=p_user and m.message_type='career_form' and m.payload->>'kind'='form'
    and coalesce(m.payload->>'hidden','false')<>'true'
    and (p_before is null or (m.payload->>'formId')::bigint<p_before)
    and (
      exists (select 1 from refs where m.payload->'relatedRefs' @> jsonb_build_array(ref))
      or (
        -- An explicitly linked review may be narrower than its delegated work.
        not (m.payload->'relatedRefs' @> '[{"type":"role"}]' or m.payload->'relatedRefs' @> '[{"type":"opportunity"}]')
        and exists (select 1 from work_links w where w.conversation_id=m.conversation_id
          and m.payload->'relatedRefs' @> jsonb_build_array(w.ref))
      )
    )
    and not exists (
      select 1 from public.talent_messages newer
      where newer.user_id=m.user_id and newer.conversation_id=m.conversation_id and newer.message_type='career_form'
        and (newer.payload->>'formId')::bigint=(m.payload->>'formId')::bigint
        and (newer.payload->>'revision')::integer>(m.payload->>'revision')::integer
    )
  order by (m.payload->>'formId')::bigint desc limit p_limit
$$;
revoke all on function public.list_career_opportunity_reviews_v1(uuid,uuid,uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.list_career_opportunity_reviews_v1(uuid,uuid,uuid,bigint,integer) to service_role;
