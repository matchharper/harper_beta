-- gtm agent blocked companies (Shaun 11/24, incident #134): a person whose address or current company is on Ops' blocked
-- domains (settings.signals.blockedDomains: recruiting platforms, search firms, HR companies) is excluded as
-- 'blocked_company' (agent/exclusion.server.ts). Additive only: the code before it never writes the new value.
alter table public.gtm_agent_people drop constraint if exists gtm_agent_people_exclude_reason_check;
alter table public.gtm_agent_people add constraint gtm_agent_people_exclude_reason_check
  check (exclude_reason in (
    'member', 'recent_contact', 'quiet_after_end', 'suppressed', 'internal', 'duplicate', 'stale_signal',
    'not_job_seeking', 'no_lookup_source', 'lookup_not_found', 'lookup_other_person', 'lookup_skipped', 'no_email',
    'no_mx', 'giver', 'blocked_company'
  ));
