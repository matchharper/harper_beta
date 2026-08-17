import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMissingSlackRoleCreationThreadLinks,
  buildSlackRoleCreationStartMessage,
  buildSlackRoleCreationThreadIntro,
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
  const webUrl =
    "https://harper.example/org/role?orgId=workspace&roleId=role";
  const root = buildSlackRoleCreationStartMessage({
    description: "플랫폼 <리드> & 채용",
    descriptionOrigin: "user_supplied",
    roleTitle: "Staff Engineer",
    webUrl,
  });
  const intro = buildSlackRoleCreationThreadIntro();

  assert.match(root, /🆕 \*새 역할을 같이 정리해볼게요\*/);
  assert.match(root, /Staff Engineer/);
  assert.match(root, /&lt;리드&gt; &amp; 채용/);
  assert.match(root, new RegExp(`<${webUrl.replace(/[?]/g, "\\?")}\\|웹에서 계속 작성하기>`));
  assert.doesNotMatch(root, /Slack과 웹은 같은 작성 중 역할/);
  assert.match(intro, /생각해둔 내용을 편하게 전부 적거나/);
  assert.match(intro, /JD/);
  assert.doesNotMatch(intro, /https?:\/\//);
  assert.equal(`${root}\n${intro}`.split(webUrl).length - 1, 1);
});

test("labels a Harper-authored Slack role description as a replaceable draft", () => {
  const root = buildSlackRoleCreationStartMessage({
    description: "초기 제품의 사용자 경험을 설계합니다.",
    descriptionOrigin: "same_company_public_jd",
    descriptionSourceUrl: "https://harper.example/careers/designer",
    roleTitle: "Founding Designer",
    webUrl: "https://harper.example/org/role?orgId=workspace&roleId=role",
  });
  const intro = buildSlackRoleCreationThreadIntro({
    descriptionOrigin: "same_company_public_jd",
  });

  assert.match(root, /공개 JD를 참고해 Harper가 정리한 초안/);
  assert.match(root, /참고한 공개 JD/);
  assert.match(root, /JD 링크·파일·텍스트/);
  assert.match(intro, /제가 먼저 정리한 역할 설명 초안/);
  assert.match(intro, /방향이 맞는지/);
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
