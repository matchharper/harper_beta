ALTER TABLE public.company_workspace
ADD COLUMN IF NOT EXISTS published_name text;

COMMENT ON COLUMN public.company_workspace.published_name IS
  'Public-safe company name shown to candidates for internal roles. If empty, internal tools use an undisclosed-company fallback.';

WITH aliases(company_name, published_name) AS (
  VALUES
    ('Blockit AI', 'Sequoia-backed Consumer AI Agent'),
    ('Endo Health', 'Healthtech growth company'),
    ('Harper', 'Harper'),
    ('Mel', 'Real-time multimodal B2C AI company'),
    ('Mistral AI', 'World-leading open-weight AI lab'),
    ('OptimizerAI', 'AI research company'),
    ('Patlytics', 'Top-tier VC-backed AI Legal Tech'),
    ('Pickle', 'Real-time multimodal AI company'),
    ('Solomon', 'Enterprise AI company'),
    ('SBVA', '$2B AI-first Asia VC'),
    ('Stadium Live Studios', 'Consumer community and growth company'),
    ('Wonderful', 'Hypergrowth $2B Agentic AI company')
)
UPDATE public.company_workspace workspace
SET
  published_name = aliases.published_name,
  updated_at = timezone('utc', now())
FROM aliases
WHERE workspace.company_name = aliases.company_name
  AND NULLIF(btrim(workspace.published_name), '') IS NULL;
