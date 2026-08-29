import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchingRecommendationDeliveryKey,
  getEarliestMatchingViewedAt,
} from "./matchingViewedAt";

test("keys recommendation email opens by both talent and discovery run", () => {
  assert.equal(
    buildMatchingRecommendationDeliveryKey("talent-1", "run-1"),
    "talent-1:run-1"
  );
  assert.equal(buildMatchingRecommendationDeliveryKey("talent-1", null), "");
});

test("uses the earliest valid app or email view timestamp", () => {
  assert.equal(
    getEarliestMatchingViewedAt(
      "2026-08-27T03:00:00.000Z",
      "2026-08-27T02:00:00.000Z"
    ),
    "2026-08-27T02:00:00.000Z"
  );
  assert.equal(
    getEarliestMatchingViewedAt(null, "2026-08-27T02:00:00.000Z"),
    "2026-08-27T02:00:00.000Z"
  );
  assert.equal(getEarliestMatchingViewedAt("invalid", null), null);
});
