import assert from "node:assert/strict";
import test from "node:test";
import { shouldAnimateOrganizationSidebarEntry } from "@/lib/org/sidebarTransition";

test("animates when entering the Organization sidebar", () => {
  assert.equal(shouldAnimateOrganizationSidebarEntry(null), true);
  assert.equal(shouldAnimateOrganizationSidebarEntry("/org/home"), true);
  assert.equal(shouldAnimateOrganizationSidebarEntry("/org/jobs"), true);
});

test("does not replay while navigating inside the Organization sidebar", () => {
  assert.equal(shouldAnimateOrganizationSidebarEntry("/org/member"), false);
  assert.equal(shouldAnimateOrganizationSidebarEntry("/org/team"), false);
  assert.equal(shouldAnimateOrganizationSidebarEntry("/org/settings"), false);
});
