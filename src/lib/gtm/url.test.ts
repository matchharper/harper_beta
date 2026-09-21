import assert from "node:assert/strict";
import test from "node:test";
import {
  GTM_CREATOR_DIRECTORY_SHEET_ID,
  buildGtmCreatorWorkspaceUrl,
  gtmQueryValue,
  isGtmRecordId,
  normalizeGtmRecordTab,
} from "./url";

const creatorId = "09d16b4c-6a71-4ce2-b436-87d65a889f71";

test("builds a durable creator conversation URL", () => {
  const url = new URL(
    buildGtmCreatorWorkspaceUrl({
      baseUrl: "https://matchharper.com/ops/gtm?source=slack",
      creatorId,
    })
  );
  assert.equal(url.pathname, "/ops/gtm");
  assert.equal(url.searchParams.get("source"), "slack");
  assert.equal(url.searchParams.get("sheet"), GTM_CREATOR_DIRECTORY_SHEET_ID);
  assert.equal(url.searchParams.get("creator"), creatorId);
  assert.equal(url.searchParams.get("creatorTab"), "conversation");
});

test("normalizes route values without accepting unsafe record identifiers", () => {
  assert.equal(gtmQueryValue(["contents", "info"]), "contents");
  assert.equal(normalizeGtmRecordTab("contents"), "contents");
  assert.equal(normalizeGtmRecordTab("../contents"), "conversation");
  assert.equal(isGtmRecordId(creatorId), true);
  assert.equal(isGtmRecordId("creator-1"), false);
});
