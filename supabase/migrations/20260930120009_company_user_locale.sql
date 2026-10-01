alter table public.company_users
  add column locale text;

alter table public.company_users
  add constraint company_users_locale_check
  check (locale is null or locale in ('ko', 'en'));

comment on column public.company_users.locale is
  'Company member UI and company-side LLM reply language; null until the member opens /org.';
