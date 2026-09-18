-- Add the creator's canonical representative profile URL to the review read
-- model. Keep it at the end of the SQL view so existing dependent column order
-- remains stable; the Sheet contract decides where people see it.
create or replace view public.gtm_outreach_review_sheet_v1
with (security_invoker = true) as
select
  dispatch.id,
  dispatch.ref,
  creator.id as creator_id,
  creator.ref as creator_ref,
  creator.name as creator_name,
  directory.sheet_primary_platform as primary_platform,
  directory.sheet_primary_handle as primary_handle,
  dispatch.recipient_email,
  template.id as outreach_template_id,
  template.ref as outreach_template_ref,
  template.name as outreach_template_name,
  dispatch.template_version,
  collaboration.id as collaboration_id,
  collaboration.ref as collaboration_ref,
  collaboration.title as collaboration_title,
  plan.ref as plan_ref,
  plan.name as plan_name,
  dispatch.sender_email,
  dispatch.selection_reason,
  dispatch.personalization_evidence,
  dispatch.subject,
  dispatch.body,
  null::text as review_action,
  dispatch.review_note,
  dispatch.status,
  dispatch.approved_by,
  dispatch.approved_at,
  dispatch.scheduled_at,
  dispatch.attempt_count,
  dispatch.last_error,
  dispatch.sent_at,
  dispatch.replied_at,
  dispatch.provider_message_id,
  dispatch.provider_thread_id,
  dispatch.created_by,
  dispatch.created_at,
  dispatch.updated_at,
  dispatch.row_version,
  dispatch.archived_at,
  directory.sheet_primary_profile_url as primary_profile_url
from public.gtm_outreach_dispatches dispatch
join public.gtm_creators creator on creator.id = dispatch.creator_id
join public.gtm_outreach_templates template
  on template.id = dispatch.outreach_template_id
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_collaborations collaboration
  on collaboration.id = dispatch.collaboration_id
left join public.gtm_plans plan on plan.id = collaboration.plan_id;

revoke all on public.gtm_outreach_review_sheet_v1
  from public, anon, authenticated;

comment on view public.gtm_outreach_review_sheet_v1 is
  'Human email approval read model with creator identity, representative profile URL, exact message, and delivery state.';

notify pgrst, 'reload schema';
