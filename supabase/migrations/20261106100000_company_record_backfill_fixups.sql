-- Fixes to the decision record backfill (20261105150000), run after it.
--
-- 1. The backfill copied company stage changes from talent_progress. Before
--    decisionChannel existed, the move that follows a candidate's yes to a
--    company intro request was written with the requester as company user, so
--    it was copied as a company stage change (channel unknown). It is not a
--    company decision. Its progress id comes from the intro card
--    (buildOrgIntroProgressId in src/lib/org/server.ts), so these copies are
--    found by id and removed. Live rows and other backfilled rows stay.
-- 2. The Pass/request copy is run again, to pick up rows the previous web
--    version wrote after the decision record was deployed. It adds nothing
--    that is already there.

delete from public.company_decision_events event
using public.company_intro_candidates intro
where event.detail->>'backfill' = 'true'
  and event.action in ('stage_change', 'stop')
  and event.role_id = intro.role_id
  and event.subject_id = intro.talent_id
  and event.idempotency_key = 'progress:' || overlay(overlay(
    left(encode(sha256(convert_to('org-intro-progress:' || intro.id::text, 'UTF8')), 'hex'), 32)
    placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid::text;

select public.backfill_company_intro_decisions_from_progress_v1();
