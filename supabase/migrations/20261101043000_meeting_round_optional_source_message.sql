-- A meeting request may start from a web button, not only from a company chat
-- message. The web Accept Intro with a booking link and the web interview
-- request create the draft with no source message
-- (src/lib/meetings/scheduleDraftServer.ts createMeetingScheduleDraft, which
-- uses webRequestKey for idempotency instead), but production still rejected
-- the empty value, so every such web request failed with a not-null error.
--
-- Every reader already handles an empty source:
-- - create_meeting_schedule_draft_v1 checks workspace ownership only when set
-- - list_company_contact_index_v1 left joins it and falls back to the
--   invitation's created_at; the requester comes from organizer_company_user_id
-- - notifyCompanyOfMeetingConfirmation takes the Role from meeting_schedules
--
-- The foreign key to company_messages stays as it is.
alter table public.meeting_schedule_rounds
  alter column source_company_message_id drop not null;
