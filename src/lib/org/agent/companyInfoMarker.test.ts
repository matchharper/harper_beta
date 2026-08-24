import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureOrgAgentCompanyInfoMarker,
  ORG_AGENT_COMPANY_INFO_MARKER,
  parseOrgAgentCompanyInfoMarker,
  renderOrgAgentCompanyInfoSlackLink,
  splitOrgAgentCompanyInfoMarker,
} from "@/lib/org/agent/companyInfoMarker";

test("adds a missing company-information marker once", () => {
  assert.equal(
    ensureOrgAgentCompanyInfoMarker("회사 맥락을 바탕으로 초안을 작성했어요."),
    `회사 맥락을 바탕으로 초안을 작성했어요.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}`
  );
  assert.equal(
    ensureOrgAgentCompanyInfoMarker(
      `회사 맥락을 바탕으로 초안을 작성했어요.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}`
    ),
    `회사 맥락을 바탕으로 초안을 작성했어요.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}`
  );
});

test("extracts a standalone company information marker from an assistant reply", () => {
  assert.deepEqual(
    parseOrgAgentCompanyInfoMarker(
      `역할 설명을 작성했고, 회사 정보를 참고해서 설명을 강화했습니다.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}\n\n다음으로 선호 인재상을 알려주세요.`
    ),
    {
      hasCompanyInfo: true,
      text: "역할 설명을 작성했고, 회사 정보를 참고해서 설명을 강화했습니다.\n\n다음으로 선호 인재상을 알려주세요.",
    }
  );
});

test("renders one inline Slack company-information link at the marker", () => {
  assert.deepEqual(
    renderOrgAgentCompanyInfoSlackLink(
      `역할 설명을 저장했습니다.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}\n\n다음 질문입니다.`,
      "https://matchharper.com/org/team?orgId=workspace-1"
    ),
    {
      hasCompanyInfo: true,
      text: "역할 설명을 저장했습니다.\n\n<https://matchharper.com/org/team?orgId=workspace-1|회사 정보>를 반영했습니다.\n\n다음 질문입니다.",
    }
  );
});

test("preserves the marker position between the surrounding reply sections", () => {
  assert.deepEqual(
    splitOrgAgentCompanyInfoMarker(
      `회사 정보를 반영해 역할 설명을 강화했습니다.\n\n${ORG_AGENT_COMPANY_INFO_MARKER}\n\n이어서 매칭 기준도 정리했습니다.`
    ),
    [
      { kind: "text", text: "회사 정보를 반영해 역할 설명을 강화했습니다." },
      { kind: "company_info" },
      { kind: "text", text: "이어서 매칭 기준도 정리했습니다." },
    ]
  );
});

test("keeps persisted single-bracket markers compatible", () => {
  assert.deepEqual(
    splitOrgAgentCompanyInfoMarker(
      "회사 정보를 반영했습니다.\n\n[company_info]\n\n다음 질문입니다."
    ),
    [
      { kind: "text", text: "회사 정보를 반영했습니다." },
      { kind: "company_info" },
      { kind: "text", text: "다음 질문입니다." },
    ]
  );
});

test("does not treat inline or code-sample text as a company information card", () => {
  assert.deepEqual(
    parseOrgAgentCompanyInfoMarker("패턴은 [company_info]입니다."),
    {
      hasCompanyInfo: false,
      text: "패턴은 [company_info]입니다.",
    }
  );
  assert.deepEqual(
    parseOrgAgentCompanyInfoMarker("패턴은 [[company_info]]입니다."),
    {
      hasCompanyInfo: false,
      text: "패턴은 [[company_info]]입니다.",
    }
  );
  assert.deepEqual(parseOrgAgentCompanyInfoMarker("`[company_info]`"), {
    hasCompanyInfo: false,
    text: "`[company_info]`",
  });
  assert.deepEqual(
    parseOrgAgentCompanyInfoMarker("```text\n[[company_info]]\n```"),
    {
      hasCompanyInfo: false,
      text: "```text\n[[company_info]]\n```",
    }
  );
});
