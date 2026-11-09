import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgRole } from "@/lib/org/server";

// 다시 진행하기 on the paused card asks first, like the role menu (M4).
test("the paused role card asks before resuming", async () => {
  const role = {
    roleId: "synthetic-role", workspaceId: "w", status: "paused", name: "ML Engineer",
  } as OrgRole;
  const resumed: string[] = [];
  const buttons: { label: string; onClick?: () => void }[] = [];
  let modal: { open: boolean; footer: ReactNode } | undefined;
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, ...args) {
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string, _en: string, values?: Record<string, string>) =>
        ko.replace(/\{(\w+)\}/g, (_, key) => values?.[key] ?? ""), locale: "ko" }),
    };
    if (name === "@/hooks/org/useOrgWorkspace") return {
      useOrgWorkspace: () => ({
        permissions: { canManageCandidates: true, canManageWorkspace: true },
        roles: [role],
        workspace: { workspaceId: "w" },
      }),
    };
    if (name === "@/hooks/org/useOrgBilling") return {
      useOrgEntitlements: () => ({ data: { activeRoles: 0, capacity: 3 }, isLoading: false }),
    };
    if (name === "@/hooks/org/useOrgRoleActions") return {
      useOrgRoleActions: () => ({
        resumeRole: (target: OrgRole) => resumed.push(target.roleId),
        roleActionPending: false,
      }),
    };
    if (name === "@/components/ui/button") return {
      MuteButton: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => {
        buttons.push({ label: String(children), onClick });
        return <button>{children}</button>;
      },
    };
    if (name === "next/link") return { __esModule: true, default: () => null };
    if (name === "@/components/common/TalentCareerModal") return {
      __esModule: true,
      default: (props: { open: boolean; footer: ReactNode }) => {
        modal = props;
        return <div data-modal={props.open ? "open" : "closed"}>{props.footer}</div>;
      },
    };
    return original.call(this, name, ...args);
  };
  let OrgRoleStatusCard: typeof import("./OrgRoleStatusCard")["OrgRoleStatusCard"];
  try {
    ({ OrgRoleStatusCard } = await import("./OrgRoleStatusCard"));
  } finally {
    loader._load = original;
  }
  renderToStaticMarkup(<OrgRoleStatusCard role={role} />);
  assert.equal(modal?.open, false);
  const [cardButton, , confirm] = buttons;
  assert.equal(cardButton.label, "다시 진행하기");
  // The card's button only opens the question.
  cardButton.onClick?.();
  assert.deepEqual(resumed, []);
  // The question's own 다시 진행하기 resumes the role.
  assert.equal(confirm.label, "다시 진행하기");
  confirm.onClick?.();
  assert.deepEqual(resumed, ["synthetic-role"]);
});
