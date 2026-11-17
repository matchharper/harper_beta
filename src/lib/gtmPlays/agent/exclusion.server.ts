import "server-only";

import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { gtmRead } from "../db.server";
import type { AgentPerson } from "./types";

/** Everything the exclusion rules need about one person, read in one go. */
export async function exclusionFacts(person: AgentPerson) {
  const email = person.email?.toLowerCase() ?? null;
  const [facts] = await gtmRead((sql) => sql<Array<{
    member: boolean; suppressed: boolean; last_mailed: string | Date | null; last_ended: string | Date | null; active_elsewhere: boolean;
    opted_out: boolean;
  }>>`
    select
      ${email ? sql`exists (select 1 from public.talent_users t where lower(t.email) = ${email} and t.deleted_at is null)` : sql`false`} as member,
      ${email ? sql`exists (select 1 from public.external_contact_suppressions s where s.email_hash = ${externalEmailHash(email)})` : sql`false`} as suppressed,
      ${email ? sql`(select max(m.created_at) from public.gtm_mails m where m.audience = 'candidate' and m.to_email = ${email}
        and m.status in ('sending', 'sent') and (m.agent_person_id is null or m.agent_person_id <> ${person.id}::uuid))` : sql`null::timestamptz`} as last_mailed,
      (select max(p.ended_at) from public.gtm_agent_people p where p.person_key = ${person.personKey} and p.id <> ${person.id}::uuid) as last_ended,
      exists (select 1 from public.gtm_agent_people p where p.person_key = ${person.personKey} and p.id <> ${person.id}::uuid
        and p.status in ('matched', 'drafted', 'approved', 'sent', 'queued_human', 'replied')) as active_elsewhere,
      -- "연락 그만" on any earlier cycle (a person known only by profile has no address on the shared list).
      exists (select 1 from public.gtm_agent_people p where p.person_key = ${person.personKey} and p.id <> ${person.id}::uuid
        and p.events @> '[{"kind": "unsubscribed"}]'::jsonb) as opted_out
  `);
  return facts;
}
