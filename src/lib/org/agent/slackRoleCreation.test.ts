import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMissingSlackRoleCreationThreadLinks,
  buildSlackRoleCreationWebUrl,
} from "@/lib/org/agent/slackRoleCreationMessages";

test("builds one web continuation URL for the linked workspace and role", () => {
  const url = new URL(
    buildSlackRoleCreationWebUrl({
      publicSiteUrl: "https://harper.example/base",
      roleId: "26d82bd5-595d-4fe9-ac7e-ff089ed9a28d",
      workspaceId: "f8f3e4af-0cc5-4709-965a-df49f434753c",
    })
  );
  assert.equal(url.origin, "https://harper.example");
  assert.equal(url.pathname, "/org/role");
  assert.equal(
    url.searchParams.get("orgId"),
    "f8f3e4af-0cc5-4709-965a-df49f434753c"
  );
  assert.equal(
    url.searchParams.get("roleId"),
    "26d82bd5-595d-4fe9-ac7e-ff089ed9a28d"
  );
});

test("appends an exact permalink when a draft role is mentioned without its link", () => {
  const permalink = "https://harper.example/org/role?orgId=workspace&roleId=role";
  const appended = appendMissingSlackRoleCreationThreadLinks({
    message: "현재 작성 중인 역할은 플랫폼 엔지니어입니다.",
    roles: [{ roleTitle: "플랫폼 엔지니어", threadPermalink: permalink }],
  });

  assert.match(
    appended,
    new RegExp(`<${permalink.replaceAll("?", "\\?")}\\|플랫폼 엔지니어 역할 등록 이어가기>`)
  );
  assert.equal(
    appendMissingSlackRoleCreationThreadLinks({
      message: appended,
      roles: [{ roleTitle: "플랫폼 엔지니어", threadPermalink: permalink }],
    }),
    appended
  );
});
