-- Run this only if the earlier org_candidate_decision_claims SQL was already
-- applied. It is safe to run when none of these objects exist.

begin;

drop function if exists public.begin_org_candidate_decision_v1(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
);

drop function if exists public.complete_org_candidate_decision_v1(
  uuid,
  text,
  text,
  jsonb,
  text,
  text,
  text
);

drop function if exists public.fail_org_candidate_decision_v1(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
);

drop table if exists public.org_candidate_decision_claims;

commit;
