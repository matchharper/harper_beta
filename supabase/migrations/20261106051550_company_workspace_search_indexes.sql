-- Substring lookup for Career search_companies. Homepage and published_name
-- are not search inputs. pg_trgm is already installed in public.
CREATE INDEX IF NOT EXISTS company_workspace_company_name_trgm_idx
  ON public.company_workspace USING gin (company_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_workspace_linkedin_url_trgm_idx
  ON public.company_workspace USING gin (linkedin_url public.gin_trgm_ops);
