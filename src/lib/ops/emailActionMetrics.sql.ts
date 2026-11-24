// Read-only SQL behind the email action section of /ops/update-metrics.
// Parameters: $1 window start, $2 window end (timestamptz), $3 excluded email terms.
// People follow /ops/update-metrics: no deleted, @matchharper.com or excluded accounts.

import { TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST } from "@/lib/talentOnboarding/onboarding";
import { EMAIL_CHOICE_OPENED_EVENT } from "@/lib/career/emailChoiceDraft";
import { CAREER_REPLY_UNSEEN_TRIGGER } from "@/lib/career/background/unseenReply";

/** How long after an email an action still counts as a response to it. */
export const EMAIL_ACTION_WINDOW_HOURS = 72;

const INCLUDED_USERS = String.raw`
included_users as materialized (
  select users.user_id
  from public.talent_users users
  where users.deleted_at is null
    and split_part(lower(coalesce(users.email, '')), '@', 2) <> 'matchharper.com'
    and not exists (
      select 1
      from unnest(coalesce($3::text[], '{}'::text[])) term(value)
      where nullif(btrim(term.value), '') is not null
        and position(lower(btrim(term.value)) in lower(coalesce(users.email, ''))) > 0
    )
)`;

/**
 * One row per KST send day and email kind. Every email Harper sent a talent counts once; an action is the
 * person's reply email, a chat turn (typed or sent by a chat button, as in /ops/update-metrics) or a reaction to
 * an opportunity (feedback or a saved-stage change) within 72 hours after it. An email had buttons when its saved
 * Markdown holds a choice block with at least two choices, the same rule the renderer uses
 * (src/lib/career/choiceButtons.ts); their mailbox group follows src/lib/email/choiceLinks.ts.
 */
export const EMAIL_ACTION_DAILY_SQL = String.raw`
with ${INCLUDED_USERS},
emails as materialized (
  select
    mail.talent_id,
    mail.occurred_at,
    to_char(mail.occurred_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day,
    case
      when not exists (
        select 1
        from regexp_matches(
          coalesce(message.content, ''),
          '\[\[CAREER_CHOICE_BUTTONS\]\](.*?)\[\[/CAREER_CHOICE_BUTTONS\]\]',
          'g'
        ) block(parts)
        cross join lateral (select btrim(block.parts[1]) as payload) choice
        where case
          when not pg_input_is_valid(choice.payload, 'jsonb') then 0
          when jsonb_typeof(choice.payload::jsonb) = 'array' then jsonb_array_length(choice.payload::jsonb)
          when jsonb_typeof(choice.payload::jsonb -> 'choices') = 'array' then jsonb_array_length(choice.payload::jsonb -> 'choices')
          else 0
        end >= 2
      ) then 'plain'
      when split_part(lower(mail.to_email), '@', 2) in ('gmail.com', 'googlemail.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com')
        or split_part(lower(mail.to_email), '@', 2) ~ '^(outlook|hotmail|live)\.[a-z]{2,3}(\.[a-z]{2})?$'
        then 'choice_reply'
      else 'choice_web'
    end as kind
  from public.career_email_messages mail
  join included_users users on users.user_id = mail.talent_id
  left join public.talent_messages message on message.id = mail.talent_message_id
  where mail.direction = 'outbound'
    and mail.status = 'sent'
    and mail.occurred_at >= $1
    and mail.occurred_at < $2
),
responses as (
  select
    emails.day,
    emails.kind,
    emails.occurred_at + interval '${EMAIL_ACTION_WINDOW_HOURS} hours' > now() as open,
    exists (
      select 1
      from public.career_email_messages reply
      where reply.talent_id = emails.talent_id
        and reply.direction = 'inbound'
        and reply.occurred_at > emails.occurred_at
        and reply.occurred_at <= emails.occurred_at + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
    ) as email_reply,
    exists (
      select 1
      from public.talent_messages turn
      where turn.user_id = emails.talent_id
        and turn.role = 'user'
        and coalesce(turn.message_type, 'chat') in (
          'chat',
          '${TALENT_MESSAGE_TYPE_OPEN_POSITION_RECOMMENDATION_REQUEST}',
          'agent_introduction_action',
          'career_form_response'
        )
        and turn.created_at > emails.occurred_at
        and turn.created_at <= emails.occurred_at + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
    ) as chat,
    (
      exists (
        select 1
        from public.talent_opportunity_recommendation recommendation
        where recommendation.talent_id = emails.talent_id
          and recommendation.feedback_at > emails.occurred_at
          and recommendation.feedback_at <= emails.occurred_at + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
      )
      or exists (
        select 1
        from public.talent_progress progress
        where progress.talent_id = emails.talent_id
          and progress.kind = 'saved_stage_changed'
          and progress.created_at > emails.occurred_at
          and progress.created_at <= emails.occurred_at + interval '${EMAIL_ACTION_WINDOW_HOURS} hours'
      )
    ) as opportunity
  from emails
)
select
  day,
  kind,
  count(*)::int as emails,
  count(*) filter (where open)::int as "openEmails",
  count(*) filter (where email_reply or chat or opportunity)::int as acted,
  count(*) filter (where email_reply)::int as "emailReply",
  count(*) filter (where chat)::int as chat,
  count(*) filter (where opportunity)::int as opportunity
from responses
group by day, kind
order by day, kind`;

/** Web answer options opened from an email (the mailto ones open the person's mail app, out of our sight). */
export const EMAIL_CHOICE_WEB_OPENS_SQL = String.raw`
with ${INCLUDED_USERS}
select
  to_char(log.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') as day,
  count(*)::int as opens
from public.logs log
join included_users users on users.user_id = log.user_id
where log.type = 'career_${EMAIL_CHOICE_OPENED_EVENT}'
  and log.created_at >= $1
  and log.created_at < $2
group by 1
order by 1`;

/** Replies a person left unseen in Career (`career_reply_unseen`): how many the agent reviewed and how many it emailed.
 * Same people and window as the section above. */
export const EMAIL_UNSEEN_REPLY_SQL = String.raw`
with ${INCLUDED_USERS},
runs as (
  select run.id, run.created_at
  from public.opportunity_discovery_run run
  join included_users users on users.user_id = run.talent_id
  where run.trigger = '${CAREER_REPLY_UNSEEN_TRIGGER}'
)
select
  (select count(*)::int from runs where created_at >= $1 and created_at < $2) as reviewed,
  (select count(*)::int
    from public.talent_opportunity_delivery delivery
    join runs on runs.id = delivery.discovery_run_id
    where delivery.channel = 'email' and delivery.status = 'sent'
      and delivery.sent_at >= $1 and delivery.sent_at < $2) as sent`;
