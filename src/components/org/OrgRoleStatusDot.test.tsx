import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";

test("uses one shared color mapping for role lifecycle dots", () => {
  const expectedClassByStatus = {
    active: "bg-positive",
    deleted: "bg-neutral-500",
    draft: "bg-action",
    ended: "bg-neutral-500",
    paused: "bg-primary",
  } as const;

  for (const [status, expectedClass] of Object.entries(expectedClassByStatus)) {
    const html = renderToStaticMarkup(<OrgRoleStatusDot status={status} />);
    assert.match(html, new RegExp(`class="[^"]*${expectedClass}`));
  }
});
