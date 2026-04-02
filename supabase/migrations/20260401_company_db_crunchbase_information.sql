alter table public.company_db
  add column if not exists last_crunchbase_updated_at timestamptz,
  add column if not exists crunchbase_information jsonb;

