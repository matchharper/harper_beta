import "server-only";

import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { gtmRead } from "../db.server";
import { cleanEmail, personKeys } from "./people";
import type { AgentPerson } from "./types";

/**
 * A LinkedIn profile's handle in the forms a stored link may have it (as written, decoded, encoded), lower case:
 * linkedin.com/in/jane-doe → jane-doe. Empty when the URL is not a LinkedIn profile.
 */
export function linkedinHandles(urls: ReadonlyArray<string | null | undefined>): string[] {
  const handles = new Set<string>();
  for (const url of urls) {
    const match = /(?:^|[/.])linkedin\.com\/in\/([^/?#\s]+)/i.exec(String(url ?? "").trim());
    if (!match) continue;
    const raw = match[1].toLowerCase();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw).toLowerCase();
    } catch {
      // keep as written
    }
    for (const handle of [raw, decoded, encodeURIComponent(decoded).toLowerCase()]) if (handle.length >= 3) handles.add(handle);
  }
  return [...handles];
}

/**
 * Everything the exclusion rules need about one person, read in one go (item 11 of the 11/17 review):
 * - member: a Harper account with this email, or with this LinkedIn profile among its links (talent_users.resume_links,
 *   where the member's LinkedIn URL is kept), so a member known to #5 by another address is still a member;
 * - last_mailed: the latest #4 / #5 mail to the address, or Harper's company intro mail to it
 *   (external_intro_requests.recipient_email; the run applies the same 30 days, RECENT_CONTACT_DAYS);
 * - last_ended / active_elsewhere / opted_out: by every key the person may be known by (email and profile) and by the
 *   address on any other #5 row.
 */
export async function exclusionFacts(person: AgentPerson) {
  const email = cleanEmail(person.email);
  const keys = [...new Set([person.personKey, ...personKeys({ email, profileUrl: person.profileUrl })])];
  const handles = linkedinHandles([person.profileUrl, person.contactUrl, person.personKey.replace(/^url:/, "")]);
  const likePatterns = handles.map((handle) => `%linkedin.com/in/${handle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  const [facts] = await gtmRead((sql) => {
    // Another #5 row for the same person: by any of their keys, or by the address it found later.
    const samePerson = email
      ? sql`(p.person_key = any(${keys}::text[]) or lower(p.email) = ${email})`
      : sql`p.person_key = any(${keys}::text[])`;
    return sql<Array<{
      member: boolean; suppressed: boolean; last_mailed: string | Date | null; last_ended: string | Date | null; active_elsewhere: boolean;
      opted_out: boolean;
    }>>`
    select
      (${email ? sql`exists (select 1 from public.talent_users t where lower(t.email) = ${email} and t.deleted_at is null)` : sql`false`}
        or ${handles.length ? sql`exists (select 1 from public.talent_users t
          where t.deleted_at is null and array_to_string(t.resume_links, ' ') ilike any(${likePatterns}::text[])
            and exists (select 1 from unnest(t.resume_links) link
              where substring(lower(link) from 'linkedin\\.com/in/([^/?#[:space:]]+)') = any(${handles}::text[])))` : sql`false`}
      ) as member,
      ${email ? sql`exists (select 1 from public.external_contact_suppressions s where s.email_hash = ${externalEmailHash(email)})` : sql`false`} as suppressed,
      ${email ? sql`greatest(
        (select max(m.created_at) from public.gtm_mails m where m.audience = 'candidate' and m.to_email = ${email}
          and m.status in ('sending', 'sent') and (m.agent_person_id is null or m.agent_person_id <> ${person.id}::uuid)),
        (select max(e.invited_at) from public.external_intro_requests e where lower(btrim(e.recipient_email)) = ${email})
      )` : sql`null::timestamptz`} as last_mailed,
      (select max(p.ended_at) from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid) as last_ended,
      exists (select 1 from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid
        and p.status in ('matched', 'drafted', 'approved', 'sent', 'replied')) as active_elsewhere,
      -- "연락 그만" on any earlier cycle (a person known only by profile has no address on the shared list).
      exists (select 1 from public.gtm_agent_people p where ${samePerson} and p.id <> ${person.id}::uuid
        and p.events @> '[{"kind": "unsubscribed"}]'::jsonb) as opted_out
  `;
  });
  return facts;
}
