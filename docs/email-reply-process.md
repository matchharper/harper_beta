# Email Reply Process

## Scope

This flow is shared by:

- career email onboarding mail
- opportunity delivery mail from `new_harper_agent`
- opportunity delivery mail from `scripted_human_opportunity_agent`
- other opportunity agents that send through `opp.autonomous_tool_agent.deliver_email()`

Opportunity delivery is reply-capable when `deliver_email()` creates a `reply+token@reply.matchharper.com` alias, stores the token hash in `email_reply_aliases`, and sends the outbound email with Resend `reply_to`.

If `conversation_id` is missing, the alias is still created with `conversation_id = null`; the email reply worker resolves the user from the alias and then attaches the reply to the latest conversation or creates one. If `EMAIL_REPLY_DOMAIN` or `EMAIL_REPLY_TOKEN_SECRET` is missing, opportunity delivery refuses to send instead of silently sending without `Reply-To`, because replies would otherwise go to the visible sender address instead of the email reply worker.

## Runtime Flow

1. Outbound email sender creates a reply alias.
   - App onboarding path: `src/lib/email/inbound.ts#createEmailReplyAlias`
   - New Harper opportunity path: `opp/utils/new_delivery_transport.py#get_or_create_email_reply_alias`
   - Worker opportunity path: `opp/autonomous_tool_agent.py#get_or_create_email_reply_alias`
   - Alias format: `reply+<token>@reply.matchharper.com`
   - DB row: `email_reply_aliases(token_hash, talent_id, conversation_id)`

2. Resend sends the outbound email.
   - Resend payload includes `reply_to` when an alias was created.
   - The visible sender can still be `Harper <hello@matchharper.com>`.

3. User replies to the alias.
   - Resend Receiving must be configured for `reply.matchharper.com`.
   - Resend posts `email.received` to `src/app/api/internal/email/resend/route.ts`.

4. The Next.js webhook stores the inbound event and queues work.
   - `src/lib/email/inbound.ts#ingestResendInboundEvent`
   - DB rows:
     - `email_inbound_events`
     - `email_reply_jobs(status='queued')`

5. Worker claims and processes jobs.
   - Command: `python email_reply_worker.py poll`
   - Claim function: `claim_email_reply_jobs(...)`
   - Worker file: `harper_worker/email_reply/worker.py`

6. Worker resolves identity.
   - If job already has `talent_id`, use it.
   - If recipient matches an active onboarding `career_email_onboarding_leads.reply_alias`, use that lead.
   - Else parse `reply+token`, HMAC it with `EMAIL_REPLY_TOKEN_SECRET`, and match `email_reply_aliases`.
   - Else fall back to `talent_users.email`.

7. Worker writes the inbound user message into `talent_messages`.

8. Worker decides response path.
   - If the conversation belongs to active career email onboarding, `email_reply/onboarding.py` handles the scripted onboarding state machine.
   - Otherwise, it calls the generic LLM reply path.

9. Worker sends the reply through Resend.
   - The reply keeps the same alias as `reply_to` when possible.
   - Job status becomes `sent`; `skip_reason` and `last_error` are cleared on success.

## Generic Email Reply LLM

This is the path used for normal replies, including replies to opportunity delivery emails once they are not part of the onboarding state machine.

Code:

- Config: `harper_worker/email_reply/config.py`
- Client: `harper_worker/email_reply/llm.py`
- Prompt assembly: `harper_worker/email_reply/prompt.py`
- Tool definitions: `harper_worker/email_reply/tools.py`

Model selection:

- `EMAIL_REPLY_MODEL`
- fallback: `OPP_DELIVERY_COPY_MODEL`
- fallback: `claude-sonnet-4-6`

Provider selection:

- model starts with `claude-`: Anthropic-compatible endpoint, requires `ANTHROPIC_API_KEY`
- model starts with `grok-`: xAI OpenAI-compatible endpoint, requires `GROK_API_KEY`
- otherwise: OpenAI endpoint, requires `OPENAI_API_KEY`

Generation parameters:

- `temperature`: `EMAIL_REPLY_TEMPERATURE`, default `0.35`
- timeout: `EMAIL_REPLY_LLM_TIMEOUT_SEC`, default `60`
- max tool-call turns: up to `4`
- no explicit `max_tokens` is currently passed for this generic reply call
- tools: `update_talent_profile`, auto-selected by model

Input messages:

- `system`: Harper identity, tone, safety, and tool-use rules
- `user`: one compact text block containing:
  - identity resolution source
  - talent profile: name, email, headline, location, bio, resume text
  - talent settings/preferences
  - latest talent insights
  - experiences
  - educations
  - extras
  - recent Harper conversation, default last `12` messages
  - inbound email from/subject/message id
  - stripped inbound body, default max `8,000` chars
  - earlier visible email thread content, default max `16,000` chars before compaction

The prompt explicitly tells the model not to invent job-search results, company research, application status, or private data. The email worker has no search tool, so if the user asks for new company/job research by email, it should briefly explain the limitation and answer only the part it can answer.

## Opportunity Delivery LLMs

`scripted_human_opportunity_agent` has its own LLM calls before the outbound opportunity email is sent. Those calls generate and critique the recommendation email. They are separate from the inbound email reply worker.

Defaults:

| Step | Default model | Temperature | Max tokens | Purpose |
| --- | --- | ---: | ---: | --- |
| `policy_search_plan` | `grok-4-1-fast-reasoning` | `0.2` | `3072` | choose communication act, copy shape, counts, search plan |
| `shortlist` | `grok-4-1-fast-reasoning` | `0.1` | `2048` | choose candidate role IDs for detailed final writing |
| `final_delivery` | `claude-sonnet-4-6` | `0.55` | `8192` | write the final Korean email/chat draft |
| `copy_critic` | `grok-4-1-fast-reasoning` | `0.0` | `2048` | review tone, repetition, factuality, ask overload |

Each value can be overridden through the matching `OPP_HUMAN_SCRIPTED_*` environment variable in `harper_worker/opp/scripted_human_config.py`.

## Required Environment

For outbound aliases and inbound replies:

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_REPLY_FROM_EMAIL` or `RESEND_FROM_EMAIL`
- `EMAIL_REPLY_DOMAIN=reply.matchharper.com`
- `EMAIL_REPLY_TOKEN_SECRET`
- `DATABASE_URL`
- `WORKER_DB_ROLE=harper_worker` when using a privileged database URL

For the generic email reply LLM:

- `ANTHROPIC_API_KEY` if using `claude-*`
- `GROK_API_KEY` if using `grok-*`
- `OPENAI_API_KEY` otherwise
