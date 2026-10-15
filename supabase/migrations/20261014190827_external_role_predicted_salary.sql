set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.company_roles add column salary_is_predicted boolean not null default false;
comment on column public.company_roles.salary_is_predicted is 'Inferred annual KRW base pay for retrieval only. Exclude from LLM/public compensation facts.';
