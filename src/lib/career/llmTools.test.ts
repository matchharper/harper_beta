import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES,
  getCareerRealtimeToolCandidates,
} from "./llmTools";
import { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";

test("post-onboarding voice can apply confirmed recommendation settings", () => {
  assert.ok(
    CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES.includes(
      TALENT_TOOL_NAMES.UPDATE_SETTING
    )
  );
  assert.ok(
    CAREER_REALTIME_VOICE_POST_ONBOARDING_TOOL_NAMES.includes(
      TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE
    )
  );

  const names = getCareerRealtimeToolCandidates("ko").map(
    (tool) => tool.name
  );
  assert.ok(names.includes(TALENT_TOOL_NAMES.UPDATE_SETTING));
  assert.ok(names.includes(TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE));
});
