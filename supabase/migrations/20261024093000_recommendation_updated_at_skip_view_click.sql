-- updated_at is the revision that accept and feedback RPCs compare against the screen.
-- First view/click stamps are not decisions, so they must not make that revision stale.
-- Runs from trigger talent_opportunity_recommendation_set_updated_at (before update).
create or replace function public.set_talent_opportunity_recommendation_updated_at()
returns trigger language plpgsql as $$
begin
  if (old.viewed_at is distinct from new.viewed_at
      or old.clicked_at is distinct from new.clicked_at)
     and (to_jsonb(new) - array['viewed_at', 'clicked_at', 'updated_at'])
       = (to_jsonb(old) - array['viewed_at', 'clicked_at', 'updated_at']) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;
