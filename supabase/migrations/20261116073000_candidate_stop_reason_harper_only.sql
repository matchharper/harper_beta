-- A candidate's own stop reason stays with Harper (owner decision, 2026-11-16).
--
-- When a candidate stops the process from the Career position tab,
-- change_internal_talent_opportunity_decision (5 arguments) writes an
-- org_stage_change progress row with metadata.stopNote, and the BEFORE trigger
-- set_talent_progress_audiences_v1 writes that row's shared text, which the
-- company screen and the company-side LLM (read_talent recent progress) read.
-- That text carried the candidate's note ("\n이유: <note>"). From now on it says
-- only that the candidate asked to stop. metadata.stopNote is kept for the
-- candidate's own Harper; what the candidate wants the company to know reaches
-- it only as the candidate's Harper letter (agent_contact_messages).
--
-- Only the candidate-stop branch changes. A company's own stop or acceptance
-- keeps its reason in the text exactly as before. The live definition is
-- edited in place, like 20261111050000, so nothing else in the function
-- changes; the migration stops (nothing changes) unless the candidate-stop
-- suffix appears exactly once. Existing rows keep their text until the
-- separate backfill (run by an operator) refreshes them.
do $$
declare
  definition text;
  suffix constant text := $pattern$(then '후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다\.')\s*\|\|\s*case\s+when\s+nullif\(btrim\(new\.metadata\s*->>\s*'stopNote'\),\s*''\)\s+is\s+not\s+null\s+then\s+E'\\n이유: '\s*\|\|\s*btrim\(new\.metadata\s*->>\s*'stopNote'\)\s+else\s+''\s+end$pattern$;
  matches integer;
begin
  definition := pg_get_functiondef('public.set_talent_progress_audiences_v1()'::regprocedure);
  matches := (select count(*) from regexp_matches(definition, suffix, 'g'));
  if matches = 0 and position('후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다.' in definition) > 0 then
    -- Already applied (a re-run): the candidate-stop text has no suffix.
    return;
  end if;
  if matches <> 1 then
    raise exception 'candidate_stop_text_changed: the candidate-stop reason suffix appears % times in set_talent_progress_audiences_v1; re-read the live definition', matches;
  end if;
  execute regexp_replace(definition, suffix, '\1');
end $$;
