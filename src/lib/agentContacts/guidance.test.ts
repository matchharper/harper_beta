import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_COLLABORATION_GUIDE } from "./guidance";
import { buildCareerToolPolicyPrompt } from "@/lib/career/prompts/toolPolicyPrompt";
import { getCompanyPolicy } from "@/lib/org/agent/capabilities/policies";

test("both sides' agent messaging carries the same sharing boundary", () => {
  assert.match(AGENT_COLLABORATION_GUIDE, /confirm with your user unless they have clearly asked you to pass it on/);

  for (const backgroundInvocation of [false, true]) {
    const career = buildCareerToolPolicyPrompt({ channel: "chat", backgroundInvocation, preferredLocale: "ko", toolNames: ["contact_company"] });
    assert.ok(career.includes(AGENT_COLLABORATION_GUIDE), `background=${backgroundInvocation}`);
  }

  for (const surface of ["chat", "slack"] as const)
    assert.ok(getCompanyPolicy("agent_correspondence", surface).includes(AGENT_COLLABORATION_GUIDE), surface);
});
