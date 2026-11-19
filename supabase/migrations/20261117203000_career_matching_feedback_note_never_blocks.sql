-- A failure to record a reaction in a matching note must not roll back the reaction.
create or replace function public.record_career_matching_feedback_note() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_matching uuid;
  v_label text;
  v_change text;
begin
  if new.feedback is not distinct from old.feedback and new.saved_stage is not distinct from old.saved_stage then
    return new;
  end if;
  -- A Harper-connected company can be confidential; name only public employers.
  select coalesce(nullif(btrim(r.name), ''), 'role') || case when r.source_type = 'internal' then ' (Harper-connected role)'
      else coalesce(' at ' || nullif(btrim(w.company_name), ''), '') end
    into v_label
  from public.company_roles r left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
  where r.role_id = new.role_id;
  v_change := concat_ws('; ',
    case when new.feedback is distinct from old.feedback then
      case new.feedback
        when 'like' then 'liked' when 'positive' then 'liked'
        when 'dislike' then 'disliked' when 'negative' then 'disliked'
        when 'keep' then 'kept for later'
        else 'cleared their reaction' end
    end,
    case when new.saved_stage is distinct from old.saved_stage and new.saved_stage is not null then 'marked ' || new.saved_stage end);
  if nullif(v_change, '') is null and new.feedback_reason is not distinct from old.feedback_reason then return new; end if;
  v_change := coalesce(nullif(v_change, ''), 'gave a reason for') || ' ' || coalesce(v_label, new.role_id::text)
    || case when new.feedback_reason is distinct from old.feedback_reason and nullif(btrim(new.feedback_reason), '') is not null
      then ' (reason: ' || new.feedback_reason || ')' else '' end;
  for v_matching in
    select distinct m.matching_id from public.talent_opportunity_memberships m
    where m.talent_id = new.talent_id and m.role_id = new.role_id and m.matching_id is not null
  loop
    begin
      perform public.append_career_matching_note_v1(new.talent_id, v_matching, null, 'user', 'User ' || v_change || '.');
    exception when others then
      -- The note is a record of the reaction; it must never block saving the reaction itself.
      raise warning 'matching note not recorded for %: %', v_matching, sqlerrm;
    end;
  end loop;
  return new;
end $$;
