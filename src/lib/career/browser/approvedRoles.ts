import { responsesIn } from "@/lib/shareLinks/approvedLink.server";
import { looksLikeApplicationStart } from "@/lib/shareLinks/formGuard";

/**
 * #14: the roles of a submission that the referenced answers did not choose. A start form of delegated applications
 * approves only the postings left selected in its list (apply_postings); any other referenced form answer approves the
 * roles its form is tied to. 11/26 local test: two postings had closed, and Harper went on to prepare postings the
 * person never chose, one of them at the same company. A chat message is the person's own words as Harper reads them,
 * so a submission it authorizes is not checked here, and neither is one whose answers carry no postings list.
 */
export function rolesNotChosen(roleRefs: string[], authorization: { payload: unknown }[]): string[] {
  const chosen = new Set<string>();
  let listed = false;
  for (const message of authorization) {
    const responses = responsesIn(message.payload);
    if (!responses.length) return [];
    for (const response of responses) {
      const postings = looksLikeApplicationStart(response.formSnapshot) ? response.values.apply_postings : undefined;
      if (Array.isArray(postings)) {
        listed = true;
        for (const id of postings) chosen.add(String(id));
      } else for (const ref of response.formSnapshot.relatedRefs ?? []) if (ref.type === "role") chosen.add(String(ref.id));
    }
  }
  return listed ? [...new Set(roleRefs)].filter((id) => !chosen.has(id)) : [];
}
