import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMissingSlackRoleCreationThreadLinks,
  buildSlackRoleCreationStartMessage,
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

test("Slack role-creation messages explain the dedicated thread and web continuation once", () => {
  const webUrl = "https://harper.example/org/role?orgId=workspace&roleId=role";
  const root = buildSlackRoleCreationStartMessage({
    roleTitle: "Staff <Engineer> & Lead",
    webUrl,
  });

  assert.match(
    root,
    /\*Staff &lt;Engineer&gt; &amp; Lead 역할 작성을 시작했어요\*/
  );
  assert.match(root, /방금 대화에서 받은 내용을 이 스레드로 옮겼어요/);
  assert.match(
    root,
    new RegExp(`<${webUrl.replace(/[?]/g, "\\?")}\\|웹에서 계속 작성하기>`)
  );
  assert.doesNotMatch(root, /Slack과 웹은 같은 작성 중 역할/);
  assert.equal(root.split(webUrl).length - 1, 1);
});

test("does not claim that transferred role input has already been organized", () => {
  const root = buildSlackRoleCreationStartMessage({
    roleTitle: "Founding Designer",
    webUrl: "https://harper.example/org/role?orgId=workspace&roleId=role",
  });
  assert.match(root, /정리하고 있어요/);
  assert.doesNotMatch(root, /정리했어요|초안을 만들었어요/);
});

test("appends an exact permalink when a draft role is mentioned without its link", () => {
  const permalink = "https://slack.example/archives/C1/p123";
  const appended = appendMissingSlackRoleCreationThreadLinks({
    message: "현재 작성 중인 역할은 플랫폼 엔지니어입니다.",
    roles: [{ roleTitle: "플랫폼 엔지니어", threadPermalink: permalink }],
  });

  assert.match(
    appended,
    new RegExp(`<${permalink}\\|플랫폼 엔지니어 역할 작성 스레드로 이동>`)
  );
  assert.equal(
    appendMissingSlackRoleCreationThreadLinks({
      message: appended,
      roles: [{ roleTitle: "플랫폼 엔지니어", threadPermalink: permalink }],
    }),
    appended
  );
});
