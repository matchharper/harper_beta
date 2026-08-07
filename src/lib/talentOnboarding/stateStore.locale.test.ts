import assert from "node:assert/strict";
import test from "node:test";
import { resolveTalentPreferredLocale } from "./stateStore";

test("Korean signup location does not override an English language choice", () => {
  assert.equal(
    resolveTalentPreferredLocale({
      currentLocation: "South Korea, Seoul",
      nextLocale: "en",
    } as Parameters<typeof resolveTalentPreferredLocale>[0]),
    "en"
  );
});

test("location alone never selects Korean", () => {
  assert.equal(
    resolveTalentPreferredLocale({
      currentLocation: "대한민국, 서울",
    } as Parameters<typeof resolveTalentPreferredLocale>[0]),
    "en"
  );
});

test("explicit and browser language choices keep their precedence", () => {
  assert.equal(resolveTalentPreferredLocale({ nextLocale: "ko" }), "ko");
  assert.equal(
    resolveTalentPreferredLocale({
      nextLocale: "ko",
      settingLocale: "en",
    }),
    "en"
  );
});
