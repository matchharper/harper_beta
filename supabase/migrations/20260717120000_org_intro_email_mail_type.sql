alter table public.career_email_messages
  drop constraint if exists career_email_messages_mail_type_check;

alter table public.career_email_messages
  add constraint career_email_messages_mail_type_check
  check (
    mail_type = any (
      array[
        'onboarding',
        'onboarding_review',
        'onboarding_profile_ingestion_failed',
        'existing_user_login',
        'sign_up_followup',
        'sign_up_followup_reply',
        'user_reply',
        'auto_reply',
        'opportunity_recommendation',
        'manual_ops',
        'org_intro',
        'other'
      ]::text[]
    )
  );
