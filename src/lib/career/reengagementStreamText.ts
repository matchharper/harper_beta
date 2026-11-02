import { TALENT_ONBOARDING_DONE_MARKER } from "@/lib/talentOnboarding/completion";
import { CAREER_SESSION_START_NO_MESSAGE_MARKER } from "./noMessageContent";
import {
  CAREER_REENGAGEMENT_ACTIONS_START,
  stripCareerReengagementActions,
} from "./reengagementActions";

/** Hide protocol metadata even when a provider splits a marker across tokens. */
export function visibleReengagementStreamText(raw: string) {
  const markerCandidate = raw
    .trim()
    .replace(/^[`"'“”]+|[`"'“”.。]+$/g, "")
    .trim();
  if (CAREER_SESSION_START_NO_MESSAGE_MARKER.startsWith(markerCandidate))
    return "";

  let content = raw.replaceAll(TALENT_ONBOARDING_DONE_MARKER, "");
  for (const marker of [
    CAREER_REENGAGEMENT_ACTIONS_START,
    TALENT_ONBOARDING_DONE_MARKER,
  ]) {
    for (
      let length = Math.min(marker.length - 1, content.length);
      length > 0;
      length--
    ) {
      if (content.endsWith(marker.slice(0, length))) {
        content = content.slice(0, -length);
        break;
      }
    }
  }
  return stripCareerReengagementActions(content);
}
