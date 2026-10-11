-- A lost HTTP response must not cause the same company onboarding submission
-- to run the company-side LLM and update company information a second time.
create unique index company_messages_onboarding_submission_uidx
  on public.company_messages (
    company_workspace_id,
    company_user_id,
    (metadata->>'onboardingSubmissionId')
  )
  where role = 'user'
    and metadata->>'source' = 'org_onboarding_company'
    and metadata->>'onboardingSubmissionId' is not null;
