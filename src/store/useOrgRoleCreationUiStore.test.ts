import assert from "node:assert/strict";
import test from "node:test";
import {
  ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
  ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT,
  normalizeOrgRoleChatPanelWidthPct,
} from "@/store/useOrgRoleCreationUiStore";

test("normalizes persisted org role chat panel widths", () => {
  assert.equal(
    normalizeOrgRoleChatPanelWidthPct(undefined),
    ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT
  );
  assert.equal(
    normalizeOrgRoleChatPanelWidthPct(10),
    ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT
  );
  assert.equal(
    normalizeOrgRoleChatPanelWidthPct(90),
    ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT
  );
  assert.equal(normalizeOrgRoleChatPanelWidthPct(46.123), 46.12);
});
