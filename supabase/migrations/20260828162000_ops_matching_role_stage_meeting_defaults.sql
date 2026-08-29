begin;

alter table public.ops_matching_role_stages
  add column if not exists meeting_purpose text,
  add column if not exists meeting_duration_minutes integer,
  add column if not exists meeting_candidate_message text;

alter table public.ops_matching_role_stages
  drop constraint if exists ops_matching_role_stages_meeting_purpose_length_check,
  drop constraint if exists ops_matching_role_stages_meeting_duration_check,
  drop constraint if exists ops_matching_role_stages_meeting_details_pair_check,
  drop constraint if exists ops_matching_role_stages_meeting_candidate_message_length_check;

alter table public.ops_matching_role_stages
  add constraint ops_matching_role_stages_meeting_purpose_length_check
    check (meeting_purpose is null or char_length(meeting_purpose) between 1 and 600),
  add constraint ops_matching_role_stages_meeting_duration_check
    check (
      meeting_duration_minutes is null
      or (meeting_duration_minutes between 15 and 240 and meeting_duration_minutes % 15 = 0)
    ),
  add constraint ops_matching_role_stages_meeting_details_pair_check
    check (
      (meeting_purpose is null) = (meeting_duration_minutes is null)
    ),
  add constraint ops_matching_role_stages_meeting_candidate_message_length_check
    check (
      meeting_candidate_message is null
      or char_length(meeting_candidate_message) <= 2000
    );

commit;
