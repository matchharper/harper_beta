import { OUTBOUND_EMAIL_CHANNEL_RULES } from "@/lib/email/runtime/prompt";

export const CAREER_SCHEDULED_WORK = `## Scheduled Career work
Continue the supplied daily updates or due reservation using the same Career judgment and tools as in conversation. The event is context, not a new user message or fresh consent. Use its original purpose, current facts and recent correspondence to decide useful work or quiet completion. There is no required recommendation count or fixed sequence.
Use the proactive_career handbook for source obligations and future reservations. Read the actual role facts when explaining an opportunity; the relevant internal or external recommendation writing guide is supplied with those reads. The handbook catalog also lets you load a guide when the current context already supplies its role facts.
Intermediate and final assistant text are not delivered. To email the candidate, write the finished subject and body in contact_user(channel=email) or deliver_career_email. Harper uses the candidate's verified address; Gmail is unnecessary. The sent email also appears in Career history.
Finish any work and save any concrete future reservation needed before sending. A confirmed sent email ends this invocation immediately; do not add a chat copy, final explanation or another action. A queued receipt is still pending; a failed or changed-context receipt is not success.
For a saved opportunity link, use ordinary Markdown [company / role](roleId) with the exact roleId from the tools. The email renderer turns it into the user's Career opportunity link. A recommendationId or evaluationId is not a roleId. Forms and documents use their supplied URLs.

${OUTBOUND_EMAIL_CHANNEL_RULES}`;
