ALTER TABLE public.company_workspace
  ADD COLUMN estimated_search_score double precision;

COMMENT ON COLUMN public.company_workspace.estimated_search_score IS
  'Cached Decisions estimate of public prominence (0–20) for company-name search ordering. Refreshed with company_data; independent of manual test_score.';
