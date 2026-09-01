import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnownFutureMatchingInsightsSection,
  buildMatchedInternalRoleCompanyIndexSection,
} from "./conversationSections";

test("does not mark an already saved good-to-remember insight as empty", () => {
  const section = buildKnownFutureMatchingInsightsSection({
    content: {
      external_delivery_selectivity:
        "확실히 잘 맞는 외부 기회만 선별해서 추천받고 싶어합니다.",
      next_scope: "다음 역할로 제품 리더십 범위를 넓히고 싶어합니다.",
    },
    quoteKeys: true,
  });

  assert.doesNotMatch(section, /external_delivery_selectivity : empty/);
  assert.match(section, /matching_preference : empty/);
});

test("omits good-to-remember nudges when both values are already saved", () => {
  const section = buildKnownFutureMatchingInsightsSection({
    content: {
      external_delivery_selectivity:
        "확실히 잘 맞는 외부 기회만 선별해서 추천받고 싶어합니다.",
      matching_preference:
        "제품 책임 범위가 넓은 역할을 추천에 반영해주길 원합니다.",
    },
  });

  assert.doesNotMatch(section, /## Good to remember insights/);
});

test("matched internal company index is conditional and contains no role state", () => {
  assert.equal(buildMatchedInternalRoleCompanyIndexSection([]), "");

  const section = buildMatchedInternalRoleCompanyIndexSection([
    { company: "Example AI", roleCount: 2 },
  ]);
  assert.match(section, /Example AI: 2 active role/);
  assert.match(section, /matchedOnly=true/);
  assert.doesNotMatch(section, /hold|reason|score|recommend=false/i);
});
