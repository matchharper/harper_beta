insert into public.translation_entries (
  namespace,
  key,
  locale,
  value,
  status,
  updated_by
)
values (
  'career',
  'career.onboarding.onboarding_loading_state.profile_context',
  'en',
  'Analyzing experience and interests',
  'draft',
  'migration:update-onboarding-loading-profile-context'
)
on conflict (namespace, key, locale)
do update set
  value = excluded.value,
  status = excluded.status,
  updated_by = excluded.updated_by,
  updated_at = timezone('utc', now());
